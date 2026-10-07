// tests/vigilante-bot.test.js — caídas del bot: qué estado se informa a la nube y cuándo se avisa.
// (El aviso NO puede salir por WhatsApp: justamente WhatsApp es lo que se cayó.)
'use strict';
const { construirEstado } = require('../main/estado-bot');
const { crearVigilante, GRACIA_MS } = require('../main/vigilante-bot');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

// ── estado que se informa ──
console.log('\n[vigilante-bot] Tests:');
const base = () => ({ deseados: new Set([0]), activos: new Set([0]), conectados: new Set(), sesionExpirada: new Set(), huboConexion: new Set(), desde: new Map(), tieneSesion: () => true, ahora: 1_000_000 });
let e = construirEstado({ ...base(), conectados: new Set([0]) });
assert(e.slots.length === 1 && e.slots[0].conectado && e.slots[0].deseado && e.slots[0].desdeMs === 0, 'conectado: deseado, activo y sin tiempo caído');
e = construirEstado({ ...base(), desde: new Map([[0, 1_000_000 - 240_000]]) });
assert(e.slots[0].conectado === false && e.slots[0].desdeMs === 240_000, 'desconectado: informa hace cuánto');
e = construirEstado({ ...base(), tieneSesion: () => false, desde: new Map([[0, 1]]) });
assert(e.slots[0].deseado === false, 'esperando el PRIMER QR (sin sesión guardada) → no se considera caída');
e = construirEstado({ ...base(), tieneSesion: () => false, huboConexion: new Set([0]) });
assert(e.slots[0].deseado === true, 'si ya se había conectado en esta ejecución, sí cuenta');
e = construirEstado({ ...base(), deseados: new Set(), activos: new Set([0]) });
assert(e.slots[0].deseado === false && e.slots[0].activo === true, 'activo pero que el usuario no quiere (lo detuvo) → no deseado');
e = construirEstado({ ...base(), deseados: new Set([0, 2]), activos: new Set([0]) });
assert(e.slots.map((s) => s.slot).join() === '0,2' && e.slots[1].activo === false, 'lista también las cuentas deseadas que no arrancaron');
e = construirEstado({ ...base(), sesionExpirada: new Set([0]) });
assert(e.slots[0].requiereQR === true, 'informa si WhatsApp pide QR nuevo');
assert(construirEstado({ ...base(), pausado: true }).pausado === true, 'informa si el bot está pausado por la licencia');
assert(!JSON.stringify(construirEstado(base())).match(/jid|nombre|telefono|@s\.whatsapp/), 'el estado no contiene datos de clientes');

// ── vigilante con timers simulados ──
function montar(opts = {}) {
  const log = { notis: [], latidos: 0 }; const timers = new Map(); let id = 0; let caido = true;
  const v = crearVigilante({
    estaCaido: () => caido,
    pedirLatido: () => { log.latidos++; },
    notificar: (t, b) => log.notis.push({ t, b }),
    setT: (fn) => { timers.set(++id, fn); return id; },
    clearT: (i) => timers.delete(i),
    ...opts,
  });
  return { v, log, timers, disparar: () => { const fns = [...timers.values()]; timers.clear(); fns.forEach((f) => f()); }, setCaido: (x) => { caido = x; } };
}

assert(GRACIA_MS > 180_000, 'la espera de la PC es un poco mayor que los 3 min del servidor (para que el servidor ya lo considere caída)');

let m = montar();
m.v.alCambiar({ slot: 0, estado: 'desconectado' });
assert(m.log.notis.length === 0 && m.log.latidos === 0, 'se desconecta: todavía NO avisa (suele reconectarse solo en segundos)');
m.disparar();
assert(m.log.notis.length === 1 && /dejó de atender/.test(m.log.notis[0].t) && m.log.latidos === 1, 'pasada la gracia y sigue caído → aviso de Windows + señal de vida inmediata a la nube');

m = montar();
m.v.alCambiar({ slot: 0, estado: 'desconectado' });
m.v.alCambiar({ slot: 0, estado: 'conectado' });
m.disparar();
assert(m.log.notis.length === 0, 'si se reconecta dentro de la gracia → no molesta con ningún aviso');

m = montar();
m.v.alCambiar({ slot: 0, estado: 'desconectado' });
m.setCaido(false); m.disparar();
assert(m.log.notis.length === 0, 'al vencer la gracia verifica que siga caído (no avisa si ya volvió)');

m = montar();
m.v.alCambiar({ slot: 0, estado: 'desconectado', requiereQR: true });
assert(m.log.notis.length === 1 && /QR/.test(m.log.notis[0].b) && m.log.latidos === 1, 'si WhatsApp pide QR nuevo → avisa YA (hay que intervenir)');
m.v.alCambiar({ slot: 0, estado: 'desconectado', requiereQR: true });
assert(m.log.notis.length === 1, 'sin repetir el aviso');

m = montar();
m.v.alCambiar({ slot: 0, estado: 'desconectado' });
m.v.alCambiar({ slot: 0, estado: 'desconectado' }); m.v.alCambiar({ slot: 0, estado: 'desconectado' });
assert(m.v._pendientes() === 1, 'reintentos fallidos de un corte largo NO reinician la espera (el aviso no se posterga para siempre)');
m.disparar();
m.v.alCambiar({ slot: 0, estado: 'desconectado' }); m.disparar();
assert(m.log.notis.length === 1, 'y una vez avisado no se vuelve a avisar por el mismo corte');

m = montar();
m.v.alCambiar({ slot: 0, estado: 'desconectado' }); m.disparar();
m.v.alCambiar({ slot: 0, estado: 'conectado' });
assert(m.log.notis.length === 2 && /volvió/.test(m.log.notis[1].t) && m.log.latidos === 2, 'cuando vuelve avisa "volvió" y manda señal de vida para cerrar el incidente en la nube');

m = montar();
m.v.alCambiar({ slot: 0, estado: 'conectado' });
assert(m.log.notis.length === 0 && m.log.latidos === 1, 'una conexión normal no avisa nada (solo sincroniza el estado con la nube)');

m = montar();
m.v.alCambiar({ slot: 0, estado: 'desconectado' }); m.disparar();
m.v.alCambiar({ slot: 0, estado: 'detenido' });
assert(m.log.notis.length === 1 && m.v._avisados().length === 0, 'si el usuario detiene el bot a propósito, no hay falso "volvió"');
assert(m.log.latidos === 2, 'pero sí se informa a la nube para cerrar el incidente');

m = montar();
m.v.alCambiar({ slot: 1, estado: 'desconectado', requiereQR: true });
assert(/cuenta 2/.test(m.log.notis[0].t), 'con varias cuentas de WhatsApp dice cuál se cayó');

console.log('\n✅ vigilante-bot OK\n');
