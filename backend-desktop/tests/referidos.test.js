// tests/referidos.test.js
// El sistema de referidos existía a medio construir: el código de un
// referido se validaba y se guardaba un Referido con estado 'pendiente',
// pero NADA en el flujo real de pago (checkout, /return, /verificar-pago,
// /webhook) aplicaba el descuento ni acreditaba al referente — el
// checkout siempre cobraba el precio de lista completo, y ningún camino
// de confirmación de pago tocaba creditoReferidos. Este archivo cubre la
// lógica PURA que conecta ambas puntas (ver subscription.routes.js:
// calcularPrecioConDescuento, parsearExternalReference).
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akira-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const subRoutes = require('../routes/subscription.routes');
const { calcularPrecioConDescuento, parsearExternalReference } = subRoutes;

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[referidos] Tests:');

// ── calcularPrecioConDescuento — el descuento es SIEMPRE $5.000 fijo,
// no un porcentaje, sin importar el plan ────────────────────────────
{
  const r1 = calcularPrecioConDescuento(35000, 5000);
  assert(r1.descuentoAplicado === 5000 && r1.precioFinal === 30000, 'plan Pro ($35.000): con referido paga $30.000');

  const r2 = calcularPrecioConDescuento(15000, 5000);
  assert(r2.descuentoAplicado === 5000 && r2.precioFinal === 10000, 'plan Básico ($15.000): con referido paga $10.000');

  const r3 = calcularPrecioConDescuento(80000, 5000);
  assert(r3.descuentoAplicado === 5000 && r3.precioFinal === 75000, 'plan Agencia ($80.000): con referido paga $75.000 — mismo descuento fijo, no un %');

  const r4 = calcularPrecioConDescuento(15000, 0);
  assert(r4.descuentoAplicado === 0 && r4.precioFinal === 15000, 'sin descuento disponible, paga el precio de lista completo');

  const r5 = calcularPrecioConDescuento(15000, undefined);
  assert(r5.descuentoAplicado === 0 && r5.precioFinal === 15000, 'descuentoReferido undefined (usuario nunca referido) no rompe ni descuenta');

  // Clamp defensivo: nunca debería pasar con los planes reales (todos
  // cuestan mucho más que $5.000), pero la función no debe poder dejar
  // un precio en $0 o negativo si algún día se agrega un plan barato.
  const r6 = calcularPrecioConDescuento(3000, 5000);
  assert(r6.descuentoAplicado === 2999 && r6.precioFinal === 1, 'el descuento nunca deja el precio en $0 o negativo, aunque sea mayor al precio del plan');

  // Datos corruptos (no debería pasar nunca, pero por las dudas)
  const r7 = calcularPrecioConDescuento(15000, -5000);
  assert(r7.descuentoAplicado === 0 && r7.precioFinal === 15000, 'un descuentoReferido negativo (dato corrupto) no genera un precio inflado ni negativo');
}

// ── parsearExternalReference — de esto depende que el crédito llegue
// al referente correcto y que el descuento se consuma una sola vez ──
{
  const p1 = parsearExternalReference('66f1a2b3c4d5e6f7a8b9c0d1|pro|mensual|5000');
  assert(p1.userId === '66f1a2b3c4d5e6f7a8b9c0d1' && p1.planKey === 'pro' && p1.periodo === 'mensual' && p1.descuentoAplicado === 5000,
    'parsea correctamente un checkout CON descuento de referido aplicado');

  const p2 = parsearExternalReference('66f1a2b3c4d5e6f7a8b9c0d1|basico|anual|0');
  assert(p2.descuentoAplicado === 0, 'parsea correctamente un checkout SIN descuento (usuario no referido)');

  // Formato viejo (preferencias de MP creadas ANTES de este fix, sin el
  // 4to campo) — no debe romper, y correctamente no acredita nada
  // porque no hay forma de saber cuánto se cobró de descuento.
  const p3 = parsearExternalReference('66f1a2b3c4d5e6f7a8b9c0d1|pro|mensual');
  assert(p3.descuentoAplicado === 0 && p3.periodo === 'mensual', 'external_reference del formato viejo (sin 4to campo) no rompe, descuentoAplicado cae a 0');

  const p4 = parsearExternalReference('66f1a2b3c4d5e6f7a8b9c0d1|pro');
  assert(p4.periodo === 'mensual', 'sin periodo en el external_reference, cae a "mensual" por default');

  const p5 = parsearExternalReference('');
  assert(p5.userId === '' && p5.planKey === '' && p5.descuentoAplicado === 0, 'external_reference vacío no rompe');

  const p6 = parsearExternalReference(undefined);
  assert(p6.userId === '' && p6.descuentoAplicado === 0, 'external_reference undefined no rompe');

  const p7 = parsearExternalReference('66f1a2b3c4d5e6f7a8b9c0d1|pro|mensual|no-es-un-numero');
  assert(p7.descuentoAplicado === 0, 'un 4to campo corrupto (no numérico) cae a 0 en vez de romper o dar NaN');
}

console.log('\n✅ Todos los tests de referidos pasaron.\n');
