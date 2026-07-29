// tests/planes.test.js
// La tabla de precios prometía features bloqueadas por plan (Calendar, MP,
// audio, límite de mensajes) que el código nunca hacía cumplir. Este test
// fija el contrato de config/planes.js — la fuente única de verdad que ahora
// usan bot.manager.js (gateo de credenciales) y quota.service.js (límite de
// mensajes).
'use strict';

const { PLANES, featuresDePlan } = require('../config/planes');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[planes] Tests:');

// ── Coincide con la tabla de precios real ───────────────────────
assert(PLANES.trial.mensajesMes === 100, 'trial: 100 mensajes/mes');
assert(PLANES.basico.mensajesMes === 500, 'básico: 500 mensajes/mes');
assert(PLANES.pro.mensajesMes === Infinity, 'pro: mensajes ilimitados');
assert(PLANES.agencia.mensajesMes === Infinity, 'agencia: mensajes ilimitados');

assert(PLANES.trial.calendar === false, 'trial: sin Google Calendar');
assert(PLANES.basico.calendar === false, 'básico: sin Google Calendar');
assert(PLANES.pro.calendar === true, 'pro: con Google Calendar');
assert(PLANES.agencia.calendar === true, 'agencia: con Google Calendar');

assert(PLANES.trial.mercadopago === false, 'trial: sin MercadoPago');
assert(PLANES.basico.mercadopago === false, 'básico: sin MercadoPago');
assert(PLANES.pro.mercadopago === true, 'pro: con MercadoPago');
assert(PLANES.agencia.mercadopago === true, 'agencia: con MercadoPago');

assert(PLANES.trial.audio === false, 'trial: sin respuestas por audio');
assert(PLANES.basico.audio === false, 'básico: sin respuestas por audio');
assert(PLANES.pro.audio === true, 'pro: con respuestas por audio');
assert(PLANES.agencia.audio === true, 'agencia: con respuestas por audio');

// ── featuresDePlan: fallback seguro ─────────────────────────────
assert(featuresDePlan('trial') === PLANES.trial, 'featuresDePlan devuelve el objeto correcto para "trial"');
assert(featuresDePlan('agencia') === PLANES.agencia, 'featuresDePlan devuelve el objeto correcto para "agencia"');
assert(featuresDePlan('algo-que-no-existe') === PLANES.trial, 'plan desconocido cae al más restrictivo (trial), no al más permisivo');
assert(featuresDePlan(undefined) === PLANES.trial, 'plan undefined cae a trial, no rompe');
assert(featuresDePlan(null) === PLANES.trial, 'plan null cae a trial, no rompe');

console.log('\n✅ Todos los tests de planes pasaron.\n');
