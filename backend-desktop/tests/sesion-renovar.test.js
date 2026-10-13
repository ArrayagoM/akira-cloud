// tests/sesion-renovar.test.js — duración y renovación de la sesión de la app de escritorio (servidor).
'use strict';

process.env.JWT_SECRET = 'x'.repeat(40);
const jwt = require('jsonwebtoken');
const Module = require('module');
const path = require('path');

// middleware/auth.js usa passport y Mongoose: se prueba solo generarJWT con los módulos pesados simulados
const inyectar = (rel, ex) => { const f = path.join(__dirname, '..', rel); Module._cache[f] = { id: f, filename: f, loaded: true, exports: ex, children: [], paths: [] }; };
inyectar('models/Log.js', { registrar: async () => {} });
const { generarJWT } = require('../middleware/auth');
const { expiracionSegunCliente, payloadDe, evaluarRenovacion, MAX_ANTIGUEDAD_DIAS } = require('../lib/sesion');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dias = (t) => Math.round((jwt.decode(t).exp - jwt.decode(t).iat) / 86400);
const AHORA = Math.floor(Date.now() / 1000);

console.log('\n[sesión · renovación] Tests:');
delete process.env.JWT_EXPIRES_IN; delete process.env.DESKTOP_JWT_EXPIRES_IN;
assert(expiracionSegunCliente({ headers: { 'x-akira-cliente': 'escritorio' } }) === '30d' && expiracionSegunCliente({ headers: { 'x-akira-cliente': 'ESCRITORIO' } }) === '30d', 'la app de escritorio recibe sesiones de 30 días');
assert(expiracionSegunCliente({ headers: {} }) === undefined && expiracionSegunCliente({ headers: { 'x-akira-cliente': 'otro' } }) === undefined && expiracionSegunCliente({}) === undefined && expiracionSegunCliente(undefined) === undefined, 'la web y cualquier otro cliente conservan la duración normal (7 días)');
process.env.DESKTOP_JWT_EXPIRES_IN = '45d'; assert(expiracionSegunCliente({ headers: { 'x-akira-cliente': 'escritorio' } }) === '45d', 'la duración se puede cambiar por variable de entorno'); delete process.env.DESKTOP_JWT_EXPIRES_IN;

const web = generarJWT('u1', 3);
assert(dias(web) === 7 && jwt.decode(web).tv === 3 && jwt.decode(web).id === 'u1', 'un token normal dura 7 días y lleva usuario y versión (tokenVersion)');
const esc = generarJWT('u1', 3, { expiresIn: '30d' });
assert(dias(esc) === 30 && jwt.decode(esc).tv === 3, 'un token de escritorio dura 30 días');
assert(Math.abs(jwt.decode(esc).oa - AHORA) <= 2, 'cada ingreso anota cuándo se ingresó de verdad (oa)');
const renovado = generarJWT('u1', 3, { expiresIn: '30d', oa: AHORA - 10 * 86400 });
assert(jwt.decode(renovado).oa === AHORA - 10 * 86400 && jwt.decode(renovado).exp > jwt.decode(esc).exp - 5, 'al renovar se conserva el "oa" original (la renovación no "rejuvenece" la sesión) y la vigencia es nueva');
process.env.JWT_EXPIRES_IN = '2d'; assert(dias(generarJWT('u1')) === 2, 'JWT_EXPIRES_IN sigue mandando para la duración normal'); delete process.env.JWT_EXPIRES_IN;
assert(jwt.verify(esc, process.env.JWT_SECRET).id === 'u1', 'el token se verifica con el mismo secreto de siempre (compatible con la validación existente)');

// evaluarRenovacion
assert(evaluarRenovacion(payloadDe(esc)).ok && evaluarRenovacion(payloadDe(renovado)).oa === AHORA - 10 * 86400, 'una sesión reciente se puede renovar');
assert(evaluarRenovacion({ id: 'u1', iat: AHORA - 100 * 86400 }, AHORA).ok, 'un token viejo sin "oa" cuenta desde que se emitió: a los 100 días todavía se renueva');
assert(!evaluarRenovacion({ id: 'u1', oa: AHORA - (MAX_ANTIGUEDAD_DIAS + 1) * 86400 }, AHORA).ok && evaluarRenovacion({ id: 'u1', oa: AHORA - (MAX_ANTIGUEDAD_DIAS + 1) * 86400 }, AHORA).motivo === 'sesion_muy_antigua', `pasados ${MAX_ANTIGUEDAD_DIAS} días desde el ingreso con contraseña ya no se renueva (hay que volver a ingresar)`);
assert(evaluarRenovacion({ id: 'u1', oa: AHORA - (MAX_ANTIGUEDAD_DIAS - 1) * 86400 }, AHORA).ok, 'un día antes del límite todavía se renueva');
assert(!evaluarRenovacion(null).ok && !evaluarRenovacion({}).ok && !evaluarRenovacion({ id: 'u1' }).ok && !evaluarRenovacion(payloadDe('basura')).ok && payloadDe('') === null && payloadDe(undefined) === null, 'tokens vacíos o rotos no se renuevan ni rompen nada');
// cadena de renovaciones: nunca supera el límite
let t = generarJWT('u1', 0, { expiresIn: '30d', oa: AHORA - 170 * 86400 }); let n = 0;
for (let d = 170; d < 400; d += 15) { const e = evaluarRenovacion(payloadDe(t), AHORA + (d - 170) * 86400); if (!e.ok) break; n++; t = generarJWT('u1', 0, { expiresIn: '30d', oa: e.oa }); }
assert(n >= 1 && n <= 1, `una cadena de renovaciones se corta sola: desde un ingreso de hace 170 días, se renovó ${n} vez y luego pide volver a ingresar`);

console.log('\n✅ Todos los tests de la renovación de sesión (servidor) pasaron.\n');
