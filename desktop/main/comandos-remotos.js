// main/comandos-remotos.js
// Control remoto MÍNIMO desde el celular (app móvil de Akira): pausar/reanudar el bot y modo vacaciones.
// Es OPCIONAL y viene apagado: mientras no lo actives, esta PC no consulta nada. Si lo activás, cada ~1 minuto
// pregunta a la nube si hay una orden pendiente (las órdenes vencen a los 10 min y solo las puede mandar tu
// cuenta). Los datos del negocio y la sesión de WhatsApp NUNCA salen de la PC.
'use strict';

const fs = require('fs');
const path = require('path');

const TIPOS = ['bot-pausar', 'bot-reanudar', 'vacaciones-on', 'vacaciones-off'];
const archivo = (dir) => path.join(dir, 'celular.json');
const archivoPausa = (dir) => path.join(dir, 'pausa-remota.json');

function leerConfig(userDataDir) { try { return JSON.parse(fs.readFileSync(archivo(userDataDir), 'utf8')); } catch { return {}; } }
const activo = (userDataDir) => leerConfig(userDataDir).activo === true;
function guardarActivo(userDataDir, valor) { fs.writeFileSync(archivo(userDataDir), JSON.stringify({ activo: valor === true, cambiadoEn: new Date().toISOString() })); }

// acciones: { pausarBot(): Promise<number[]>, reanudarBot(slots): Promise, vacaciones(bool): Promise }
const AVISO_FALLO_CADA_MS = 30 * 60 * 1000; // un fallo repetido de conexión se anota a lo sumo cada 30 min (que el registro no se llene)
const TIMEOUT_ORDEN_MS = 30 * 1000;          // una orden (pausar/reanudar/vacaciones) que no termina en 30 s cuenta como fallo: antes una acción colgada dejaba el control remoto muerto hasta reiniciar
const TIMEOUT_PRODUCTO_MS = 60 * 1000;       // importar un producto puede incluir leer la foto con la IA (hasta ~30 s): se le da más aire
const MAX_EN_CURSO_MS = 3 * 60 * 1000;       // si un sondeo lleva más de esto "en curso", se lo da por colgado y se libera para poder sondear de nuevo

const TIEMPO_AGOTADO = Symbol('tiempo-agotado');
const textoDuracion = (ms) => (ms >= 1000 ? Math.round(ms / 1000) + ' s' : ms + ' ms');

function crearServicio({ userDataDir, llamar, acciones, log = () => {}, setI = setInterval, cadaMs = 60 * 1000, ahoraMs = () => Date.now(), timeoutOrdenMs = TIMEOUT_ORDEN_MS, timeoutProductoMs = TIMEOUT_PRODUCTO_MS, maxEnCursoMs = MAX_EN_CURSO_MS }) {
  let timer = null; let enCurso = false; let hechos = []; let productosHechos = []; let avisadoApagado = false; let sondeos = 0; let ultimoAvisoFallo = 0;
  let enCursoDesde = 0; let generacion = 0; // generacion: cada vez que se libera un sondeo colgado sube, y el sondeo viejo (si algún día termina) ya no toca el estado
  const diag = { fallosSondeo: 0, ordenesOk: 0, ordenesFallidas: 0, tiemposAgotados: 0, liberaciones: 0, ultimoSondeoEn: null };

  // Corre una acción con límite de tiempo. Si se pasa, resuelve TIEMPO_AGOTADO (la acción sigue por su cuenta, pero ya no se espera).
  async function conLimite(promesa, ms) {
    let t;
    const limite = new Promise((resolve) => { t = setTimeout(() => resolve(TIEMPO_AGOTADO), ms); });
    try { return await Promise.race([promesa, limite]); } finally { clearTimeout(t); }
  }

  // Producto cargado desde el celular (con foto): lo guarda en el Catálogo de esta PC. Si no hay importador, lo informa como fallido.
  async function ejecutarProductoSinLimite(p) {
    try {
      if (!p || typeof p.id !== 'string') return { id: '', ok: false, detalle: 'producto inválido' };
      if (typeof acciones.importarProducto !== 'function') return { id: p.id, ok: false, detalle: 'esta versión no recibe productos' };
      const detalle = await acciones.importarProducto(p);
      return { id: p.id, ok: true, detalle: String(detalle || 'guardado').slice(0, 100) };
    } catch (e) { return { id: p && p.id, ok: false, detalle: String(e.message).slice(0, 100) }; }
  }
  async function ejecutarProducto(p) {
    const inicio = ahoraMs();
    const r = await conLimite(ejecutarProductoSinLimite(p), timeoutProductoMs);
    const h = r === TIEMPO_AGOTADO ? (diag.tiemposAgotados++, { id: p && typeof p.id === 'string' ? p.id : '', ok: false, detalle: 'tiempo agotado (' + textoDuracion(timeoutProductoMs) + ')' }) : r;
    h.ok ? diag.ordenesOk++ : diag.ordenesFallidas++;
    log('[celular] producto', h.ok ? 'OK' : 'FALLÓ ' + h.detalle, 'id=' + (h.id || '-'), (ahoraMs() - inicio) + 'ms');
    return h;
  }

  async function ejecutarSinLimite(c) {
    try {
      if (!TIPOS.includes(c.tipo)) return { id: c.id, ok: false, detalle: 'comando desconocido' };
      if (c.tipo === 'bot-pausar') {
        const slots = await acciones.pausarBot();
        // Si no había ningún bot activo no se detuvo nada: se informa como fallo (antes la app del celular decía "Listo" igual).
        if (!slots.length) return { id: c.id, ok: false, detalle: 'no había ningún bot activo para pausar' };
        fs.writeFileSync(archivoPausa(userDataDir), JSON.stringify({ slots }));
        return { id: c.id, ok: true, detalle: `${slots.length} cuenta(s) pausada(s)` };
      }
      if (c.tipo === 'bot-reanudar') {
        let slots = [0]; try { slots = JSON.parse(fs.readFileSync(archivoPausa(userDataDir), 'utf8')).slots || [0]; } catch { /* sin pausa previa: cuenta principal */ }
        await acciones.reanudarBot(slots.length ? slots : [0]);
        try { fs.unlinkSync(archivoPausa(userDataDir)); } catch { /* ya no está */ }
        return { id: c.id, ok: true, detalle: 'bot reanudado' };
      }
      await acciones.vacaciones(c.tipo === 'vacaciones-on');
      return { id: c.id, ok: true, detalle: c.tipo === 'vacaciones-on' ? 'modo vacaciones activado' : 'modo vacaciones desactivado' };
    } catch (e) { return { id: c.id, ok: false, detalle: String(e.message).slice(0, 100) }; }
  }
  // Cada orden: con límite de tiempo (si se cuelga cuenta como fallo y se confirma así a la nube) y con una línea de registro.
  async function ejecutar(c0) {
    const c = c0 && typeof c0 === 'object' ? c0 : {};
    const inicio = ahoraMs();
    const r = await conLimite(ejecutarSinLimite(c), timeoutOrdenMs);
    const h = r === TIEMPO_AGOTADO ? (diag.tiemposAgotados++, { id: c.id, ok: false, detalle: 'tiempo agotado (' + textoDuracion(timeoutOrdenMs) + ')' }) : r;
    h.ok ? diag.ordenesOk++ : diag.ordenesFallidas++;
    log('[celular] comando', c.tipo, h.ok ? 'OK' : 'FALLÓ ' + h.detalle, 'id=' + (c.id || '-'), (ahoraMs() - inicio) + 'ms');
    return h;
  }

  // Una consulta a la nube. Si está apagado, avisa UNA vez que el control está desactivado y se queda quieto.
  async function sondear() {
    if (enCurso && ahoraMs() - enCursoDesde > maxEnCursoMs) {
      // Vigilante: "enCurso" solo se baja en el finally; si algo se colgó para siempre, el control remoto quedaba muerto hasta reiniciar la app.
      log('[celular] un sondeo llevaba más de ' + textoDuracion(maxEnCursoMs) + ' sin terminar: se lo da por colgado y se vuelve a sondear');
      enCurso = false; generacion++; diag.liberaciones++;
    }
    if (enCurso) return null;
    const on = activo(userDataDir);
    if (!on && avisadoApagado) return null;
    enCurso = true; enCursoDesde = ahoraMs();
    const miGen = generacion;
    const vigente = () => miGen === generacion;
    try {
      const r = await llamar({ celularActivo: on, hechos, productosHechos });
      if (!vigente()) return null; // este sondeo ya fue dado por colgado y reemplazado
      hechos = []; productosHechos = [];
      if (!on) { avisadoApagado = true; return []; }
      avisadoApagado = false; sondeos++; diag.ultimoSondeoEn = new Date(ahoraMs()).toISOString();
      const lista = Array.isArray(r?.comandos) ? r.comandos.slice(0, 5) : [];
      const nuevos = [];
      // Cada orden renueva el reloj del vigilante: un sondeo con varias órdenes lentas (cada una acotada por su propio límite) no es un sondeo colgado.
      for (const c of lista) { if (!vigente()) break; enCursoDesde = ahoraMs(); nuevos.push(await ejecutar(c)); }
      if (!vigente()) { hechos = hechos.concat(nuevos); return nuevos; } // reemplazado mientras ejecutaba: que al menos sus resultados se confirmen
      hechos = nuevos;
      const productos = Array.isArray(r?.productos) ? r.productos.slice(0, 4) : [];
      const nuevosProductos = [];
      for (const p of productos) { if (!vigente()) break; enCursoDesde = ahoraMs(); nuevosProductos.push(await ejecutarProducto(p)); }
      if (!vigente()) { productosHechos = productosHechos.concat(nuevosProductos.filter((h) => h.id)); return nuevos; }
      productosHechos = nuevosProductos.filter((h) => h.id);
      enCurso = false;
      if (nuevos.length || productosHechos.length) await sondear(); // confirma enseguida a la nube (que la app vea "hecho" sin esperar un minuto)
      return nuevos;
    } catch (e) {
      if (vigente()) diag.fallosSondeo++;
      // sin internet / servidor: reintenta en el próximo ciclo (las órdenes vencen solas). Pero se deja anotado: antes fallaba en silencio y
      // nadie podía saber por qué una orden del celular no llegaba a la PC.
      if (ahoraMs() - ultimoAvisoFallo >= AVISO_FALLO_CADA_MS) { ultimoAvisoFallo = ahoraMs(); log('[celular] no se pudo consultar órdenes a la nube: ' + String(e && e.message).slice(0, 120)); }
      return null;
    } finally { if (vigente()) enCurso = false; }
  }

  function configurar(valor) {
    guardarActivo(userDataDir, valor);
    if (!valor) avisadoApagado = false; // que el próximo sondeo le avise a la nube que quedó apagado
    sondear().catch(() => {});
    return { activo: activo(userDataDir) };
  }

  const programar = () => { timer = setI(() => { sondear().catch(() => {}); }, cadaMs); sondear().catch(() => {}); };
  const detener = () => { if (timer) clearInterval(timer); };

  return { sondear, configurar, programar, detener, estado: () => ({ activo: activo(userDataDir) }), _sondeos: () => sondeos,
    // Solo lectura, para diagnóstico: cuántos sondeos buenos hubo, cuántas órdenes salieron bien/mal, cuántas se colgaron y cuántas veces el vigilante liberó un sondeo.
    diagnostico: () => ({ sondeos, ...diag, enCurso }) };
}

module.exports = { crearServicio, activo, TIPOS };
