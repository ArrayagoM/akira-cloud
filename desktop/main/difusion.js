// main/difusion.js
// Mensajes del negocio a un GRUPO de clientes (reactivar inactivos, saludo de cumpleaños, promos por etiqueta).
// Reglas de seguridad (WhatsApp bloquea los números que mandan spam):
//   · SIEMPRE con confirmación del dueño: se ve quiénes son y el texto antes de enviar. Nada sale solo.
//   · Solo a clientes que ya hablaron con el bot o vinieron (los importados desde una planilla que nunca escribieron
//     quedan afuera salvo que el dueño los incluya a propósito).
//   · No a quien pidió la baja (respondió BAJA), ni a chats silenciados o bloqueados, ni a quien ya recibió un
//     mensaje de este tipo hace poco (por defecto 14 días).
//   · Envío lento y con tope diario (por defecto 40 por día, una pausa de 12–25 s entre mensajes).
//   · Todo mensaje lleva cómo darse de baja.
'use strict';

const fs = require('fs');
const path = require('path');

const MIN_DIAS_ENTRE_DIFUSIONES = 14;
const TOPE_DIARIO = 40;
const PAUSA_MIN_MS = 12000;
const PAUSA_MAX_MS = 25000;
const PIE_BAJA = '\n\n_Si no querés recibir más mensajes, respondé BAJA._';

const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const numeroDe = (jid) => (/@s\.whatsapp\.net$/.test(jid || '') ? String(jid).split('@')[0] : '');
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '').slice(0, 30);

// Mensajes sugeridos (el dueño los puede editar). {nombre} y {negocio} se reemplazan por cliente.
const PLANTILLAS = {
  inactivos: '¡Hola {nombre}! 👋 Hace un tiempo que no te vemos por {negocio} y queríamos saludarte. ¿Te reservo un turno? Escribime y lo vemos. 😊',
  cumple: '¡Feliz cumpleaños, {nombre}! 🎂🎉 De parte de todo el equipo de {negocio}, te deseamos un día hermoso. ¡Gracias por elegirnos!',
  etiqueta: '¡Hola {nombre}! 👋 Te escribimos de {negocio} para contarte una novedad. Cualquier duda, respondé este mensaje.',
};

// ¿El cliente está pidiendo que no le escribamos más? Solo mensajes que son EXACTAMENTE un pedido de baja
// (no "quiero dar de baja mi turno": eso es otra cosa).
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[¿?¡!.,;:()"*_]/g, ' ').replace(/\s+/g, ' ').trim();
const FRASES_BAJA = new Set(['baja', 'stop', 'basta', 'darme de baja', 'dar de baja', 'quiero la baja', 'quiero la baja de los mensajes', 'dame de baja', 'no quiero recibir mas mensajes', 'no quiero recibir mensajes', 'no me escriban mas', 'no me escribas mas', 'no me manden mas mensajes', 'no me envien mas mensajes', 'cancelar suscripcion', 'desuscribirme']);
const esPedidoDeBaja = (texto) => FRASES_BAJA.has(norm(texto));

function redactar(plantilla, cliente, { negocio = 'nuestro negocio' } = {}) {
  const nombre = primerNombre(cliente.nombre) || 'hola';
  let t = String(plantilla || '').replace(/\{nombre\}/gi, nombre).replace(/\{negocio\}/gi, negocio).trim();
  if (!t) return '';
  if (!/\bBAJA\b/.test(t)) t += PIE_BAJA;
  return t;
}

// ¿Se le puede escribir a este cliente? → { ok } | { ok:false, motivo }
function esElegible(c, ctx) {
  const num = numeroDe(c.jid);
  if (!num) return { ok: false, motivo: 'sin-numero' };
  if (c.noMolestar === true) return { ok: false, motivo: 'baja' };
  if (c.silenciado === true) return { ok: false, motivo: 'silenciado' };
  if (ctx.ignorados?.has(num)) return { ok: false, motivo: 'bloqueado' };
  const habloOVino = (c.historial || []).length > 0 || (c.turnosConfirmados || []).length > 0 || ctx.turnosPorTel?.has(num.slice(-10)) || c.origenImport !== true;
  if (!habloOVino && !ctx.incluirImportados) return { ok: false, motivo: 'nunca-hablo' };
  const ultima = ctx.ultimaDifusion?.[c.jid];
  const minDias = ctx.minDiasEntreDifusiones ?? MIN_DIAS_ENTRE_DIFUSIONES;
  if (ultima && (ctx.ahora.getTime() - ultima) / 86400000 < minDias) return { ok: false, motivo: 'reciente' };
  return { ok: true };
}

// Fecha de la última visita (turno confirmado) o, si nunca vino, de la última actividad en el chat.
function ultimaVisita(c, turnos, ahora = new Date()) {
  const t = (turnos || []).filter((x) => x.estado === 'confirmado' && x.ausente !== true).map((x) => new Date(x.fechaInicio).getTime()).filter((n) => !Number.isNaN(n) && n <= ahora.getTime());
  if (t.length) return new Date(Math.max(...t));
  return c.updatedAt ? new Date(c.updatedAt) : (c.createdAt ? new Date(c.createdAt) : null);
}

// cumple: "MM-DD"
function cumpleHoy(c, ahora) { return typeof c.cumple === 'string' && c.cumple === `${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`; }
function cumpleMes(c, ahora) { return typeof c.cumple === 'string' && c.cumple.slice(0, 2) === String(ahora.getMonth() + 1).padStart(2, '0'); }

// segmento: { tipo: 'inactivos'|'cumple-hoy'|'cumple-mes'|'etiqueta'|'todos', dias?, etiqueta? }
// → { elegibles: [{ jid, nombre }], excluidos: { motivo: n }, total }
function seleccionar(clientes, turnosPorTel, segmento, ctx) {
  const ahora = ctx.ahora || new Date();
  const c2 = { ...ctx, ahora, turnosPorTel: new Set([...turnosPorTel.keys()]) };
  const excluidos = {}; const elegibles = [];
  const dias = Math.max(1, Math.min(3650, parseInt(segmento.dias, 10) || 45));
  const etiqueta = String(segmento.etiqueta || '').trim().toLowerCase();
  for (const c of clientes) {
    let pertenece = false;
    if (segmento.tipo === 'todos') pertenece = true;
    else if (segmento.tipo === 'etiqueta') pertenece = !!etiqueta && (c.etiquetas || []).some((e) => String(e).toLowerCase() === etiqueta);
    else if (segmento.tipo === 'cumple-hoy') pertenece = cumpleHoy(c, ahora);
    else if (segmento.tipo === 'cumple-mes') pertenece = cumpleMes(c, ahora);
    else if (segmento.tipo === 'inactivos') {
      const num = numeroDe(c.jid).slice(-10);
      const u = ultimaVisita(c, turnosPorTel.get(num) || [], ahora);
      pertenece = !!u && (ahora.getTime() - u.getTime()) / 86400000 >= dias;
    }
    if (!pertenece) continue;
    const e = esElegible(c, c2);
    if (e.ok) elegibles.push({ jid: c.jid, nombre: c.nombre || '' });
    else excluidos[e.motivo] = (excluidos[e.motivo] || 0) + 1;
  }
  return { elegibles, excluidos, total: elegibles.length };
}

// ── Estado persistido (userData/difusion.json): cuántos se mandaron hoy y cuándo se le escribió a cada uno ──
const archivo = (dir) => path.join(dir, 'difusion.json');
function leerEstado(userDataDir, ahora = new Date()) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(userDataDir), 'utf8')); } catch { /* primera vez */ }
  const hoy = dia(ahora);
  return { fecha: hoy, enviadosHoy: j.fecha === hoy ? (j.enviadosHoy || 0) : 0, ultimaDifusion: j.ultimaDifusion || {} };
}
function guardarEstado(userDataDir, e) { fs.writeFileSync(archivo(userDataDir), JSON.stringify({ fecha: e.fecha, enviadosHoy: e.enviadosHoy, ultimaDifusion: e.ultimaDifusion })); }

// Servicio: cola de envío lenta, con tope diario y cancelable.
//   enviar(jid, texto) → Promise<boolean>   ·   esperar(ms) → Promise   ·   azar() → [0,1)
function crearServicio({ userDataDir, enviar, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), azar = Math.random, ahora = () => new Date(), tope = TOPE_DIARIO, log = () => {} }) {
  let corriendo = false; let cancelar = false;
  const progreso = { enCurso: false, total: 0, enviados: 0, fallidos: 0, saltados: 0, terminado: false, motivoCorte: null };

  const estado = () => { const e = leerEstado(userDataDir, ahora()); return { ...progreso, enviadosHoy: e.enviadosHoy, tope }; };

  async function iniciar(destinatarios, plantilla, { negocio = '' } = {}) {
    if (corriendo) throw Object.assign(new Error('Ya hay un envío en curso.'), { codigo: 'EN_CURSO' });
    if (!destinatarios.length) throw Object.assign(new Error('No hay a quién enviarle.'), { codigo: 'VACIO' });
    const e0 = leerEstado(userDataDir, ahora());
    const disponible = tope - e0.enviadosHoy;
    if (disponible <= 0) throw Object.assign(new Error(`Ya llegaste al tope de ${tope} mensajes por día. Seguí mañana: así cuidamos tu número de WhatsApp.`), { codigo: 'TOPE' });
    const lista = destinatarios.slice(0, disponible);
    Object.assign(progreso, { enCurso: true, total: lista.length, enviados: 0, fallidos: 0, saltados: destinatarios.length - lista.length, terminado: false, motivoCorte: lista.length < destinatarios.length ? 'tope' : null });
    corriendo = true; cancelar = false;
    // se ejecuta en segundo plano; el que llama recibe el estado inicial
    (async () => {
      try {
        for (let i = 0; i < lista.length; i++) {
          if (cancelar) { progreso.motivoCorte = 'cancelado'; break; }
          const d = lista[i];
          const texto = redactar(plantilla, { nombre: d.nombre }, { negocio });
          let ok = false;
          try { ok = await enviar(d.jid, texto); } catch (err) { log('[difusion] error', err.message); }
          const e = leerEstado(userDataDir, ahora());
          if (ok) { e.enviadosHoy++; e.ultimaDifusion[d.jid] = ahora().getTime(); guardarEstado(userDataDir, e); progreso.enviados++; } else progreso.fallidos++;
          if (!ok && progreso.fallidos >= 3 && progreso.enviados === 0) { progreso.motivoCorte = 'sin-conexion'; break; } // el bot no está conectado: no insistir
          if (i < lista.length - 1) await esperar(PAUSA_MIN_MS + Math.floor(azar() * (PAUSA_MAX_MS - PAUSA_MIN_MS)));
        }
      } finally { progreso.enCurso = false; progreso.terminado = true; corriendo = false; }
    })();
    return estado();
  }

  const detener = () => { cancelar = true; };
  return { iniciar, detener, estado, leerEstado: () => leerEstado(userDataDir, ahora()) };
}

module.exports = { esPedidoDeBaja, PLANTILLAS, PIE_BAJA, MIN_DIAS_ENTRE_DIFUSIONES, TOPE_DIARIO, redactar, esElegible, ultimaVisita, seleccionar, primerNombre, numeroDe, leerEstado, guardarEstado, crearServicio, cumpleHoy, cumpleMes };
