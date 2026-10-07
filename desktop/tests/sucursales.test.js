// tests/sucursales.test.js — sucursales: alta, plata y turnos por local, filtro de la Caja y resumen por sucursal.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-suc-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const S = require('../main/gestion/sucursales');

(async () => {
  console.log('\n[sucursales] Tests:');
  assert(!S.sanear({ nombre: '  ' }).ok && S.sanear({ nombre: ' Centro ', direccion: 'Calle 1', telefono: '2241 1' }).dato.nombre === 'Centro' && S.sanear({}, { nombre: 'Norte', direccion: 'X' }).dato.direccion === 'X', 'valida y conserva lo que no se manda');
  const profs = [{ _id: 'p1', sucursalId: 's1' }, { _id: 'p2', sucursalId: '' }];
  const por = new Map(profs.map((p) => [p._id, p]));
  assert(S.sucursalDeTurno({ sucursalId: 's2', profesionalId: 'p1' }, por) === 's2' && S.sucursalDeTurno({ profesionalId: 'p1' }, por) === 's1' && S.sucursalDeTurno({ profesionalId: 'p2' }, por) === '' && S.sucursalDeTurno({}, por) === '', 'un turno es del local que se le asignó o, si no, del local de su profesional');
  assert(S.coincide('', 'x') && S.coincide('sin', '') && !S.coincide('sin', 's1') && S.coincide('s1', 's1') && !S.coincide('s1', ''), 'filtro: todas / sin sucursal / una');

  const mes = '2026-10';
  const T = (id, dia, monto, extra = {}) => ({ _id: id, fechaInicio: new Date(`2026-10-${String(dia).padStart(2, '0')}T10:00:00`), estado: 'confirmado', pago: { monto, metodo: 'efectivo' }, clienteNombre: 'C', resumen: 'Corte — C', ...extra });
  const turnos = [T('t1', 1, 10000, { sucursalId: 's1' }), T('t2', 2, 6000, { profesionalId: 'p1' }), T('t3', 3, 4000, { sucursalId: 's2' }), T('t4', 4, 2000), T('t5', 5, 9000, { estado: 'cancelado', sucursalId: 's1' })];
  const movimientos = [{ tipo: 'gasto', monto: 3000, fecha: '2026-10-05', sucursalId: 's1', metodo: 'efectivo', categoria: 'x' }, { tipo: 'ingreso', monto: 500, fecha: '2026-10-06', sucursalId: 's2', metodo: 'efectivo', categoria: 'x' }, { tipo: 'gasto', monto: 700, fecha: '2026-10-07', metodo: 'efectivo', categoria: 'x' }, { tipo: 'gasto', monto: 1, fecha: '2026-09-07', sucursalId: 's1', metodo: 'efectivo', categoria: 'x' }];
  const r = S.resumen({ movimientos, turnos, profesionales: profs, sucursales: [{ _id: 's1', nombre: 'Centro' }, { _id: 's2', nombre: 'Norte' }, { _id: 's3', nombre: 'Vacía', activo: false }], mes });
  const f = (id) => r.sucursales.find((x) => x.id === id);
  assert(f('s1').ingresos === 16000 && f('s1').gastos === 3000 && f('s1').resultado === 13000 && f('s1').turnos === 2, 'Centro: turnos asignados + los de su profesional, y su gasto (sin cancelados ni otros meses)');
  assert(f('s2').ingresos === 4500 && f('s2').turnos === 1 && f('').ingresos === 2000 && f('').gastos === 700, 'Norte, y lo que no tiene sucursal va aparte');
  assert(!f('s3') && r.totales.ingresos === 22500 && r.totales.gastos === 3700 && r.totales.turnos === 4, 'una sucursal dada de baja y sin actividad no ensucia el resumen; totales');
  assert(S.filtrarTurnos(turnos, profs, 's1').length === 3 && S.filtrarTurnos(turnos, profs, 'sin').length === 1 && S.filtrarTurnos(turnos, profs, '').length === 5 && S.filtrarMovimientos(movimientos, 's2').length === 1, 'filtros de turnos y movimientos');

  // ── rutas + Caja ──
  const Config = require('../main/bot-engine/models/Config');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const Turno = require('../main/bot-engine/models/Turno');
  const Profesional = require('../main/bot-engine/models/Profesional');
  await Config.create({ userId: 'u1', negocio: 'X' });
  const app = express(); app.use(express.json());
  const deps = { requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, botService: { recargarConfig() {} } };
  app.use('/api/app/sucursales', require('../main/local-api/routes/sucursales.routes')(deps));
  app.use('/api/caja', require('../main/local-api/routes/caja.routes')(deps));
  app.use('/api/app/profesionales', require('../main/local-api/routes/profesionales.routes')(deps));
  const srv = await new Promise((rs) => { const sv = app.listen(0, '127.0.0.1', () => rs(sv)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (m, p, body) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json().catch(() => ({})) }; };

  let x = await j('POST', '/app/sucursales', { nombre: 'Centro', direccion: 'San Martín 1' });
  const centro = x.body.id; const norte = (await j('POST', '/app/sucursales', { nombre: 'Norte' })).body.id;
  assert(x.status === 200 && centro && norte && (await j('POST', '/app/sucursales', { nombre: 'centro' })).status === 400 && (await j('POST', '/app/sucursales', { nombre: '' })).status === 400, 'crea sucursales sin repetir nombres');
  assert((await j('GET', '/app/sucursales')).body.sucursales.length === 2 && (await j('PUT', `/app/sucursales/${norte}`, { direccion: 'Ruta 2' })).status === 200 && (await j('PUT', '/app/sucursales/nadie', { nombre: 'x' })).status === 404, 'lista y edita');

  const hoy = new Date(); const f0 = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  x = await j('POST', '/caja/movimiento', { tipo: 'ingreso', monto: 5000, fecha: f0, categoria: 'Ventas', sucursalId: centro });
  assert(x.status === 200 && x.body.movimiento.sucursalId === centro, 'un movimiento de la Caja puede ir a una sucursal');
  await j('POST', '/caja/movimiento', { tipo: 'gasto', monto: 1200, fecha: f0, categoria: 'Insumos', sucursalId: norte });
  await j('POST', '/caja/movimiento', { tipo: 'ingreso', monto: 300, fecha: f0, categoria: 'Ventas' });
  assert((await j('POST', '/caja/movimiento', { tipo: 'ingreso', monto: 1, categoria: 'x', sucursalId: 'inexistente' })).status === 400, 'una sucursal que no existe → 400');
  x = await j('GET', '/caja');
  assert(x.body.resumen.ingresos === 5300 && x.body.sucursales.length === 2, 'sin filtro: todo, y la lista de sucursales para el selector');
  x = await j('GET', `/caja?sucursal=${centro}`);
  assert(x.body.resumen.ingresos === 5000 && x.body.resumen.gastos === 0 && x.body.sucursal === centro, 'filtrando por Centro: solo lo suyo');
  x = await j('GET', `/caja?sucursal=${norte}`);
  assert(x.body.resumen.ingresos === 0 && x.body.resumen.gastos === 1200, 'filtrando por Norte');
  x = await j('GET', '/caja?sucursal=sin');
  assert(x.body.resumen.ingresos === 300, 'solo lo que no tiene sucursal');
  const m = (await Movimiento.find({ userId: 'u1', monto: 5000 }).lean())[0];
  assert((await j('PUT', `/caja/movimiento/${m._id}`, { sucursalId: norte })).status === 200 && (await Movimiento.findOne({ _id: m._id }).lean()).sucursalId === norte, 'se puede cambiar el movimiento de sucursal');

  // turnos: asignar y heredar del profesional
  const ayer = new Date(Date.now() - 3 * 86400000); ayer.setHours(10, 0, 0, 0);
  const t1 = await Turno.create({ userId: 'u1', calendarId: 'a', fechaInicio: ayer, fechaFin: new Date(ayer.getTime() + 3600e3), estado: 'confirmado', pago: { monto: 7000, metodo: 'efectivo' }, clienteNombre: 'A', resumen: 'Corte — A' });
  const pr = await j('POST', '/app/profesionales', { nombre: 'Marta', comisionPct: 40, sucursalId: norte });
  const t2fecha = new Date(ayer.getTime() + 3600e3 * 3);
  const t2 = await Turno.create({ userId: 'u1', calendarId: 'b', fechaInicio: t2fecha, fechaFin: new Date(t2fecha.getTime() + 3600e3), estado: 'confirmado', pago: { monto: 4000, metodo: 'efectivo' }, clienteNombre: 'B', resumen: 'Corte — B', profesionalId: pr.body.id });
  assert((await j('POST', '/app/sucursales/turno', { turnoId: String(t1._id), sucursalId: centro })).status === 200 && (await Turno.findOne({ _id: t1._id }).lean()).sucursalId === centro && (await j('POST', '/app/sucursales/turno', { turnoId: String(t1._id), sucursalId: 'x' })).status === 404 && (await j('POST', '/app/sucursales/turno', { turnoId: 'x', sucursalId: centro })).status === 404, 'asignar un turno a una sucursal');
  void t2;
  x = await j('GET', '/app/sucursales/resumen');
  const rc = x.body.sucursales.find((s) => s.id === centro); const rn = x.body.sucursales.find((s) => s.id === norte);
  // los turnos de hace 3 días pueden caer en el mes anterior si hoy es 1, 2 o 3: se comprueba lo que corresponde al mes pedido
  const mismoMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === x.body.mes;
  assert(rc.ingresos === (mismoMes(ayer) ? 7000 : 0), 'Centro: el turno que se le asignó (si cae en este mes) y ya no tiene el movimiento que se pasó a Norte');
  assert(rn.gastos === 1200 && rn.ingresos === 5000 + (mismoMes(t2fecha) ? 4000 : 0), 'Norte: el movimiento que se le pasó, y los turnos de su profesional');
  assert((await j('GET', `/caja?sucursal=${norte}`)).body.resumen.ingresos === 5000 + (mismoMes(t2fecha) ? 4000 : 0), 'la Caja filtrada por Norte incluye los turnos de su profesional');

  // borrar
  const vacia = (await j('POST', '/app/sucursales', { nombre: 'Temporal' })).body.id;
  assert((await j('DELETE', `/app/sucursales/${vacia}`)).body.desactivada === false && (await j('DELETE', `/app/sucursales/${centro}`)).body.desactivada === true, 'una sucursal sin uso se borra; una con historial se desactiva');
  assert((await j('GET', '/caja')).body.sucursales.every((s) => s._id !== centro), 'una desactivada deja de ofrecerse');
  void Profesional;
  srv.close();

  console.log('\n✅ Todos los tests de sucursales pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
