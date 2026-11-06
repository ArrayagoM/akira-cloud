// tests/silencio.test.js — reglas del chat silenciado (pausar un chat para que el bot no conteste).
'use strict';
const { EventEmitter } = require('events');
const { debeCallar, emitirATodas } = require('../main/bot-engine/services/bot/silencio');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

console.log('\n[silencio] Tests:');

assert(debeCallar({ silenciado: true }) === true, 'cliente silenciado: el bot se calla');
assert(debeCallar({ silenciado: false }) === false, 'cliente activo: el bot contesta');
assert(debeCallar(null) === false && debeCallar(undefined) === false, 'cliente desconocido: no hay silencio que aplicar');
assert(debeCallar({ silenciado: 'true' }) === false && debeCallar({ silenciado: 1 }) === false, 'solo un true de verdad silencia (no texto ni número)');
// el mensaje del cliente nunca cambia la decisión: escribir "akira" ya no saltea el silencio
assert(debeCallar({ silenciado: true, historial: [{ content: 'hola akira' }] }) === true, 'el contenido del mensaje no influye en el silencio');

// la orden de silenciar llega a TODAS las cuentas activas
const a = new EventEmitter(); const b = new EventEmitter(); const rec = [];
a.on('cliente:silenciar', (p) => rec.push(['a', p.jid])); b.on('cliente:silenciar', (p) => rec.push(['b', p.jid]));
const n = emitirATodas(new Map([[0, a], [1, b]]), 'cliente:silenciar', { jid: 'x@s.whatsapp.net', silenciado: true });
assert(n === 2 && rec.length === 2, 'con dos cuentas de WhatsApp la orden llega a las dos (antes solo a la 0)');
assert(emitirATodas(new Map(), 'cliente:silenciar', {}) === 0, 'sin cuentas activas devuelve 0 (el llamador lo sabe)');
const rota = { emit() { throw new Error('boom'); } };
assert(emitirATodas(new Map([[0, rota], [1, b]]), 'cliente:silenciar', { jid: 'y' }) === 1, 'una cuenta con error no impide avisar a las demás');


// silencio MANUAL (pausa del dueño) vs AUTOMÁTICO (derivación): cuál sobrevive al reinicio y cuál se levanta solo
const { esManual, debeConservarAlArrancar, puedeAutoReactivar } = require('../main/bot-engine/services/bot/silencio');
assert(debeConservarAlArrancar({ silenciado: true, silenciadoManual: true }) === true, 'una pausa manual del dueño se conserva al reiniciar la app');
assert(debeConservarAlArrancar({ silenciado: true }) === false && debeConservarAlArrancar({ silenciado: true, silenciadoManual: false }) === false, 'un silencio sin marca (derivación automática o registro viejo) se levanta al reiniciar, como siempre');
assert(debeConservarAlArrancar({ silenciado: false, silenciadoManual: true }) === false && esManual(null) === false, 'una marca manual sin silencio no silencia a nadie');
assert(puedeAutoReactivar({ silenciado: true, silenciadoManual: true }) === false, 'si el dueño pausó el chat, NO se reactiva solo cuando él le escribe al cliente');
assert(puedeAutoReactivar({ silenciado: true }) === true && puedeAutoReactivar({ silenciado: false, silenciadoManual: true }) === true, 'el silencio automático sí se reactiva solo (30 min o respuesta del dueño)');
console.log('✅ silencio: OK');
