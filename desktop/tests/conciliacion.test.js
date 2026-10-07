// tests/conciliacion.test.js — conciliación con MercadoPago: cobros de la cuenta cruzados con turnos, pedidos y Caja.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-conc-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const conc = require('../main/gestion/conciliacion');

const MP = (id, monto, fecha, extra = {}) => ({ id, status: 'approved', transaction_amount: monto, transaction_details: { net_received_amount: Math.round(monto * 0.9 * 100) / 100 }, date_approved: `${fecha}T15:00:00.000-03:00`, description: 'Turno', payer: { first_name: 'Ana', last_name: 'López' }, payment_type_id: 'account_money', ...extra });

(async () => {
  console.log('\n[conciliación] Tests:');
  let n = conc.normalizarPago(MP(111, 10000, '2026-10-05'));
  assert(n.id === '111' && n.monto === 10000 && n.neto === 9000 && n.comision === 1000 && n.fecha === '2026-10-05' && n.pagador === 'Ana López', 'normaliza un cobro (monto, neto, comisión, fecha y quién pagó)');
  assert(conc.normalizarPago(MP(1, 10, '2026-10-05', { status: 'refunded' })) === null && conc.normalizarPago(MP(2, 0, '2026-10-05')) === null && conc.normalizarPago(null) === null && conc.normalizarPago({ id: 3, status: 'approved', transaction_amount: 5 }) === null, 'ignora reembolsados, de $0 o sin fecha');

  const pagos = [
    conc.normalizarPago(MP(101, 9000, '2026-10-02')),   // de un turno (comprobante)
    conc.normalizarPago(MP(102, 12400, '2026-10-03')),  // de un pedido (comprobante)
    conc.normalizarPago(MP(103, 5000, '2026-10-04')),   // cargado a mano en la Caja, sin id (coincide por monto y fecha)
    conc.normalizarPago(MP(104, 7700, '2026-10-05')),   // no está en ningún lado
    conc.normalizarPago(MP(105, 3000, '2026-10-06')),   // ya registrado con su id
  ];
  const turnos = [{ _id: 't1', pago: { monto: 9000, metodo: 'mercadopago', comprobante: '101' } }];
  const pedidos = [{ _id: 'p1', pago: { metodo: 'mercadopago', comprobante: '102' } }];
  const movs = [
    { _id: 'm1', tipo: 'ingreso', metodo: 'mercadopago', monto: 5000, fecha: '2026-10-05', origen: 'manual', descripcion: 'Seña Luis' },
    { _id: 'm2', tipo: 'ingreso', metodo: 'mercadopago', monto: 800, fecha: '2026-10-04', origen: 'manual', descripcion: 'Algo que no aparece en MP' },
    { _id: 'm3', tipo: 'ingreso', metodo: 'mercadopago', monto: 3000, fecha: '2026-10-06', origen: 'mercadopago', mpId: '105' },
    { _id: 'm4', tipo: 'ingreso', metodo: 'efectivo', monto: 7700, fecha: '2026-10-05', origen: 'manual' },     // efectivo: no cuenta como MP
    { _id: 'm5', tipo: 'ingreso', metodo: 'mercadopago', monto: 100, fecha: '2026-01-05', origen: 'manual' },    // fuera del período
    { _id: 'm6', tipo: 'ingreso', metodo: 'mercadopago', monto: 9000, fecha: '2026-10-02', origen: 'pedido' },   // de un pedido: se concilia por su id, no por monto
  ];
  const r = conc.cruzar({ pagos, turnos, pedidos, movimientos: movs, ventana: { desde: '2026-10-01', hasta: '2026-10-07' } });
  assert(r.conciliados.map((c) => `${c.id}:${c.via}`).join() === '101:turno,102:pedido,103:monto,105:caja', 'concilia por turno, pedido, por monto y fecha (sin id) y por id ya registrado');
  assert(r.sinRegistrar.length === 1 && r.sinRegistrar[0].id === '104' && r.totales.sinRegistrarMonto === 7700, 'el cobro que no está en ningún lado queda "sin registrar" (un ingreso en efectivo del mismo monto no lo explica)');
  assert(r.sinPago.length === 1 && r.sinPago[0]._id === 'm2', 'lo que figura como MercadoPago en la Caja y no está en la cuenta se marca para revisar (no los de otro período ni los de pedidos)');
  assert(r.totales.cobros === 5 && r.totales.bruto === 37100 && r.totales.comision === 3710 && r.totales.neto === 33390, 'totales: bruto, comisión y neto');
  const dos = conc.cruzar({ pagos: [conc.normalizarPago(MP(201, 500, '2026-10-05')), conc.normalizarPago(MP(202, 500, '2026-10-05'))], movimientos: [{ _id: 'a', tipo: 'ingreso', metodo: 'mercadopago', monto: 500, fecha: '2026-10-05', origen: 'manual' }] });
  assert(dos.conciliados.length === 1 && dos.sinRegistrar.length === 1, 'un ingreso de la Caja explica un solo cobro (no dos del mismo monto)');
  const lejos = conc.cruzar({ pagos: [conc.normalizarPago(MP(301, 500, '2026-10-05'))], movimientos: [{ _id: 'b', tipo: 'ingreso', metodo: 'mercadopago', monto: 500, fecha: '2026-10-12', origen: 'manual' }] });
  assert(lejos.sinRegistrar.length === 1, 'si la fecha está a más de 2 días no se da por conciliado');
  const mov = conc.movimientoDeCobro('u1', pagos[3]);
  assert(mov.origen === 'mercadopago' && mov.mpId === '104' && mov.tipo === 'ingreso' && mov.metodo === 'mercadopago' && mov.monto === 7700 && mov.fecha === '2026-10-05', 'el ingreso que se crea para un cobro sin registrar');

  // traerCobros: paginado, errores
  const llamadas = [];
  const pag = async (url) => { llamadas.push(url); const off = Number(/offset=(\d+)/.exec(url)[1]); const lote = Array.from({ length: off === 0 ? 100 : 20 }, (_, i) => MP(1000 + off + i, 100, '2026-10-05')); return { status: 200, json: { results: lote, paging: { total: 120 } } }; };
  const todos = await conc.traerCobros(pag, { desde: '2026-10-01', hasta: '2026-10-07' });
  assert(todos.length === 120 && llamadas.length === 2 && /begin_date=2026-10-01/.test(llamadas[0]) && /end_date=2026-10-07/.test(llamadas[0]), 'trae todas las páginas del período');
  let err = null; try { await conc.traerCobros(async () => ({ status: 401, json: {} }), { desde: 'a', hasta: 'b' }); } catch (e) { err = e; }
  assert(err && err.status === 400 && /Access Token/.test(err.message), 'clave rechazada: mensaje claro');
  err = null; try { await conc.traerCobros(async () => ({ status: 500, json: {} }), { desde: 'a', hasta: 'b' }); } catch (e) { err = e; }
  assert(err && err.status === 502, 'MercadoPago caído → 502 (no rompe la app)');

  // ── rutas ──
  const Config = require('../main/bot-engine/models/Config');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const Turno = require('../main/bot-engine/models/Turno');
  const cfg = await Config.create({ userId: 'u1', negocio: 'X' });
  const sinClave = express(); sinClave.use(express.json());
  const deps = { requerirSesion: (q, _r, nx) => { q.user = { _id: 'u1' }; nx(); }, mpFetchPara: () => async () => ({ status: 200, json: { results: [MP(901, 4000, '2026-10-02'), MP(902, 6000, '2026-10-03')], paging: { total: 2 } } }) };
  sinClave.use('/c', require('../main/local-api/routes/conciliacion.routes')(deps));
  const s1 = await new Promise((rs) => { const s = sinClave.listen(0, '127.0.0.1', () => rs(s)); });
  const u = `http://127.0.0.1:${s1.address().port}/c`;
  let x = await fetch(`${u}?desde=2026-10-01&hasta=2026-10-07`);
  assert(x.status === 400 && /Access Token/.test((await x.json()).error), 'sin MercadoPago conectado: explica qué falta');
  const doc = await Config.findOne({ userId: 'u1' }); doc.setKey('keyMP', 'APP_USR-token-de-prueba'); await doc.save();
  void cfg;
  await Turno.create({ userId: 'u1', calendarId: 'c', fechaInicio: new Date('2026-10-02T12:00:00'), fechaFin: new Date('2026-10-02T13:00:00'), estado: 'confirmado', pago: { monto: 4000, metodo: 'mercadopago', comprobante: '901' } });
  x = await (await fetch(`${u}?desde=2026-10-01&hasta=2026-10-07`)).json();
  assert(x.conciliados.length === 1 && x.sinRegistrar.length === 1 && x.sinRegistrar[0].id === '902' && x.totales.bruto === 10000, 'GET cruza con lo que hay en la base');
  assert((await fetch(`${u}?desde=2026-10-09&hasta=2026-10-01`)).status === 400, 'rango invertido → 400');
  let p = await (await fetch(`${u}/registrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: '2026-10-01', hasta: '2026-10-07' }) })).json();
  const ing = await Movimiento.find({ userId: 'u1', origen: 'mercadopago' }).lean();
  assert(p.registrados === 1 && ing.length === 1 && ing[0].mpId === '902' && ing[0].monto === 6000, 'registrar anota en la Caja solo lo que faltaba (monto tomado de MercadoPago)');
  p = await (await fetch(`${u}/registrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: '2026-10-01', hasta: '2026-10-07' }) })).json();
  assert(p.registrados === 0 && (await Movimiento.find({ userId: 'u1', origen: 'mercadopago' }).lean()).length === 1, 'registrar dos veces no duplica el ingreso');
  x = await (await fetch(`${u}?desde=2026-10-01&hasta=2026-10-07`)).json();
  assert(x.sinRegistrar.length === 0 && x.conciliados.length === 2, 'después de registrar queda todo conciliado');
  const otro = express(); otro.use(express.json());
  otro.use('/c', require('../main/local-api/routes/conciliacion.routes')({ ...deps, requerirSesion: (q, _r, nx) => { q.user = { _id: 'u2' }; nx(); } }));
  const s2 = await new Promise((rs) => { const s = otro.listen(0, '127.0.0.1', () => rs(s)); });
  assert((await fetch(`http://127.0.0.1:${s2.address().port}/c`)).status === 400, 'otro negocio sin clave no puede usar la cuenta de este');
  s1.close(); s2.close();

  console.log('\n✅ Todos los tests de conciliación pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
