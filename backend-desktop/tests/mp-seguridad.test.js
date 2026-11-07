// tests/mp-seguridad.test.js — validaciones puras del cobro con Mercado Pago (ids, rutas permitidas, firma del aviso).
'use strict';
const crypto = require('crypto');
const { idPagoValido, userIdValido, rutaMpPermitida, verificarFirmaMp } = require('../lib/mp-seguridad');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[mp-seguridad] Tests:');

// ── ids de pago ──
assert(idPagoValido('123456789012') && idPagoValido(98765) && idPagoValido('1'), 'ids numéricos de Mercado Pago: válidos (texto o número)');
assert(!idPagoValido('../../users/me') && !idPagoValido('123?x=1') && !idPagoValido('12 3') && !idPagoValido('') && !idPagoValido('1'.repeat(21)), 'rutas, parámetros, espacios, vacío o demasiado largo: inválidos');
assert(!idPagoValido(['1']) && !idPagoValido({ a: 1 }) && !idPagoValido(null) && !idPagoValido(undefined) && !idPagoValido(true), 'arreglos, objetos, null y booleanos: inválidos (antes se volvían "[object Object]")');
assert(userIdValido('507f1f77bcf86cd799439011') && !userIdValido('no-existe') && !userIdValido('507f1f77bcf86cd79943901') && !userIdValido(null) && !userIdValido({ $ne: 1 }), 'userId: solo 24 caracteres hexadecimales');

// ── rutas que el helper puede pedir a Mercado Pago ──
assert(rutaMpPermitida('/v1/payments/123456') && rutaMpPermitida('/checkout/preferences'), 'permitidas: consultar un pago y crear la preferencia (lo único que usa Akira)');
assert(!rutaMpPermitida('/v1/payments/../../users/me') && !rutaMpPermitida('/v1/payments/123?x=1') && !rutaMpPermitida('/users/me') && !rutaMpPermitida('/v1/payments/search') && !rutaMpPermitida(undefined), 'cualquier otra ruta, con "..", parámetros o sin texto: rechazada');

// ── firma del aviso ──
const secreto = 's3cr3to-de-prueba'; const ahora = Date.now(); const ts = String(ahora);
const firmar = (id, req, t = ts, s = secreto) => crypto.createHmac('sha256', s).update(`id:${id};request-id:${req};ts:${t};`).digest('hex');
const base = { secreto, dataId: '123456', xRequestId: 'req-1', ahora };
let r = verificarFirmaMp({ ...base, xSignature: `ts=${ts},v1=${firmar('123456', 'req-1')}` });
assert(r.ok && r.motivo === 'firma-ok' && !r.advertencia, 'firma válida: se acepta');
r = verificarFirmaMp({ ...base, xSignature: `ts=${ts},v1=${firmar('123456', 'req-1', ts, 'otro-secreto')}` });
assert(!r.ok && r.motivo === 'firma-invalida', 'firma hecha con otro secreto: se rechaza');
r = verificarFirmaMp({ ...base, xSignature: `ts=${ts},v1=${firmar('123456', 'req-1').slice(0, 20)}` });
assert(!r.ok && r.motivo === 'firma-invalida', 'firma truncada: se rechaza (antes pasaba porque solo comparaba si el largo coincidía)');
r = verificarFirmaMp({ ...base, xSignature: `ts=${ts},v1=${firmar('999', 'req-1')}` });
assert(!r.ok, 'firma de otro pago (id distinto): se rechaza');
r = verificarFirmaMp({ ...base, xSignature: `ts=${ts},v1=${'z'.repeat(64)}` });
assert(!r.ok, 'firma de largo correcto pero basura: se rechaza');
r = verificarFirmaMp({ ...base, xSignature: undefined });
assert(r.ok && r.motivo === 'sin-firma' && r.advertencia, 'aviso SIN firma y modo por defecto: pasa pero con advertencia (no se rompen cobros reales)');
r = verificarFirmaMp({ ...base, xSignature: undefined, estricta: true });
assert(!r.ok && r.motivo === 'sin-firma', 'aviso sin firma y modo estricto: se rechaza');
r = verificarFirmaMp({ ...base, xSignature: 'ts=123', estricta: false });
assert(r.ok && r.advertencia, 'cabecera incompleta (sin v1): en modo por defecto pasa con advertencia');
r = verificarFirmaMp({ ...base, secreto: '', xSignature: undefined });
assert(r.ok && r.motivo === 'sin-secreto' && r.advertencia, 'sin secreto configurado: pasa con advertencia (como hoy)');
const viejo = String(ahora - 60 * 60 * 1000);
r = verificarFirmaMp({ ...base, xSignature: `ts=${viejo},v1=${firmar('123456', 'req-1', viejo)}` });
assert(r.ok && r.motivo === 'ts-viejo' && r.advertencia, 'firma buena pero con una hora de antigüedad: pasa con advertencia (los reintentos de MP llegan tarde)');
r = verificarFirmaMp({ ...base, dataId: 'ABC123', xSignature: `ts=${ts},v1=${firmar('abc123', 'req-1')}` });
assert(r.ok && r.motivo === 'firma-ok', 'el id alfanumérico se firma en minúsculas, como indica Mercado Pago');

console.log('✅ mp-seguridad: OK');
