// tests/turnos-manual.test.js — turnos cargados a mano, edición/reprogramación y puestos en paralelo (Agenda).
// Prueba la lógica pura (gestion/turnos-manual.js) y las rutas locales /api/turnos y /api/bot/agenda contra una base de prueba.
// AKIRA_TEST_CONTINUAR=1 → no corta en la primera falla: cuenta y lista todas (sirve para comprobar qué pruebas fallan sin el cambio).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

let fallas = 0; let total = 0;
function assert(c, m) {
  total++;
  if (c) { console.log('  ✅ ' + m); return; }
  fallas++;
  if (process.env.AKIRA_TEST_CONTINUAR) { console.log('  ❌ ' + m); return; }
  throw new Error('FAIL: ' + m);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-turnos-manual-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const TM = require('../main/gestion/turnos-manual');

(async () => {
  console.log('\n[turnos-manual] Tests:');

  // ── lógica pura ──
  assert(TM.parsearFecha('2026-11-20') && !TM.parsearFecha('2026-02-30') && !TM.parsearFecha('2026-13-01') && !TM.parsearFecha('20-11-2026') && !TM.parsearFecha('2019-01-01') && !TM.parsearFecha(null), 'fecha: solo días reales con formato año-mes-día');
  assert(TM.parsearHora('00:00') && TM.parsearHora('23:59') && !TM.parsearHora('24:00') && !TM.parsearHora('9:30') && !TM.parsearHora('12:60') && !TM.parsearHora(''), 'hora: HH:mm de 24 horas');
  assert(TM.parsearDuracion(5) === 5 && TM.parsearDuracion('45') === 45 && TM.parsearDuracion(1440) === 1440 && TM.parsearDuracion(4) === null && TM.parsearDuracion(1441) === null && TM.parsearDuracion(10.5) === null && TM.parsearDuracion('') === null && TM.parsearDuracion(true) === null && TM.parsearDuracion('abc') === null, 'duración: entero de 5 a 1440 minutos');
  const ini = TM.aFechaUTC('2026-11-20', '15:30');
  assert(ini.toISOString() === '2026-11-20T18:30:00.000Z', 'las 15:30 de Argentina son las 18:30 UTC');
  assert(JSON.stringify(TM.aFechaAR(ini)) === '{"fecha":"2026-11-20","hora":"15:30"}', 'y se vuelve a leer como 15:30 de Argentina');
  assert(JSON.stringify(TM.aFechaAR(TM.aFechaUTC('2026-11-20', '23:00'))) === '{"fecha":"2026-11-20","hora":"23:00"}' && TM.aFechaAR(TM.calcularFin(TM.aFechaUTC('2026-11-20', '23:00'), 120)).fecha === '2026-11-21', 'un turno que cruza la medianoche termina al día siguiente');
  const a = new Date('2026-11-20T10:00:00Z'); const b = new Date('2026-11-20T11:00:00Z'); const c = new Date('2026-11-20T11:00:00Z'); const d = new Date('2026-11-20T12:00:00Z');
  assert(!TM.solapan(a, b, c, d) && TM.solapan(a, d, b, c) && TM.solapan(a, new Date('2026-11-20T11:01:00Z'), c, d) && !TM.solapan(c, d, a, b), 'solapamiento: si uno termina cuando empieza el otro, NO chocan');
  const ocupa = { _id: 'x1', calendarId: 'primary', estado: 'confirmado', fechaInicio: a, fechaFin: d };
  assert(TM.buscarChoque([ocupa], { ini: b, fin: c, calendarIds: ['primary'] }) === ocupa && TM.buscarChoque([{ ...ocupa, estado: 'cancelado' }], { ini: b, fin: d, calendarIds: ['primary'] }) === null && TM.buscarChoque([ocupa], { ini: b, fin: d, calendarIds: ['primary'], excluirId: 'x1' }) === null && TM.buscarChoque([ocupa], { ini: b, fin: d, calendarIds: ['Box A'] }) === null, 'choques: un cancelado no cuenta, uno mismo se excluye y otro puesto no choca');
  assert(TM.linea('  Juan \n\t Pérez\u0007 ', 80) === 'Juan Pérez' && TM.libre('a\r\n\r\n\r\n\r\nb\u0000', 100) === 'a\n\nb' && TM.linea('x'.repeat(200), 10).length === 10, 'saneado de texto: una línea / texto libre con renglones, sin caracteres de control');
  assert(TM.parsearPrecio('').valor === null && TM.parsearPrecio('1500,5').valor === 1500.5 && !TM.parsearPrecio(-1).ok && !TM.parsearPrecio('abc').ok && !TM.parsearPrecio({}).ok && !TM.parsearPrecio(2e9).ok, 'precio informativo: vacío o número entre 0 y mil millones');
  assert(TM.calendarioGeneral(null) === 'primary' && TM.calendarioGeneral({ idCalendar: { encrypted: 'x' } }, () => 'cal@group.calendar.google.com') === 'cal@group.calendar.google.com' && TM.calendarioGeneral({ idCalendar: { encrypted: 'x' } }, () => { throw new Error('no'); }) === 'primary', 'el puesto General es el calendario del bot (idCalendar, o "primary" como el bot)');
  const r1 = TM.resolverPuesto('  box   a ', { general: 'primary', conocidos: ['Box A'] });
  assert(r1.calendarId === 'Box A' && !r1.nuevo && TM.resolverPuesto('', { general: 'primary' }).esGeneral && TM.resolverPuesto('General', { general: 'primary' }).calendarId === 'primary' && TM.resolverPuesto('principal', { general: 'primary' }).esGeneral && TM.resolverPuesto('Sillón 2', { general: 'primary' }).nuevo && !TM.resolverPuesto('x'.repeat(41), { general: 'primary' }).ok && !TM.resolverPuesto({}, { general: 'primary' }).ok, 'resolver puesto: vacío o "General" = el del bot; reutiliza uno existente sin importar mayúsculas');
  assert(TM.validarPuestos(['Box A', 'Box B']).ok && !TM.validarPuestos(['Box A', 'box a']).ok && !TM.validarPuestos(['']).ok && !TM.validarPuestos(['x'.repeat(41)]).ok && !TM.validarPuestos(Array.from({ length: 21 }, (_, i) => `P${i}`)).ok && TM.validarPuestos(Array.from({ length: 20 }, (_, i) => `P${i}`)).ok && !TM.validarPuestos(['General']).ok && !TM.validarPuestos('x').ok && !TM.validarPuestos([5]).ok, 'lista de puestos: máximo 20, 1 a 40 caracteres, sin repetidos ni nombres reservados');

  // ── rutas ──
  const Turno = require('../main/bot-engine/models/Turno');
  const Config = require('../main/bot-engine/models/Config');
  const Profesional = require('../main/bot-engine/models/Profesional');
  const credenciales = require('../main/security/credentials-store');
  const caja = require('../main/gestion/caja');
  await Config.create({ userId: 'u1', negocio: 'Negocio de prueba', tipoNegocio: 'turnos' });
  await Config.create({ userId: 'u2', negocio: 'Otro', tipoNegocio: 'alojamiento' });
  await Config.create({ userId: 'u3', negocio: 'Con Google', tipoNegocio: 'turnos', idCalendar: credenciales.encrypt('cal123@group.calendar.google.com') });

  const app = express(); app.use(express.json());
  const sesion = (q, _r, n) => { q.user = { _id: q.headers['x-user'] || 'u1' }; n(); };
  const deps = { botService: { silenciarCliente() {}, recargarConfig() {}, getBotStatus: () => ({}), slotsActivos: () => [] }, requerirSesion: sesion, userDataDir: dir };
  app.use('/api/turnos', require('../main/local-api/routes/turnos.routes')(deps));
  app.use('/api/bot', require('../main/local-api/routes/bot.routes')(deps));
  app.use('/api/app/profesionales', require('../main/local-api/routes/profesionales.routes')(deps));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (method, p, body, user) => {
    const x = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const txt = await x.text(); let json = null; try { json = JSON.parse(txt); } catch { /* no es JSON */ }
    return { status: x.status, body: json, txt };
  };
  const alta = (extra = {}, user) => j('POST', '/turnos', { clienteNombre: 'Ana Pérez', clienteTelefono: '11 5555-1234', titulo: 'Trabajo A', detalle: 'Detalle libre', fecha: '2027-03-10', hora: '10:00', duracionMin: 60, ...extra }, user);

  // alta válida
  let r = await alta({ precioInformativo: '15000' });
  const t1 = r.body?.turno;
  assert(r.status === 201 && t1 && t1.estado === 'confirmado' && t1.origen === 'manual' && t1.googleSyncStatus === null && t1.calendarId === 'primary', 'alta manual: 201, confirmado, origen manual, sin Google, en el puesto General (el calendario del bot)');
  assert(t1.resumen === 'Trabajo A' && t1.descripcion === 'Detalle libre' && t1.clienteNombre === 'Ana Pérez' && t1.clienteTelefono === '11 5555-1234' && t1.precioInformativo === 15000, 'guarda trabajo, detalle, cliente, teléfono y precio informativo');
  assert(t1.fechaInicio === '2027-03-10T13:00:00.000Z' && t1.fechaFin === '2027-03-10T14:00:00.000Z', 'la hora de Argentina se guarda en UTC (10:00 → 13:00Z) y el fin suma la duración');
  assert(t1.pago === undefined && caja.ingresosDeTurnos([t1], '2027-03').length === 0, 'el precio es solo informativo: no crea un pago ni entra a la Caja');
  assert(!(await Turno.findOne({ _id: t1._id }).lean()).googleEventId, 'no queda con evento de Google Calendar');

  // inválidos
  const malos = [
    [{ clienteNombre: '' }, 'sin nombre'], [{ clienteNombre: 'x'.repeat(81) }, 'nombre largo'], [{ titulo: '   ' }, 'sin trabajo'], [{ titulo: 'x'.repeat(121) }, 'trabajo largo'],
    [{ fecha: '2027-02-30' }, 'fecha imposible'], [{ fecha: undefined }, 'sin fecha'], [{ hora: '25:00' }, 'hora inválida'], [{ hora: undefined }, 'sin hora'],
    [{ duracionMin: 4 }, 'duración corta'], [{ duracionMin: 1441 }, 'duración larga'], [{ duracionMin: 'mucho' }, 'duración texto'], [{ duracionMin: undefined }, 'sin duración'],
    [{ clienteTelefono: 'llamar a Ana' }, 'teléfono con letras'], [{ clienteTelefono: '1'.repeat(31) }, 'teléfono largo'], [{ detalle: 'x'.repeat(1001) }, 'detalle largo'],
    [{ precioInformativo: -5 }, 'precio negativo'], [{ puesto: 'x'.repeat(41) }, 'puesto largo'], [{ clienteNombre: { $ne: 1 } }, 'nombre con objeto'], [{ titulo: ['a'] }, 'trabajo con lista'],
  ];
  let todosRechazados = true; const noRechazados = [];
  for (const [extra, que] of malos) { const x = await alta(extra); if (x.status !== 400 || !x.body?.error) { todosRechazados = false; noRechazados.push(que); } }
  assert(todosRechazados, `campos inválidos → 400 con mensaje (${malos.length} casos)${noRechazados.length ? ' — no rechazó: ' + noRechazados.join(', ') : ''}`);
  assert((await Turno.find({ userId: 'u1' }).lean()).length === 1, 'los pedidos inválidos no dejaron nada guardado');
  r = await alta({ clienteNombre: '  Beto   Gómez  ', detalle: '', clienteTelefono: '', hora: '14:00' });
  assert(r.status === 201 && r.body.turno.clienteNombre === 'Beto Gómez' && r.body.turno.descripcion === '' && r.body.turno.precioInformativo === undefined, 'detalle, teléfono y precio son opcionales; el nombre se limpia');
  const tBeto = r.body.turno;

  // choques en el mismo puesto / paralelo en otro
  r = await alta({ titulo: 'Se pisa', hora: '10:30', duracionMin: 30 });
  assert(r.status === 409 && /Trabajo A/.test(r.body.error) && /10:00/.test(r.body.error) && /puesto General/.test(r.body.error) && /puestos distintos|otra hora/.test(r.body.error), 'choque en el mismo puesto → 409 que nombra el turno que ocupa el horario y sugiere otro puesto u otra hora');
  r = await alta({ titulo: 'Misma hora', hora: '10:00', duracionMin: 15 });
  assert(r.status === 409, 'misma hora de inicio en el mismo puesto → 409');
  r = await alta({ titulo: 'Justo después', hora: '11:00', duracionMin: 30 });
  assert(r.status === 201, 'si uno termina justo cuando empieza el otro, no chocan');
  const tDespues = r.body.turno;
  r = await alta({ titulo: 'Por delante', hora: '09:30', duracionMin: 45 });
  assert(r.status === 409, 'un turno que empieza antes y termina adentro del otro también choca');
  r = await alta({ titulo: 'Paralelo 1', hora: '10:00', duracionMin: 60, puesto: 'Box A' });
  const tBoxA = r.body?.turno;
  assert(r.status === 201 && tBoxA.calendarId === 'Box A', 'mismo horario en un puesto distinto: permitido (trabajos en paralelo)');
  r = await alta({ titulo: 'Paralelo 2', hora: '10:15', duracionMin: 30, puesto: 'box a' });
  assert(r.status === 409 && /Paralelo 1/.test(r.body.error) && /puesto Box A/.test(r.body.error), 'el puesto no distingue mayúsculas ("box a" es "Box A") y el choque nombra al puesto');
  r = await alta({ titulo: 'Paralelo 3', hora: '10:15', duracionMin: 30, puesto: 'Box B' });
  assert(r.status === 201, 'un tercer puesto también corre en paralelo');
  await Turno.findOneAndUpdate({ _id: tBoxA._id }, { $set: { estado: 'cancelado' } });
  r = await alta({ titulo: 'Reemplazo', hora: '10:00', duracionMin: 60, puesto: 'Box A' });
  assert(r.status === 201, 'un turno cancelado libera el horario');
  assert((await alta({ titulo: 'Otro usuario', hora: '10:00', duracionMin: 60 }, 'u3')).status === 201, 'los choques son de cada negocio: otro usuario puede usar el mismo horario');

  // el índice único de la base (carrera con el bot): la misma hora de inicio en el mismo puesto devuelve 409 con el mismo estilo
  const create0 = Turno.create;
  Turno.create = async () => { const e = new Error('E11000 duplicate key en turnos'); e.code = 11000; throw e; };
  r = await alta({ titulo: 'Carrera', hora: '18:00' });
  Turno.create = create0;
  assert(r.status === 409 && /misma hora/.test(r.body.error) && /puesto General/.test(r.body.error) && !/E11000/.test(r.txt), 'si el índice único de la base frena el alta (carrera con el bot) responde 409 sin mostrar el error técnico');
  const unico = await Turno.create({ userId: 'u1', calendarId: 'primary', fechaInicio: new Date('2027-05-05T12:00:00Z'), fechaFin: new Date('2027-05-05T12:30:00Z'), estado: 'confirmado', resumen: 'x' });
  let dup = null; try { await Turno.create({ userId: 'u1', calendarId: 'primary', fechaInicio: new Date('2027-05-05T12:00:00Z'), fechaFin: new Date('2027-05-05T12:15:00Z'), estado: 'confirmado', resumen: 'y' }); } catch (e) { dup = e; }
  assert(dup && dup.code === 11000 && unico, 'el índice único del modelo Turno sigue vigente (no se tocó)');
  await Turno.deleteOne({ _id: unico._id }).catch(() => {});

  // bot ↔ manual: el puesto General es el calendario que usa el bot ('primary' sin Google; el id de Google si está conectado)
  await Turno.create({ userId: 'u1', calendarId: 'primary', fechaInicio: new Date('2027-03-11T13:00:00Z'), fechaFin: new Date('2027-03-11T14:00:00Z'), estado: 'confirmado', resumen: 'Turno: Cliente del bot', clienteNombre: 'Cliente del bot' });
  r = await alta({ titulo: 'Sobre el del bot', fecha: '2027-03-11', hora: '10:30', duracionMin: 30 });
  assert(r.status === 409 && /Cliente del bot/.test(r.body.error), 'un turno manual en General no pisa un turno que agendó el bot');
  await Turno.create({ userId: 'u3', calendarId: 'cal123@group.calendar.google.com', fechaInicio: new Date('2027-03-11T13:00:00Z'), fechaFin: new Date('2027-03-11T14:00:00Z'), estado: 'confirmado', resumen: 'Turno: Con Google' });
  r = await alta({ titulo: 'Sobre el de Google', fecha: '2027-03-11', hora: '10:30', duracionMin: 30 }, 'u3');
  assert(r.status === 409, 'con Google Calendar conectado, General es ese calendario (el mismo que mira el bot)');
  r = await alta({ titulo: 'Libre', fecha: '2027-03-11', hora: '15:00', duracionMin: 30 }, 'u3');
  assert(r.status === 201 && r.body.turno.calendarId === 'cal123@group.calendar.google.com', 'y el turno manual queda en ese calendario');
  r = await j('GET', '/turnos/puestos', null, 'u3');
  assert(r.body.puestos.length === 1 && r.body.puestos[0].nombre === 'General' && !JSON.stringify(r.body).includes('cal123'), 'el id técnico de Google no aparece como puesto ni se expone');

  // alojamiento
  r = await alta({}, 'u2');
  assert(r.status === 400 && /alojamientos/.test(r.body.error), 'en alojamiento no se crean turnos a mano (usa otra lógica)');

  // profesional
  const prof = await Profesional.create({ userId: 'u1', nombre: 'Marta', comisionPct: 40, color: '#fff', activo: true });
  const profBaja = await Profesional.create({ userId: 'u1', nombre: 'Baja', comisionPct: 10, color: '#fff', activo: false });
  r = await alta({ titulo: 'Con profesional', hora: '16:00', duracionMin: 30, profesionalId: String(prof._id) });
  const tProf = r.body?.turno;
  const tAsig = (await alta({ titulo: 'Asignado después', hora: '17:00', duracionMin: 30 })).body.turno;
  await j('POST', '/app/profesionales/asignar', { turnoId: tAsig._id, profesionalId: String(prof._id) });
  const asig = await Turno.findOne({ _id: tAsig._id }).lean();
  assert(r.status === 201 && tProf.profesionalId === String(prof._id) && tProf.profesionalNombre === 'Marta' && tProf.comisionPct === 40
    && tProf.profesionalId === asig.profesionalId && tProf.profesionalNombre === asig.profesionalNombre && tProf.comisionPct === asig.comisionPct, 'el profesional queda igual que con /app/profesionales/asignar (id, nombre y comisión de ese momento)');
  assert((await alta({ titulo: 'x', hora: '19:00', profesionalId: 'nadie' })).status === 400 && (await alta({ titulo: 'x', hora: '19:00', profesionalId: String(profBaja._id) })).status === 400, 'un profesional que no existe o está dado de baja se rechaza');

  // edición
  r = await j('PATCH', `/turnos/${t1._id}`, { detalle: 'Nuevo detalle\ncon renglones', clienteNombre: 'Ana P.', clienteTelefono: '', titulo: 'Trabajo A2', precioInformativo: '' });
  let e1 = await Turno.findOne({ _id: t1._id }).lean();
  assert(r.status === 200 && e1.descripcion === 'Nuevo detalle\ncon renglones' && e1.clienteNombre === 'Ana P.' && e1.clienteTelefono === '' && e1.resumen === 'Trabajo A2' && e1.precioInformativo === null, 'editar detalle, cliente, trabajo y precio sin tocar el horario');
  assert(e1.fechaInicio.toISOString() === t1.fechaInicio && e1.fechaFin.toISOString() === t1.fechaFin && e1.estado === 'confirmado' && e1.origen === 'manual', '…el horario, el estado y el origen siguen igual');
  r = await j('PATCH', `/turnos/${t1._id}`, { fecha: '2027-03-10', hora: '10:00', duracionMin: 60, puesto: '' });
  assert(r.status === 200, 'mandar el mismo horario y puesto no cuenta como cambio ni choca consigo mismo');
  r = await j('PATCH', `/turnos/${t1._id}`, { duracionMin: 45 });
  e1 = await Turno.findOne({ _id: t1._id }).lean();
  assert(r.status === 200 && e1.fechaFin.toISOString() === '2027-03-10T13:45:00.000Z' && e1.fechaInicio.toISOString() === t1.fechaInicio, 'cambiar solo la duración acorta el fin y conserva el inicio (se excluye a sí mismo del choque)');
  r = await j('PATCH', `/turnos/${t1._id}`, { duracionMin: 75 });
  assert(r.status === 409 && /Justo después/.test(r.body.error), 'estirar la duración hasta pisar a otro turno del mismo puesto → 409');
  r = await j('PATCH', `/turnos/${t1._id}`, { hora: '12:00' });
  e1 = await Turno.findOne({ _id: t1._id }).lean();
  assert(r.status === 200 && e1.fechaInicio.toISOString() === '2027-03-10T15:00:00.000Z' && e1.fechaFin.toISOString() === '2027-03-10T15:45:00.000Z', 'reprogramar la hora mueve inicio y fin conservando la duración');
  r = await j('PATCH', `/turnos/${t1._id}`, { hora: '11:15' });
  assert(r.status === 409 && /Justo después/.test(r.body.error), 'reprogramar sobre otro turno → 409');
  const antesRechazo = await Turno.findOne({ _id: t1._id }).lean();
  assert(antesRechazo.fechaInicio.toISOString() === '2027-03-10T15:00:00.000Z', '…y el rechazo no dejó nada a medias');
  r = await j('PATCH', `/turnos/${t1._id}`, { fecha: '2027-03-12', hora: '09:00', puesto: 'Box A' });
  e1 = await Turno.findOne({ _id: t1._id }).lean();
  assert(r.status === 200 && e1.calendarId === 'Box A' && e1.fechaInicio.toISOString() === '2027-03-12T12:00:00.000Z', 'reprogramar día, hora y puesto a la vez');
  r = await j('PATCH', `/turnos/${tBeto._id}`, { puesto: 'Sillón 3' });
  assert(r.status === 200 && (await Turno.findOne({ _id: tBeto._id }).lean()).calendarId === 'Sillón 3', 'pasar un turno a un puesto nuevo lo crea');
  r = await j('PATCH', `/turnos/${tDespues._id}`, { puesto: 'Box A', fecha: '2027-03-12', hora: '09:30', duracionMin: 30 });
  assert(r.status === 409 && /Trabajo A2/.test(r.body.error) && /puesto Box A/.test(r.body.error), 'mover un turno a un puesto donde ya hay otro a esa hora → 409');
  for (const [extra, que] of [[{ clienteNombre: '' }, 'nombre vacío'], [{ titulo: '' }, 'trabajo vacío'], [{ fecha: '2027-99-01' }, 'fecha'], [{ hora: '7' }, 'hora'], [{ duracionMin: 0 }, 'duración'], [{ detalle: 'x'.repeat(1001) }, 'detalle'], [{ clienteTelefono: 'abc' }, 'teléfono'], [{ puesto: 'x'.repeat(41) }, 'puesto'], [{ titulo: { a: 1 } }, 'tipo']]) {
    const x = await j('PATCH', `/turnos/${tDespues._id}`, extra);
    assert(x.status === 400, `editar con ${que} inválido → 400`);
  }
  assert((await j('PATCH', '/turnos/inexistente', { detalle: 'x' })).status === 404 && (await j('PATCH', `/turnos/${tDespues._id}`, { detalle: 'x' }, 'u3')).status === 404, 'turno que no existe o de otro negocio → 404');
  r = await j('PATCH', `/turnos/${tProf._id}`, { profesionalId: '' });
  assert(r.status === 200 && (await Turno.findOne({ _id: tProf._id }).lean()).profesionalId === '', 'se puede sacar el profesional editando');
  r = await j('PATCH', `/turnos/${tProf._id}`, { profesionalId: String(prof._id) });
  assert(r.status === 200 && (await Turno.findOne({ _id: tProf._id }).lean()).profesionalNombre === 'Marta' && (await j('PATCH', `/turnos/${tProf._id}`, { profesionalId: 'nadie' })).status === 400, 'o ponérselo de nuevo (y uno que no existe se rechaza)');

  // turno sincronizado con Google: no se reprograma, pero sí se edita el detalle y el cliente
  const sync = await Turno.create({ userId: 'u1', calendarId: 'primary', fechaInicio: new Date('2027-04-01T13:00:00Z'), fechaFin: new Date('2027-04-01T14:00:00Z'), estado: 'confirmado', resumen: 'Turno: Sincronizado', clienteNombre: 'Sincronizado', googleEventId: 'evt123', googleSyncStatus: 'synced' });
  for (const [extra, que] of [[{ hora: '15:00' }, 'la hora'], [{ fecha: '2027-04-02' }, 'el día'], [{ puesto: 'Box A' }, 'el puesto'], [{ duracionMin: 90 }, 'la duración']]) {
    const x = await j('PATCH', `/turnos/${sync._id}`, extra);
    assert(x.status === 400 && /Google Calendar/.test(x.body.error) && /cancel/i.test(x.body.error), `turno de Google: no deja cambiar ${que} y explica que hay que cancelar y crear otro`);
  }
  assert((await Turno.findOne({ _id: sync._id }).lean()).fechaInicio.toISOString() === '2027-04-01T13:00:00.000Z', '…y el horario sigue igual');
  r = await j('PATCH', `/turnos/${sync._id}`, { detalle: 'Llega con perro', clienteNombre: 'Sincro Nizado', clienteTelefono: '2241 000000', fecha: '2027-04-01', hora: '10:00', duracionMin: 60 });
  const s2 = await Turno.findOne({ _id: sync._id }).lean();
  assert(r.status === 200 && s2.descripcion === 'Llega con perro' && s2.clienteNombre === 'Sincro Nizado' && s2.googleEventId === 'evt123', 'turno de Google: sí se edita el detalle y los datos del cliente (aunque se mande el mismo horario)');
  const pend = await Turno.create({ userId: 'u1', calendarId: 'primary', fechaInicio: new Date('2027-04-03T13:00:00Z'), fechaFin: new Date('2027-04-03T14:00:00Z'), estado: 'pendiente', resumen: 'Turno: Pendiente', clienteNombre: 'Pendiente' });
  r = await j('PATCH', `/turnos/${pend._id}`, { hora: '15:00' });
  assert(r.status === 400 && /pago/.test(r.body.error) && (await j('PATCH', `/turnos/${pend._id}`, { detalle: 'ok' })).status === 200, 'un turno que espera el pago no se reprograma (el detalle sí se edita)');

  // cancelado
  const cancelado = (await alta({ titulo: 'Va a cancelarse', fecha: '2027-06-01', hora: '09:00' })).body.turno;
  assert((await j('DELETE', `/turnos/${cancelado._id}`)).status === 200, 'cancelar sigue funcionando (DELETE)');
  r = await j('PATCH', `/turnos/${cancelado._id}`, { detalle: 'x' });
  assert(r.status === 400 && /cancelado/.test(r.body.error), 'un turno cancelado no se edita');
  assert((await j('PATCH', `/turnos/${cancelado._id}`, { notas: 'queda la nota' })).status === 200, '…(las notas/estado de siempre se comportan como antes)');
  assert((await alta({ titulo: 'Ocupa el lugar', fecha: '2027-06-01', hora: '09:00' })).status === 201, 'y su horario quedó libre');

  // regresión: PATCH de estado / notas / ausente igual que hoy
  const pasado = await Turno.create({ userId: 'u1', calendarId: 'primary', fechaInicio: new Date(Date.now() - 5 * 86400000), fechaFin: new Date(Date.now() - 5 * 86400000 + 3600000), estado: 'confirmado', resumen: 'Pasado', clienteNombre: 'Pasado', pago: { monto: 5000 } });
  r = await j('PATCH', `/turnos/${pasado._id}`, { ausente: true });
  assert(r.status === 200 && r.body.turno.ausente === true && r.body.turno.estado === 'confirmado' && r.body.turno.pago.monto === 5000, 'regresión: "no vino" marca ausente y sigue confirmado con su cobro');
  r = await j('PATCH', `/turnos/${pasado._id}`, { notas: 'Nota interna', estado: 'confirmado' });
  assert(r.status === 200 && r.body.turno.pago.notas === 'Nota interna' && r.body.turno.pago.monto === 5000, 'regresión: las notas van a pago.notas sin pisar el cobro');
  assert((await j('PATCH', `/turnos/${t1._id}`, { ausente: true })).status === 400 && (await j('PATCH', `/turnos/${pasado._id}`, { ausente: 'si' })).status === 400, 'regresión: no se marca "no vino" un turno futuro ni con valor raro');
  assert((await j('PATCH', '/turnos/nadie', { notas: 'x' })).status === 404 && (await j('DELETE', '/turnos/nadie')).status === 404, 'regresión: turno inexistente → 404');
  r = await j('PATCH', `/turnos/${pasado._id}`, {});
  assert(r.status === 200 && r.body.turno._id === String(pasado._id), 'regresión: un PATCH vacío devuelve el turno como antes');

  // puestos
  r = await j('GET', '/turnos/puestos');
  const nombres = r.body.puestos.map((p) => p.nombre);
  assert(r.status === 200 && nombres[0] === 'General' && r.body.puestos[0].general === true && r.body.puestos[0].valor === '' && nombres.includes('Box A') && nombres.includes('Box B') && nombres.includes('Sillón 3') && r.body.maximo === 20 && r.body.configurados.length === 0, 'GET puestos: General siempre primero, más los que ya aparecen en turnos');
  assert(r.body.puestos[0].turnos >= 3 && r.body.puestos.find((p) => p.nombre === 'Box B').turnos === 1, '…con la cantidad de turnos activos de cada uno');
  r = await j('PUT', '/turnos/puestos', { puestos: ['  Puesto   1 ', 'Box A', 'Mesa 7'] });
  assert(r.status === 200 && r.body.configurados.join() === 'Puesto 1,Box A,Mesa 7' && r.body.puestos.filter((p) => p.nombre === 'Box A').length === 1 && r.body.puestos.map((p) => p.nombre).includes('Mesa 7'), 'PUT puestos guarda la lista (limpia, sin duplicar los que ya tienen turnos)');
  assert((await Config.findOne({ userId: 'u1' }).lean()).puestosAgenda.join() === 'Puesto 1,Box A,Mesa 7' && (await Config.findOne({ userId: 'u1' }).lean()).negocio === 'Negocio de prueba', 'se guarda en un campo nuevo y opcional de la configuración, sin tocar lo demás');
  assert((await j('PUT', '/turnos/puestos', { puestos: ['Box A', 'box a'] })).status === 400, 'puestos repetidos (sin importar mayúsculas) → 400');
  assert((await j('PUT', '/turnos/puestos', { puestos: Array.from({ length: 21 }, (_, i) => `P${i}`) })).status === 400, 'más de 20 puestos → 400');
  assert((await j('PUT', '/turnos/puestos', { puestos: Array.from({ length: 20 }, (_, i) => `P${i}`) })).status === 200, 'justo 20 puestos → permitido');
  assert((await j('PUT', '/turnos/puestos', { puestos: ['x'.repeat(41)] })).status === 400 && (await j('PUT', '/turnos/puestos', { puestos: [''] })).status === 400 && (await j('PUT', '/turnos/puestos', { puestos: ['General'] })).status === 400 && (await j('PUT', '/turnos/puestos', { puestos: 'Box' })).status === 400 && (await j('PUT', '/turnos/puestos', {})).status === 400, 'nombre vacío, de más de 40, reservado o lista que no es lista → 400');
  assert((await j('GET', '/turnos/puestos')).body.configurados.length === 20, 'lo inválido no pisó la lista guardada');
  await j('PUT', '/turnos/puestos', { puestos: ['Puesto 1', 'Box A'] });
  r = await alta({ titulo: 'En puesto guardado', fecha: '2027-07-01', hora: '08:00', puesto: 'puesto 1' });
  assert(r.status === 201 && r.body.turno.calendarId === 'Puesto 1', 'un puesto guardado se reutiliza sin importar mayúsculas');
  assert((await j('PUT', '/turnos/puestos', { puestos: ['Otro'] }, 'u3')).status === 200 && (await j('GET', '/turnos/puestos')).body.configurados.join() === 'Puesto 1,Box A', 'los puestos son de cada negocio');

  // /bot/agenda: campos nuevos, aditivos
  r = await j('GET', '/bot/agenda');
  const conf = r.body.confirmadas;
  const m1 = conf.find((x) => x._id === String(t1._id));
  const mBot = conf.find((x) => x.nombre === 'Cliente del bot');
  const mProf = conf.find((x) => x._id === String(tProf._id));
  assert(r.status === 200 && m1 && m1.puesto === 'Box A' && m1.unidad === 'Box A' && m1.origen === 'manual' && m1.titulo === 'Trabajo A2' && m1.detalle === 'Nuevo detalle\ncon renglones' && m1.duracionMin === 45 && m1.hora === '09:00' && m1.horaFin === '09:45' && m1.fecha === '2027-03-12' && m1.sincronizadoGoogle === false, '/agenda: trae puesto, titulo, detalle, origen y duracionMin de los turnos manuales (y conserva unidad/hora/horaFin)');
  assert(mBot && mBot.origen === '' && mBot.puesto === '' && mBot.unidad === 'primary' && mBot.duracionMin === 60 && mBot.titulo === 'Turno: Cliente del bot', '/agenda: un turno del bot sale igual que antes (unidad sin cambios) más los campos nuevos');
  assert(mProf && mProf.profesionalId === String(prof._id) && mProf.profesionalNombre === 'Marta' && mProf.totalPrecio === 0 && mProf.total === 0, '/agenda: profesional y totales siguen como antes');
  assert(conf.find((x) => x._id === String(sync._id)).sincronizadoGoogle === true && conf.find((x) => x._id === String(t1._id)).precioInformativo === null, '/agenda: indica si el turno está en Google y el precio informativo');
  for (const k of ['nombre', 'telefono', 'email', 'fecha', 'hora', 'horaFin', 'unidad', 'totalPrecio', 'total', 'estado', 'turnoId', '_id', 'profesionalId', 'profesionalNombre']) assert(k in m1, `/agenda: sigue el campo "${k}"`);
  assert(r.body.tipoNegocio === 'turnos' && Array.isArray(r.body.pendientes) && Array.isArray(r.body.logs), '/agenda: sigue trayendo pendientes, logs y tipo de negocio');

  // errores 500 sin detalle técnico
  const find0 = Turno.find;
  Turno.find = () => { throw new Error('SECRETO-INTERNO-123'); };
  const origErr = console.error; console.error = () => {};
  const x500 = await j('GET', '/turnos'); const x500b = await j('GET', '/turnos/puestos');
  Turno.find = find0; console.error = origErr;
  assert(x500.status === 500 && !/SECRETO/.test(x500.txt) && x500b.status === 500 && !/SECRETO/.test(x500b.txt), 'los errores 500 no devuelven el detalle técnico (va al log)');

  // aislamiento
  const ajeno = await Turno.create({ userId: 'u3', calendarId: 'X', fechaInicio: new Date('2027-08-01T12:00:00Z'), fechaFin: new Date('2027-08-01T13:00:00Z'), estado: 'confirmado', resumen: 'Ajeno', clienteNombre: 'Ajeno' });
  assert((await j('PATCH', `/turnos/${ajeno._id}`, { detalle: 'hack' })).status === 404 && (await Turno.findOne({ _id: ajeno._id }).lean()).descripcion === undefined, 'no se puede editar el turno de otro negocio');

  srv.close();
  console.log(`\n${fallas ? '❌' : '✅'} turnos-manual: ${total - fallas}/${total} pruebas ${fallas ? 'FALLARON ' + fallas : 'pasaron'}.\n`);
  if (fallas) process.exit(1);
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
