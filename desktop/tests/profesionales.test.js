// tests/profesionales.test.js — profesionales: alta, asignación de turnos y liquidación de comisiones.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-prof-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const P = require('../main/gestion/profesionales');

(async () => {
  console.log('\n[profesionales] Tests:');
  assert(!P.sanear({ nombre: '' }).ok && !P.sanear({ nombre: 'Ana', comisionPct: 120 }).ok && !P.sanear({ nombre: 'Ana', comisionPct: 'x' }).ok && !P.sanear({ nombre: 'Ana', comisionPct: -5 }).ok, 'valida nombre y comisión (0 a 100)');
  const s = P.sanear({ nombre: ' Ana  López ', comisionPct: '40,5', color: 'rojo', servicios: ['Corte', 'corte', ' Color ', ''], horario: { lunes: { activo: true, inicio: '09:00', fin: '18:00' }, martes: { activo: true, inicio: '18:00', fin: '09:00' }, miercoles: { activo: false }, jueves: 'x' } });
  assert(s.ok && s.dato.nombre === 'Ana López' && s.dato.comisionPct === 40.5 && /^#/.test(s.dato.color) && s.dato.servicios.join() === 'Corte,corte,Color', 'limpia nombre, comisión con coma, color y servicios');
  assert(JSON.stringify(s.dato.horario) === '{"lunes":{"activo":true,"inicio":"09:00","fin":"18:00"},"miercoles":{"activo":false}}', 'el horario propio descarta lo inválido (fin antes que inicio, datos raros)');
  assert(P.sanear({ comisionPct: 10 }, { nombre: 'Luis', color: '#38bdf8', comisionPct: 5 }).dato.nombre === 'Luis' && P.sanear({}, { nombre: 'Luis', comisionPct: 5 }).dato.comisionPct === 5, 'al editar, lo que no se manda se conserva');

  // liquidación
  const ahora = new Date('2026-10-20T12:00:00');
  const T = (dia, hora, monto, extra = {}) => ({ _id: `${dia}${hora}${monto}${Math.random()}`, fechaInicio: new Date(`2026-10-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:00:00`), estado: 'confirmado', pago: { monto }, clienteNombre: 'Cli', resumen: 'Corte — Cli', ...extra });
  const profs = [{ _id: 'a', nombre: 'Ana', color: '#fff', comisionPct: 40, activo: true }, { _id: 'b', nombre: 'Beto', color: '#000', comisionPct: 50, activo: true }, { _id: 'c', nombre: 'Cami', color: '#111', comisionPct: 30, activo: true }, { _id: 'd', nombre: 'Dani (se fue)', color: '#222', comisionPct: 30, activo: false }];
  const turnos = [
    T(1, 10, 10000, { profesionalId: 'a', comisionPct: 40 }), T(2, 10, 20000, { profesionalId: 'a', comisionPct: 40 }),
    T(3, 10, 10000, { profesionalId: 'a', comisionPct: 30 }),                         // se asignó cuando la comisión era 30%
    T(4, 10, 8000, { profesionalId: 'b' }),                                           // sin snapshot: usa el % actual (50)
    T(5, 10, 9000, { profesionalId: 'a', ausente: true }),                            // no vino: no cuenta
    T(6, 10, 9000, { profesionalId: 'a', estado: 'cancelado' }),                      // cancelado: no cuenta
    T(25, 10, 9000, { profesionalId: 'a' }),                                          // todavía no pasó
    T(7, 10, 5000),                                                                   // sin asignar
    T(8, 10, 3000, { profesionalId: 'zzz' }),                                         // profesional borrado: cae en "sin asignar"
    { ...T(9, 10, 7000, { profesionalId: 'd', comisionPct: 30 }) },                   // profesional dado de baja pero con historial
  ];
  const liq = P.liquidacion(turnos, profs, { desde: '2026-10-01', hasta: '2026-10-31', ahora });
  const a = liq.profesionales.find((x) => x.id === 'a'); const b = liq.profesionales.find((x) => x.id === 'b');
  assert(a.turnos === 3 && a.facturado === 40000 && a.comision === 4000 + 8000 + 3000, 'Ana: 3 turnos, $40.000; la comisión usa el % de cuando se asignó cada turno (40 %, 40 %, 30 %)');
  assert(a.paraElLocal === 40000 - 15000 && b.turnos === 1 && b.comision === 4000, 'lo que queda para el local; sin snapshot usa el % actual');
  assert(liq.sinAsignar.turnos === 2 && liq.sinAsignar.facturado === 8000, 'los turnos sin profesional (o de uno borrado) van aparte');
  assert(liq.profesionales.find((x) => x.id === 'c').turnos === 0, 'un profesional activo sin turnos aparece en cero');
  assert(liq.profesionales.find((x) => x.id === 'd').turnos === 1 && liq.totales.turnos === 3 + 1 + 1 + 2, 'uno dado de baja con turnos en el período sigue apareciendo');
  assert(liq.totales.facturado === 40000 + 8000 + 7000 + 8000 && liq.totales.comision === 15000 + 4000 + 2100, 'totales');
  const corto = P.liquidacion(turnos, profs, { desde: '2026-10-02', hasta: '2026-10-03', ahora });
  assert(corto.profesionales.find((x) => x.id === 'a').turnos === 2, 'respeta el rango de fechas (inclusive)');
  const det = P.detalle(turnos, profs[0], { desde: '2026-10-01', hasta: '2026-10-31', ahora });
  assert(det.length === 3 && det[2].comisionPct === 30 && det[2].comision === 3000 && det[0].servicio === 'Corte', 'detalle para entregarle al profesional');

  // exportar
  const exp = require('../main/gestion/exportador-profesionales');
  const xl = await exp.exportarXlsx(liq, { a: det }, { negocio: '=X' });
  const csv = exp.exportarCsv({ ...liq, profesionales: [{ ...liq.profesionales[0], nombre: '=HYPERLINK("x")' }] }).toString('utf8');
  assert(xl.length > 2000 && /Profesional;Turnos/.test(csv) && /TOTAL/.test(csv) && /'=HYPERLINK/.test(csv), 'exporta (Excel con una hoja por profesional, CSV neutralizando fórmulas)');

  // ── rutas ──
  const Turno = require('../main/bot-engine/models/Turno');
  const Config = require('../main/bot-engine/models/Config');
  await Config.create({ userId: 'u1', negocio: 'Peluquería', serviciosList: [{ nombre: 'Corte', precio: 9000 }, { nombre: 'Color', precio: 20000 }] });
  const hoy = caja => caja; void hoy;
  const ayer = new Date(Date.now() - 86400000); ayer.setHours(10, 0, 0, 0);
  const t1 = await Turno.create({ userId: 'u1', calendarId: 'c1', fechaInicio: ayer, fechaFin: new Date(ayer.getTime() + 3600e3), estado: 'confirmado', pago: { monto: 10000 }, clienteNombre: 'Ana', resumen: 'Corte — Ana' });
  const app = express(); app.use(express.json());
  app.use('/api/app/profesionales', require('../main/local-api/routes/profesionales.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); } }));
  const srv = await new Promise((rs) => { const sv = app.listen(0, '127.0.0.1', () => rs(sv)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/profesionales`;
  const j = async (m, p, body) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, ct: x.headers.get('content-type') || '', body: /json/.test(x.headers.get('content-type') || '') ? await x.json() : Buffer.from(await x.arrayBuffer()) }; };

  let x = await j('POST', '', { nombre: 'Marta', comisionPct: 40, servicios: ['Corte'] });
  assert(x.status === 200 && x.body.id, 'POST crea un profesional');
  const idM = x.body.id;
  assert((await j('POST', '', { nombre: 'marta', comisionPct: 10 })).status === 400 && (await j('POST', '', { nombre: '' })).status === 400, 'no repite nombres ni acepta datos inválidos');
  x = await j('GET', '');
  assert(x.body.profesionales.length === 1 && x.body.servicios.join() === 'Corte,Color' && x.body.colores.length > 3, 'GET lista profesionales y los servicios del negocio');
  assert((await j('PUT', `/${idM}`, { comisionPct: 45 })).status === 200 && (await j('GET', '')).body.profesionales[0].comisionPct === 45 && (await j('PUT', '/nadie', { comisionPct: 1 })).status === 404, 'PUT cambia solo lo enviado');

  x = await j('POST', '/asignar', { turnoId: String(t1._id), profesionalId: idM });
  const t = await Turno.findOne({ _id: t1._id }).lean();
  assert(x.status === 200 && t.profesionalId === idM && t.profesionalNombre === 'Marta' && t.comisionPct === 45, 'asignar un turno guarda el profesional y su comisión de ese momento');
  await j('PUT', `/${idM}`, { comisionPct: 60 });
  x = await j('GET', '/liquidacion');
  assert(x.status === 200 && x.body.profesionales[0].comision === 4500 && x.body.profesionales[0].turnos === 1, 'cambiar el % después no mueve lo ya asignado (4.500 y no 6.000)');
  assert((await j('GET', '/liquidacion?desde=2026-12-01&hasta=2026-01-01')).status === 400, 'rango invertido → 400');
  assert((await j('POST', '/asignar', { turnoId: 'nadie', profesionalId: idM })).status === 404 && (await j('POST', '/asignar', { turnoId: String(t1._id), profesionalId: 'nadie' })).status === 404, 'turno o profesional inexistente → 404');
  const f = await fetch(`${base}/liquidacion/exportar?formato=csv`);
  assert(f.status === 200 && /csv/.test(f.headers.get('content-type')) && (await f.text()).includes('Marta'), 'exportar CSV');
  assert((await fetch(`${base}/liquidacion/exportar`)).status === 200, 'exportar Excel');

  x = await j('DELETE', `/${idM}`);
  assert(x.status === 200 && x.body.desactivado === true && (await j('GET', '')).body.profesionales[0].activo === false, 'si tiene turnos asignados no se borra: se desactiva (su historial queda)');
  assert((await j('POST', '/asignar', { turnoId: String(t1._id), profesionalId: idM })).status === 404, '…y ya no se le pueden asignar más turnos');
  x = await j('POST', '', { nombre: 'Temporal' });
  assert((await j('DELETE', `/${x.body.id}`)).body.desactivado === false && (await j('GET', '')).body.profesionales.length === 1, 'uno sin turnos se borra de verdad');
  assert((await j('POST', '/asignar', { turnoId: String(t1._id), profesionalId: null })).status === 200 && (await Turno.findOne({ _id: t1._id }).lean()).profesionalId === '', 'se puede quitar la asignación');
  srv.close();

  console.log('\n✅ Todos los tests de profesionales pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
