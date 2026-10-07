// tests/ctacte.test.js — cuentas corrientes (deudores y proveedores): identidad del
// cliente por teléfono, saldos, antigüedad de la deuda (FIFO) y mensaje de cobranza.
'use strict';
const c = require('../main/gestion/ctacte');

function assert(ok, msg) { if (!ok) throw new Error('FAIL: ' + msg); console.log('  ✅ ' + msg); }
console.log('\n[ctacte] Tests:');

// ── identidad por teléfono ──
assert(c.telClave('+54 9 2241 49-7226') === '2241497226' && c.telClave('2241497226') === '2241497226' && c.telClave('5492241497226@s.whatsapp.net') === '2241497226', 'el mismo cliente se reconoce escriba como lo escriba (+54 9…, sin código, o el jid de WhatsApp)');
assert(c.telClave('12345') === '' && c.telClave('') === '' && c.telClave(null) === '', 'un teléfono incompleto no sirve como identidad');
assert(c.telWhatsApp('2241497226') === '5492241497226' && c.telWhatsApp('5492241497226@s.whatsapp.net') === '5492241497226' && c.telWhatsApp('123') === null, 'arma el número de WhatsApp (549 + 10 dígitos)');
assert(c.claveCliente({ telefono: '2241497226', nombre: 'Ana' }) === 'tel:2241497226' && c.claveCliente({ jid: '5492241497226@s.whatsapp.net' }) === 'tel:2241497226', 'la clave del cliente es el teléfono cuando existe');
assert(c.claveCliente({ nombre: '  José   Pérez ' }) === 'nom:jose perez' && c.claveCliente({}) === '', 'sin teléfono se usa el nombre sin tildes ni mayúsculas');

// ── validación ──
assert(c.sanearMovimiento('cliente', { tipo: 'cargo', monto: 5000, fecha: '2026-10-05', concepto: ' Corte y barba ' }).dato.concepto === 'Corte y barba', 'limpia el concepto');
assert(c.sanearMovimiento('cliente', { tipo: 'cargo', monto: 5 }).dato.concepto === 'Venta a cuenta' && c.sanearMovimiento('proveedor', { tipo: 'cargo', monto: 5 }).dato.concepto === 'Compra a crédito' && c.sanearMovimiento('cliente', { tipo: 'pago', monto: 5 }).dato.concepto === 'Pago a cuenta', 'concepto por defecto según quién y qué');
assert(!c.sanearMovimiento('cliente', { tipo: 'regalo', monto: 5 }).ok && !c.sanearMovimiento('cliente', { tipo: 'pago', monto: 0 }).ok && !c.sanearMovimiento('cliente', { tipo: 'pago', monto: -1 }).ok && !c.sanearMovimiento('cliente', { tipo: 'pago', monto: 5, fecha: '2026-13-40' }).ok, 'rechaza tipo inválido, monto cero/negativo y fecha imposible');
assert(c.sanearMovimiento('cliente', { tipo: 'pago', monto: 5 }).dato.metodo === 'efectivo', 'un pago sin método se toma como efectivo');

// ── saldos y antigüedad ──
const hoy = new Date(2026, 9, 20);
const M = (k, tipo, monto, fecha) => ({ entidadClave: k, tipo, monto, fecha });
const movs = [
  M('tel:1', 'cargo', 10000, '2026-09-01'), M('tel:1', 'cargo', 5000, '2026-10-10'), M('tel:1', 'pago', 10000, '2026-09-20'),
  M('tel:2', 'cargo', 3000, '2026-10-18'), M('tel:2', 'pago', 3000, '2026-10-19'),
  M('tel:3', 'cargo', 8000, '2026-08-01'), M('tel:3', 'pago', 2500.5, '2026-08-15'),
];
const s = Object.fromEntries(c.saldos(movs, hoy).map((x) => [x.clave, x]));
assert(s['tel:1'].saldo === 5000 && s['tel:1'].cargos === 15000 && s['tel:1'].pagos === 10000, 'saldo = cargos − pagos');
assert(s['tel:1'].antiguedadDias === 10, 'FIFO: el pago de $10.000 cancela el cargo viejo (1/9); lo que sigue sin pagar es el del 10/10 → 10 días');
assert(s['tel:2'].saldo === 0 && s['tel:2'].antiguedadDias === 0, 'una deuda saldada queda en cero y sin antigüedad');
assert(s['tel:3'].saldo === 5499.5 && s['tel:3'].antiguedadDias === 80, 'un pago parcial deja saldo con decimales y la antigüedad del cargo original (80 días)');
assert(c.totalSaldo(Object.values(s)) === 10499.5, 'el total a cobrar suma solo saldos positivos');
assert(c.saldos([M('tel:9', 'pago', 500, '2026-10-01')], hoy)[0].saldo === -500, 'si pagó de más, el saldo queda a favor (negativo) y no suma como deuda');
assert(c.totalSaldo(c.saldos([M('tel:9', 'pago', 500, '2026-10-01')], hoy)) === 0, 'el saldo a favor no entra en el total a cobrar');
const mismo = c.saldos([{ ...M('tel:5', 'cargo', 100, '2026-10-01'), createdAt: '1' }, { ...M('tel:5', 'pago', 100, '2026-10-01'), createdAt: '2' }], hoy)[0];
assert(mismo.saldo === 0, 'cargo y pago el mismo día se compensan');

// ── mensaje de cobranza ──
const msg = c.mensajeRecordatorio({ nombre: 'Ana López', saldo: 5499.5, negocio: 'Barbería Test', alias: 'barberia.mp', cbu: '0000003100000000000001', banco: 'Banco X', detalle: ['Corte y barba (01/09)'] });
assert(msg.includes('Hola Ana 👋') && msg.includes('*Barbería Test*') && msg.includes('*$5.499,50*') && msg.includes('Alias: barberia.mp') && msg.includes('CBU: 0000003100000000000001 (Banco X)') && msg.includes('Corte y barba'), 'el recordatorio incluye nombre, negocio, monto, detalle y datos de pago');
assert(!c.mensajeRecordatorio({ saldo: 1000 }).includes('Alias') && c.mensajeRecordatorio({ saldo: 1000 }).includes('$1.000'), 'sin datos de pago pide coordinar y formatea montos enteros');

console.log('\n✅ Todos los tests de ctacte pasaron.\n');
