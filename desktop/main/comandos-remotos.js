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

function crearServicio({ userDataDir, llamar, acciones, log = () => {}, setI = setInterval, cadaMs = 60 * 1000, ahoraMs = () => Date.now() }) {
  let timer = null; let enCurso = false; let hechos = []; let productosHechos = []; let avisadoApagado = false; let sondeos = 0; let ultimoAvisoFallo = 0;

  // Producto cargado desde el celular (con foto): lo guarda en el Catálogo de esta PC. Si no hay importador, lo informa como fallido.
  async function ejecutarProducto(p) {
    try {
      if (!p || typeof p.id !== 'string') return { id: '', ok: false, detalle: 'producto inválido' };
      if (typeof acciones.importarProducto !== 'function') return { id: p.id, ok: false, detalle: 'esta versión no recibe productos' };
      const detalle = await acciones.importarProducto(p);
      return { id: p.id, ok: true, detalle: String(detalle || 'guardado').slice(0, 100) };
    } catch (e) { return { id: p && p.id, ok: false, detalle: String(e.message).slice(0, 100) }; }
  }

  async function ejecutar(c) {
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

  // Una consulta a la nube. Si está apagado, avisa UNA vez que el control está desactivado y se queda quieto.
  async function sondear() {
    if (enCurso) return null;
    const on = activo(userDataDir);
    if (!on && avisadoApagado) return null;
    enCurso = true;
    try {
      const r = await llamar({ celularActivo: on, hechos, productosHechos });
      hechos = []; productosHechos = [];
      if (!on) { avisadoApagado = true; return []; }
      avisadoApagado = false; sondeos++;
      const lista = Array.isArray(r?.comandos) ? r.comandos.slice(0, 5) : [];
      const nuevos = [];
      for (const c of lista) { const h = await ejecutar(c); nuevos.push(h); log('[celular] comando', c.tipo, h.ok ? 'OK' : 'FALLÓ ' + h.detalle); }
      hechos = nuevos;
      const productos = Array.isArray(r?.productos) ? r.productos.slice(0, 4) : [];
      const nuevosProductos = [];
      for (const p of productos) { const h = await ejecutarProducto(p); nuevosProductos.push(h); log('[celular] producto', h.ok ? 'OK' : 'FALLÓ ' + h.detalle); }
      productosHechos = nuevosProductos.filter((h) => h.id);
      enCurso = false;
      if (nuevos.length || productosHechos.length) await sondear(); // confirma enseguida a la nube (que la app vea "hecho" sin esperar un minuto)
      return nuevos;
    } catch (e) {
      // sin internet / servidor: reintenta en el próximo ciclo (las órdenes vencen solas). Pero se deja anotado: antes fallaba en silencio y
      // nadie podía saber por qué una orden del celular no llegaba a la PC.
      if (ahoraMs() - ultimoAvisoFallo >= AVISO_FALLO_CADA_MS) { ultimoAvisoFallo = ahoraMs(); log('[celular] no se pudo consultar órdenes a la nube: ' + String(e && e.message).slice(0, 120)); }
      return null;
    } finally { enCurso = false; }
  }

  function configurar(valor) {
    guardarActivo(userDataDir, valor);
    if (!valor) avisadoApagado = false; // que el próximo sondeo le avise a la nube que quedó apagado
    sondear().catch(() => {});
    return { activo: activo(userDataDir) };
  }

  const programar = () => { timer = setI(() => { sondear().catch(() => {}); }, cadaMs); sondear().catch(() => {}); };
  const detener = () => { if (timer) clearInterval(timer); };

  return { sondear, configurar, programar, detener, estado: () => ({ activo: activo(userDataDir) }), _sondeos: () => sondeos };
}

module.exports = { crearServicio, activo, TIPOS };
