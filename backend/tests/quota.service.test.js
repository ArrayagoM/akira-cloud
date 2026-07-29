// tests/quota.service.test.js
// Tests de la lógica PURA del cupo de mensajes/mes (calcularNuevoConteo,
// mesActual). registrarMensajeYVerificarCupo() en sí hace I/O real a Mongo
// (User.findById/findByIdAndUpdate) y no se testea acá — separamos la
// decisión ("¿arranco de 1 o sigo sumando?") de la persistencia justamente
// para poder testearla sin una DB real.
'use strict';

const { calcularNuevoConteo, mesActual } = require('../services/bot/quota.service');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[quota.service] Tests:');

// ── calcularNuevoConteo ──────────────────────────────────────────
assert(calcularNuevoConteo('2026-07', 5, '2026-07') === 6, 'mismo mes: suma 1 al conteo guardado');
assert(calcularNuevoConteo('2026-07', 99, '2026-07') === 100, 'mismo mes: suma 1 aunque esté cerca del límite (el chequeo de límite es aparte)');
assert(calcularNuevoConteo('2026-06', 99, '2026-07') === 1, 'mes nuevo: resetea a 1, no sigue sumando sobre el mes viejo');
assert(calcularNuevoConteo('', 0, '2026-07') === 1, 'primera vez (sin mes guardado): arranca en 1');
assert(calcularNuevoConteo(undefined, undefined, '2026-07') === 1, 'usuario sin campos previos (undefined): arranca en 1, no rompe');
assert(calcularNuevoConteo('2026-07', 0, '2026-07') === 1, 'mismo mes, conteo en 0: primer mensaje del mes cuenta como 1');
assert(calcularNuevoConteo('2025-12', 500, '2026-01') === 1, 'cambio de año calendario también resetea');

// ── mesActual ────────────────────────────────────────────────────
assert(mesActual(new Date(Date.UTC(2026, 6, 15))) === '2026-07', 'mesActual formatea julio como "2026-07"');
assert(mesActual(new Date(Date.UTC(2026, 0, 1))) === '2026-01', 'mesActual rellena el mes con cero (enero → "01", no "1")');
assert(mesActual(new Date(Date.UTC(2026, 11, 31))) === '2026-12', 'mesActual formatea diciembre como "2026-12"');
assert(typeof mesActual() === 'string' && /^\d{4}-\d{2}$/.test(mesActual()), 'mesActual() sin argumentos devuelve el formato correcto para "ahora"');

console.log('\n✅ Todos los tests de quota.service pasaron.\n');
