// tests/ingresos.test.js — el resumen de ingresos del panel de administración.
'use strict';
const { resumir, mesAR } = require('../lib/ingresos');
const { armarPlanes } = require('../lib/cobro');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const planes = armarPlanes();
const ahora = new Date('2026-10-14T15:00:00Z');

console.log('\n[ingresos] Tests:');

// meses en hora argentina: el 1/11 a las 01:00 UTC todavía es 31/10 en Argentina
assert(mesAR('2026-11-01T01:00:00Z') === '2026-10', 'un pago de la medianoche UTC del 1/11 cuenta en octubre (en Argentina todavía es 31/10)');
assert(mesAR('2026-11-01T04:00:00Z') === '2026-11', 'a las 04:00 UTC ya es noviembre en Argentina');

const vacio = resumir({ planes, ahora });
assert(vacio.ingresos.acumulado === 0 && vacio.ingresos.pagos === 0 && vacio.porMes.length === 6 && vacio.desde === null, 'sin pagos todo da cero y no se rompe');

const pagos = [
  { userId: 'u1', email: 'a@x.com', plan: 'pro', periodo: 'mensual', monto: 49000, fecha: '2026-10-05T12:00:00Z' },
  { userId: 'u2', email: 'b@x.com', plan: 'basico', periodo: 'anual', monto: 201600, fecha: '2026-10-10T12:00:00Z' },
  { userId: 'u1', email: 'a@x.com', plan: 'pro', periodo: 'mensual', monto: 49000, fecha: '2026-09-05T12:00:00Z' },
  { userId: 'u3', email: 'c@x.com', plan: 'agencia', periodo: 'mensual', monto: 50000, fecha: '2026-08-01T12:00:00Z', estado: 'reembolsado' },
  { userId: 'u4', email: 'd@x.com', plan: 'pro', periodo: 'mensual', monto: 0, fecha: '2026-10-01T12:00:00Z' },
];
const usuarios = [
  { _id: 'u1', email: 'a@x.com', plan: 'pro', planPeriodo: 'mensual', planExpira: '2026-10-19T12:00:00Z' },
  { _id: 'u2', email: 'b@x.com', plan: 'basico', planPeriodo: 'anual', planExpira: '2027-10-10T12:00:00Z' },
  { _id: 'u9', email: 'z@x.com', plan: 'pro', planPeriodo: 'mensual', planExpira: '2026-12-01T12:00:00Z' },   // activado a mano
  { _id: 'u8', email: 'v@x.com', plan: 'pro', planPeriodo: 'mensual', planExpira: '2026-10-01T12:00:00Z' },   // vencido
];
const r = resumir({ pagos, usuarios, planes, ahora });
assert(r.ingresos.acumulado === 299600 && r.ingresos.pagos === 3, 'solo cuentan los pagos aprobados con monto: no los reembolsados ni los de $0');
assert(r.ingresos.mesActual === 250600 && r.ingresos.mesAnterior === 49000, 'este mes y el mes anterior se separan bien');
assert(r.ingresos.ticketPromedio === Math.round(299600 / 3 * 100) / 100, 'ticket promedio');
assert(r.porMes.length === 6 && r.porMes[5].mes === '2026-10' && r.porMes[5].monto === 250600 && r.porMes[4].mes === '2026-09', 'serie mensual: 6 meses terminando en el actual');
assert(r.porPlan[0].plan === 'basico' && r.porPlan[0].monto === 201600 && r.porPlan[1].plan === 'pro' && r.porPlan[1].pagos === 2, 'por plan, de mayor a menor');
assert(r.suscripciones.activas.total === 2 && r.suscripciones.activas.pro === 1 && r.suscripciones.activas.basico === 1, 'suscriptores activos: los vencidos y los activados a mano no cuentan');
assert(r.suscripciones.activadasAMano === 1, 'los planes activados a mano se informan aparte');
assert(r.suscripciones.mrr === 49000 + 16800 && r.suscripciones.arr === (49000 + 16800) * 12,'recurrente mensual: el plan anual cuenta como precio/12');
assert(r.suscripciones.vencenEn7Dias.length === 1 && r.suscripciones.vencenEn7Dias[0].email === 'a@x.com', 'avisa lo que vence en 7 días');
assert(r.ultimosPagos[0].email === 'b@x.com' && r.ultimosPagos.length === 3, 'últimos pagos, el más nuevo primero');
assert(new Date(r.desde).toISOString() === '2026-09-05T12:00:00.000Z', 'fecha del primer cobro registrado');

console.log('\n✅ Todos los tests de ingresos pasaron.\n');
