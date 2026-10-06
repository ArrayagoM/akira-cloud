// tests/license.service.test.js
// Cubre calcularVigencia (replica pura de User.planVigente() + expiración
// exacta) y los límites por plan — es el chequeo que decide si el software
// de escritorio arranca o no, así que necesita el mismo nivel de cobertura
// adversarial que quota.service.test.js.
'use strict';

const {
  calcularVigencia,
  slotsMaxDePlan,
  dispositivosMaxDePlan,
  SLOTS_POR_PLAN,
  DISPOSITIVOS_POR_PLAN,
  planEfectivo,
} = require('../services/license.service');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[license.service] Tests:');

const AHORA = new Date('2026-06-15T12:00:00Z');

// ── esTester / admin: siempre vigente, sin importar fechas ──────
assert(calcularVigencia({ esTester: true, plan: 'trial', trialExpira: new Date('2020-01-01') }, AHORA).vigente === true, 'esTester siempre vigente, aunque el trial haya vencido hace años');
assert(calcularVigencia({ rol: 'admin', plan: 'basico', planExpira: new Date('2020-01-01') }, AHORA).vigente === true, 'rol admin siempre vigente, aunque el plan haya vencido');
assert(calcularVigencia({ plan: 'admin' }, AHORA).vigente === true, 'plan "admin" siempre vigente sin necesitar planExpira');

// ── trial: contra trialExpira ────────────────────────────────────
assert(calcularVigencia({ plan: 'trial', trialExpira: new Date('2026-07-01') }, AHORA).vigente === true, 'trial vigente: trialExpira en el futuro');
assert(calcularVigencia({ plan: 'trial', trialExpira: new Date('2026-01-01') }, AHORA).vigente === false, 'trial vencido: trialExpira en el pasado');
assert(calcularVigencia({ plan: 'trial', trialExpira: null }, AHORA).vigente === false, 'trial sin trialExpira: no vigente, no rompe');

// ── plan pago: contra planExpira ─────────────────────────────────
assert(calcularVigencia({ plan: 'pro', planExpira: new Date('2026-07-01') }, AHORA).vigente === true, 'pro vigente: planExpira en el futuro');
assert(calcularVigencia({ plan: 'pro', planExpira: new Date('2026-01-01') }, AHORA).vigente === false, 'pro vencido: planExpira en el pasado');
assert(calcularVigencia({ plan: 'pro', planExpira: null }, AHORA).vigente === false, 'pro sin planExpira: no vigente, no rompe (ej. nunca pagó)');

// ── expira: devuelve la fecha real, no solo el booleano ──────────
const r = calcularVigencia({ plan: 'trial', trialExpira: new Date('2026-07-01T00:00:00Z') }, AHORA);
assert(r.expira.getTime() === new Date('2026-07-01T00:00:00Z').getTime(), 'calcularVigencia expone la fecha exacta de expiración, no solo vigente/no-vigente');
assert(calcularVigencia({ esTester: true, plan: 'trial' }, AHORA).expira === null, 'tester/admin: expira null (no aplica ventana de gracia offline)');

// ── límites por plan ──────────────────────────────────────────────
assert(slotsMaxDePlan('agencia') === 5, 'agencia permite hasta 5 cuentas de WhatsApp (slots)');
assert(slotsMaxDePlan('trial') === 1, 'trial permite 1 sola cuenta de WhatsApp');
assert(slotsMaxDePlan('plan-inexistente') === 1, 'plan desconocido cae al mínimo (1 slot), no al máximo');

assert(dispositivosMaxDePlan('agencia') === 2, 'agencia permite hasta 2 instalaciones activas');
assert(dispositivosMaxDePlan('trial') === 1, 'trial permite 1 sola instalación activa');
assert(dispositivosMaxDePlan('plan-inexistente') === 1, 'plan desconocido cae al mínimo (1 dispositivo), no a acceso ilimitado');

assert(SLOTS_POR_PLAN.agencia === 5 && DISPOSITIVOS_POR_PLAN.agencia === 2, 'las tablas de límites exponen sus valores crudos para depuración/admin');

console.log('\n✅ Todos los tests de license.service pasaron.\n');
