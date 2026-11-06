// tests/referidos-cobro.test.js — programa de afiliados: alias o CVU del usuario, conteo de quiénes pagaron y vista del admin.
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akira-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const R = require('../lib/referidos');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

console.log('\n[referidos-cobro] Tests:');

// ── cuenta de cobro ──
let v = R.validarCuentaCobro('  juan.perez.mp ');
assert(v.ok && v.tipo === 'alias' && v.valor === 'JUAN.PEREZ.MP', 'alias válido: se limpia y queda en mayúsculas');
v = R.validarCuentaCobro('0000003100012345678901');
assert(v.ok && v.tipo === 'cvu' && v.valor === '0000003100012345678901', 'CVU/CBU de 22 números');
v = R.validarCuentaCobro('0000 0031 0001 2345 6789 01');
assert(v.ok && v.tipo === 'cvu' && v.valor.length === 22, 'CVU con espacios: los saca');
assert(!R.validarCuentaCobro('12345').ok && /22 números/.test(R.validarCuentaCobro('12345').error), 'solo números pero no son 22: avisa cuántos puso');
assert(!R.validarCuentaCobro('juan@gmail.com').ok, 'un correo no sirve');
assert(!R.validarCuentaCobro('').ok && !R.validarCuentaCobro(null).ok && !R.validarCuentaCobro(undefined).ok, 'vacío no sirve');
assert(!R.validarCuentaCobro('abc').ok, 'alias demasiado corto');
assert(!R.validarCuentaCobro('a'.repeat(21)).ok, 'alias demasiado largo');
assert(!R.validarCuentaCobro('mi alias mp').ok, 'alias con espacios');
assert(!R.validarCuentaCobro('.juan.perez').ok && !R.validarCuentaCobro('juan.perez-').ok, 'no empieza ni termina con punto o guion');
assert(!R.validarCuentaCobro('juan$perez1').ok && !R.validarCuentaCobro('<script>alert(1)</script>').ok, 'caracteres raros rechazados');
assert(R.enmascarar({ tipo: 'cvu', valor: '0000003100012345678901' }) === '••••8901' && R.enmascarar({ tipo: 'alias', valor: 'JUAN.MP' }) === 'JUAN.MP' && R.enmascarar(null) === '', 'enmascarado para el registro');

// ── resumen que ve cada usuario ──
const filas = [
  { estado: 'pendiente', comisionPendiente: 5000, comisionPagada: false },
  { estado: 'pendiente', comisionPendiente: 5000, comisionPagada: false },
  { estado: 'activo', comisionPendiente: 5000, comisionPagada: false },
  { estado: 'pagado', comisionPendiente: 5000, comisionPagada: true },
  { estado: 'activo', comisionPendiente: 5000, comisionPagada: false },
];
let s = R.resumirReferidos(filas);
assert(s.registrados === 5 && s.pagaron === 3 && s.sinPagar === 2, 'cuenta registrados, los que pagaron y los que no');
assert(s.porCobrar === 10000 && s.cobrado === 5000 && s.total === 15000, 'suma lo por cobrar, lo ya cobrado y el total solo de los que pagaron');
s = R.resumirReferidos([]);
assert(s.registrados === 0 && s.pagaron === 0 && s.porCobrar === 0, 'sin referidos: todo en cero');
assert(R.resumirReferidos(null).registrados === 0, 'dato nulo no rompe');

// ── suscripción paga vigente ──
const hoy = new Date('2026-11-03T12:00:00Z');
const manana = new Date('2026-11-04T12:00:00Z'); const ayer = new Date('2026-11-02T12:00:00Z');
assert(R.suscripcionPagaVigente({ plan: 'pro', planExpira: manana }, hoy) === true, 'plan pro con fecha futura: vigente');
assert(R.suscripcionPagaVigente({ plan: 'pro', planExpira: ayer }, hoy) === false, 'plan pro vencido: no');
assert(R.suscripcionPagaVigente({ plan: 'trial', planExpira: manana }, hoy) === false, 'la prueba gratis no cuenta como paga');
assert(R.suscripcionPagaVigente({ plan: 'pro', planExpira: manana, esTester: true }, hoy) === false, 'tester no cuenta como paga');
assert(R.suscripcionPagaVigente(null, hoy) === false, 'sin usuario: no');

// ── vista del admin ──
const ana = { _id: 'a1', nombre: 'Ana', email: 'ana@x.com', cuentaCobro: { tipo: 'alias', valor: 'ANA.MP', actualizadoEn: hoy } };
const beto = { _id: 'b1', nombre: 'Beto', email: 'beto@x.com' };
const red = [
  { _id: 'r1', referente: ana, referido: { nombre: 'C1', plan: 'pro', planExpira: manana }, estado: 'activo', comisionPendiente: 5000, comisionPagada: false },
  { _id: 'r2', referente: ana, referido: { nombre: 'C2', plan: 'pro', planExpira: ayer }, estado: 'activo', comisionPendiente: 5000, comisionPagada: false },
  { _id: 'r3', referente: ana, referido: { nombre: 'C3', plan: 'trial' }, estado: 'pendiente', comisionPendiente: 5000, comisionPagada: false },
  { _id: 'r4', referente: ana, referido: { nombre: 'C4', plan: 'basico', planExpira: manana }, estado: 'pagado', comisionPendiente: 5000, comisionPagada: true },
  { _id: 'r5', referente: beto, referido: { nombre: 'C5', plan: 'pro', planExpira: manana }, estado: 'activo', comisionPendiente: 5000, comisionPagada: false },
  { _id: 'r6', referente: null, referido: { nombre: 'C6' }, estado: 'activo', comisionPendiente: 5000, comisionPagada: false },
];
const g = R.agruparPorReferente(red, hoy);
assert(g.length === 2, 'una fila por referente (ignora los que ya no existen)');
const a = g.find((x) => x.nombre === 'Ana'); const b = g.find((x) => x.nombre === 'Beto');
assert(a.registrados === 4 && a.pagaron === 3 && a.vigentes === 2, 'Ana: 4 registrados, 3 pagaron, 2 siguen con suscripción paga');
assert(a.porCobrar === 10000 && a.cobrado === 5000 && a.pendientes.length === 2, 'Ana: se le deben $10.000 en 2 comisiones y ya cobró $5.000');
assert(a.cuenta && a.cuenta.valor === 'ANA.MP', 'Ana: aparece su alias para transferirle');
assert(b.cuenta === null && b.porCobrar === 5000, 'Beto: se le deben $5.000 pero no cargó cuenta (el admin lo ve)');
assert(g[0].nombre === 'Ana', 'primero el que más se le debe');
assert(a.pendientes.find((p) => p.id === 'r2').vigente === false, 'marca la comisión cuyo referido ya no tiene plan vigente');

// ── las rutas cargan ──
require('../routes/auth.routes'); require('../routes/admin.routes');
assert(typeof require('../models/User').schema.path('cuentaCobro.valor') === 'object' && typeof require('../models/Referido').schema.path('pagadoA') === 'object', 'los modelos tienen los campos nuevos');

console.log('\n✅ Todos los tests de referidos-cobro pasaron.\n');
process.exit(0);
