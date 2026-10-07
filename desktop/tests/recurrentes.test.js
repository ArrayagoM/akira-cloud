// tests/recurrentes.test.js — gastos fijos y vencimientos: se cargan solos a la Caja, avisan antes y nunca se duplican.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-rec-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const rec = require('../main/gestion/recurrentes');

(async () => {
  console.log('\n[recurrentes] Tests:');
  assert(rec.fechaEnMes('2026-02', 31) === '2026-02-28' && rec.fechaEnMes('2024-02', 31) === '2024-02-29' && rec.fechaEnMes('2026-04', 31) === '2026-04-30' && rec.fechaEnMes('2026-10', 5) === '2026-10-05', 'el día 31 cae el último día de los meses cortos (y en bisiestos)');
  assert(rec.proximoVencimiento({ dia: 20 }, '2026-10-07').fecha === '2026-10-20' && rec.proximoVencimiento({ dia: 20 }, '2026-10-07').dias === 13, 'próximo vencimiento este mes');
  assert(rec.proximoVencimiento({ dia: 5 }, '2026-10-07').fecha === '2026-11-05' && rec.proximoVencimiento({ dia: 5 }, '2026-12-07').fecha === '2027-01-05', 'si ya pasó, el del mes que viene (también cruzando el año)');
  assert(rec.proximoVencimiento({ dia: 7 }, '2026-10-07').dias === 0, 'si vence hoy, faltan 0 días');

  assert(!rec.sanear({ descripcion: '', monto: 1, dia: 5 }).ok && !rec.sanear({ descripcion: 'x', monto: 0, dia: 5 }).ok && !rec.sanear({ descripcion: 'x', monto: 10, dia: 32 }).ok && !rec.sanear({ descripcion: 'x', monto: 10, dia: 5, avisoDias: 30 }).ok, 'valida nombre, monto, día y días de aviso');
  const solo = rec.sanear({ descripcion: 'Monotributo', dia: 20, registrar: false });
  assert(solo.ok && solo.dato.registrar === false && solo.dato.monto === 0, 'un vencimiento solo-recordatorio no necesita monto');
  assert(rec.sanear({ descripcion: 'Alquiler', monto: '150000', dia: '5' }).dato.avisoDias === 3 && rec.sanear({ descripcion: 'Alquiler', monto: 1, dia: 5 }).dato.metodo === 'transferencia', 'valores por defecto (avisa 3 días antes)');

  // meses pendientes
  const base = { dia: 5, creadoEn: '2026-07-01' };
  let p = rec.mesesPendientes(base, '2026-10-07', []);
  assert(p.map((x) => x.mes).join() === '2026-07,2026-08,2026-09,2026-10', 'se pone al día desde el alta, hasta hoy');
  assert(rec.mesesPendientes({ dia: 5, creadoEn: '2026-10-06' }, '2026-10-07', []).length === 0, 'no carga vencimientos anteriores al alta (el dueño pudo anotarlos a mano)');
  assert(rec.mesesPendientes({ dia: 20, creadoEn: '2026-01-01' }, '2026-10-07', []).map((x) => x.mes).join() === '2026-07,2026-08,2026-09', 'el vencimiento de este mes todavía no llegó, y mira como mucho 3 meses atrás');
  assert(rec.mesesPendientes(base, '2026-10-07', ['2026-08', '2026-09']).map((x) => x.mes).join() === '2026-07,2026-10', 'no repite los meses ya cargados');

  // ── contra la base ──
  const Recurrente = require('../main/bot-engine/models/Recurrente');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const M = { Recurrente, Movimiento };
  const alq = await Recurrente.create({ userId: 'u1', descripcion: 'Alquiler', monto: 150000, dia: 5, avisoDias: 3, registrar: true, categoria: 'Alquiler', metodo: 'transferencia', activo: true, creadoEn: '2026-09-01', mesesCargados: [] });
  const mono = await Recurrente.create({ userId: 'u1', descripcion: 'Monotributo', monto: 0, dia: 10, avisoDias: 3, registrar: false, categoria: 'Impuestos', metodo: 'transferencia', activo: true, creadoEn: '2026-01-01', mesesCargados: [] });
  await Recurrente.create({ userId: 'u1', descripcion: 'Pausado', monto: 5, dia: 1, avisoDias: 3, registrar: true, activo: false, creadoEn: '2026-01-01' });
  await Recurrente.create({ userId: 'u2', descripcion: 'De otro negocio', monto: 5, dia: 1, avisoDias: 3, registrar: true, activo: true, creadoEn: '2026-01-01' });
  const avisosEnviados = []; let conectado = true;
  const avisar = async (t) => { if (!conectado) return false; avisosEnviados.push(t); return true; };

  let r = await rec.procesar(M, 'u1', { hoy: '2026-10-07', avisar });
  const movs = await Movimiento.find({ userId: 'u1', origen: 'recurrente' }).lean();
  assert(movs.length === 2 && movs.map((m) => m.fecha).sort().join() === '2026-09-05,2026-10-05' && movs.every((m) => m.tipo === 'gasto' && m.monto === 150000 && m.categoria === 'Alquiler'), 'carga el alquiler de septiembre y octubre (los que ya vencieron desde el alta)');
  assert(r.cargados.length === 2 && !movs.some((m) => /Pausado|otro/.test(m.descripcion)), 'no toca los pausados ni los de otro negocio');
  assert(r.avisos.length === 1 && /Monotributo/.test(r.avisos[0]) && /en 3 días/.test(r.avisos[0]) && !/\$/.test(r.avisos[0]), 'avisa el monotributo que vence en 3 días (sin monto, porque no tiene)');
  assert(!r.avisos.some((a) => /Alquiler/.test(a)), 'el alquiler de este mes ya pasó: no avisa hasta que se acerque el del mes que viene');

  r = await rec.procesar(M, 'u1', { hoy: '2026-10-07', avisar });
  assert(r.cargados.length === 0 && r.avisos.length === 0 && (await Movimiento.find({ userId: 'u1', origen: 'recurrente' }).lean()).length === 2, 'volver a correr no duplica ni gastos ni avisos');

  await Movimiento.deleteOne({ _id: movs[0]._id });
  r = await rec.procesar(M, 'u1', { hoy: '2026-10-08', avisar });
  assert(r.cargados.length === 0, 'si el dueño borra un gasto cargado, no reaparece solo');

  r = await rec.procesar(M, 'u1', { hoy: '2026-10-10', avisar });
  assert(r.avisos.length === 0, 'el aviso del vencimiento de hoy ya se mandó (3 días antes): no insiste');
  conectado = false;
  r = await rec.procesar(M, 'u1', { hoy: '2026-11-03', avisar });
  assert(r.avisos.length === 0 && !String((await Recurrente.findOne({ _id: alq._id }).lean()).avisadoPara || '').includes('2026-11'), 'con el bot desconectado el aviso no se pierde: queda sin marcar');
  conectado = true;
  r = await rec.procesar(M, 'u1', { hoy: '2026-11-04', avisar });
  assert(r.avisos.some((a) => /Alquiler/.test(a) && /mañana/.test(a) && /150\.000/.test(a)), 'cuando vuelve la conexión, sale (con el monto formateado)');
  r = await rec.procesar(M, 'u1', { hoy: '2026-11-05', avisar });
  assert(r.cargados.length === 1 && r.cargados[0].fecha === '2026-11-05', 'el día del vencimiento se carga el gasto de noviembre');

  // ── servicio con reloj ──
  const svc = require('../main/recurrentes-servicio').crearServicio({ obtenerUserId: () => 'u1', modelos: M, avisar, ahora: () => new Date(2026, 11, 6, 9, 0), setI: () => 0 });
  const s = await svc.revisar();
  assert(s.motivo === 'ok' && s.cargados.some((c) => c.fecha === '2026-12-05'), 'el servicio revisa y carga el gasto de diciembre');
  assert((await require('../main/recurrentes-servicio').crearServicio({ obtenerUserId: () => null, modelos: M, avisar }).revisar()).motivo === 'sin-sesion', 'sin sesión no hace nada');

  // ── rutas ──
  const app = express(); app.use(express.json());
  app.use('/api/app/recurrentes', require('../main/local-api/routes/recurrentes.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u3' }; n(); }, servicioRecurrentes: { revisar: async () => ({ cargados: [{ descripcion: 'x' }] }) } }));
  const srv = await new Promise((rs) => { const sv = app.listen(0, '127.0.0.1', () => rs(sv)); });
  const base2 = `http://127.0.0.1:${srv.address().port}/api/app/recurrentes`;
  const j = async (m, p, body) => { const x = await fetch(base2 + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  let x = await j('POST', '', { descripcion: 'Internet', monto: 25000, dia: 12, categoria: 'Servicios (luz, agua, internet)' });
  assert(x.status === 200 && x.body.id, 'POST crea un gasto fijo');
  assert((await j('POST', '', { descripcion: '', monto: 1, dia: 5 })).status === 400, 'POST inválido → 400');
  x = await j('GET', '');
  assert(x.body.recurrentes.length === 1 && x.body.recurrentes[0].proximo.fecha && x.body.recurrentes[0].avisoDias === 3 && x.body.categorias.length > 3, 'GET lista solo los del negocio, con el próximo vencimiento');
  const id = x.body.recurrentes[0]._id;
  assert((await j('PUT', `/${id}`, { monto: 27000 })).status === 200 && (await j('GET', '')).body.recurrentes[0].monto === 27000, 'PUT cambia solo lo enviado');
  assert((await j('PUT', `/${id}`, { dia: 40 })).status === 400 && (await j('PUT', '/inexistente', { monto: 1 })).status === 404, 'PUT inválido o inexistente');
  assert((await j('POST', '/revisar')).body.cargados.length === 1, 'revisar ahora usa el servicio');
  assert((await j('DELETE', `/${id}`)).status === 200 && (await j('GET', '')).body.recurrentes.length === 0 && (await j('DELETE', `/${id}`)).status === 404, 'DELETE borra el fijo');
  srv.close();

  console.log('\n✅ Todos los tests de recurrentes pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
