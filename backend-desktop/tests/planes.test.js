// tests/planes.test.js — copia de backend/tests/planes.test.js, mismo contrato.
'use strict';

const { PLANES, featuresDePlan } = require('../config/planes');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[planes] Tests:');

assert(PLANES.trial.mensajesMes === 100, 'trial: 100 mensajes/mes');
assert(PLANES.basico.mensajesMes === 500, 'básico: 500 mensajes/mes');
assert(PLANES.pro.mensajesMes === Infinity, 'pro: mensajes ilimitados');
assert(PLANES.agencia.mensajesMes === Infinity, 'agencia: mensajes ilimitados');

assert(PLANES.trial.calendar === false, 'trial: sin Google Calendar');
assert(PLANES.pro.calendar === true, 'pro: con Google Calendar');

assert(PLANES.trial.mercadopago === false, 'trial: sin MercadoPago');
assert(PLANES.pro.mercadopago === true, 'pro: con MercadoPago');

assert(featuresDePlan('algo-que-no-existe') === PLANES.trial, 'plan desconocido cae al más restrictivo (trial)');
assert(featuresDePlan(undefined) === PLANES.trial, 'plan undefined cae a trial, no rompe');

console.log('\n✅ Todos los tests de planes (backend-desktop) pasaron.\n');
