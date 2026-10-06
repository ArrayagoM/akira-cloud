// tests/mongoose-lite.test.js
// Cubre el motor de shims (db/mongoose-lite.js + db/store.js) contra los
// patrones REALES que usa akira.bot.js/calendar.service.js/waitlist.service.js
// (ver grep hecho durante el diseño): find/findOne/findById,
// findByIdAndUpdate/findOneAndUpdate con $set de paths con punto y con
// upsert, updateMany con $in, revivir fechas, y el índice único parcial
// anti-doble-reserva de Turno.
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'akira-test-')), 'test.db');
const store = require('../main/db/store');
store.abrir(dbPath);

const Turno = require('../main/bot-engine/models/Turno');
const BotCliente = require('../main/bot-engine/models/BotCliente');
const WaitlistEntry = require('../main/bot-engine/models/WaitlistEntry');
const Config = require('../main/bot-engine/models/Config');

async function run() {
  console.log('\n[mongoose-lite] Tests:');

  // ── create + find + revive de fechas ───────────────────────────
  const ini = new Date('2026-07-10T12:00:00.000Z');
  const fin = new Date('2026-07-10T13:00:00.000Z');
  const t1 = await Turno.create({
    userId: 'u1', calendarId: 'principal', resumen: 'Corte', fechaInicio: ini, fechaFin: fin, estado: 'confirmado',
  });
  assert(!!t1._id, 'create() genera un _id');
  assert(t1.fechaInicio instanceof Date, 'create() devuelve fechaInicio como Date, no string');

  const leido = await Turno.findById(t1._id).lean();
  assert(leido.fechaInicio instanceof Date, 'findById().lean() revive fechaInicio como Date real');
  assert(leido.fechaInicio.toISOString() === ini.toISOString(), 'la fecha revivida es exactamente la misma');

  // ── findOne con operadores $ne/$lt/$gt (conflicto de horario) ──
  const conflicto = await Turno.findOne({
    userId: 'u1', calendarId: 'principal', estado: { $ne: 'cancelado' },
    fechaInicio: { $lt: new Date('2026-07-10T12:30:00.000Z') },
    fechaFin: { $gt: new Date('2026-07-10T12:30:00.000Z') },
  }).lean();
  assert(!!conflicto, 'detecta conflicto de horario con $lt/$gt (mismo criterio que calendar.service.js)');

  const sinConflicto = await Turno.findOne({
    userId: 'u1', calendarId: 'principal', estado: { $ne: 'cancelado' },
    fechaInicio: { $lt: new Date('2026-07-10T14:30:00.000Z') },
    fechaFin: { $gt: new Date('2026-07-10T14:00:00.000Z') },
  }).lean();
  assert(!sinConflicto, 'no detecta conflicto fuera del rango horario');

  // ── índice único parcial anti-doble-reserva ─────────────────────
  let duplicoFalló = false;
  try {
    await Turno.create({ userId: 'u1', calendarId: 'principal', resumen: 'Otro', fechaInicio: ini, fechaFin: fin, estado: 'pendiente' });
  } catch (e) {
    duplicoFalló = true;
    assert(e.code === 11000, 'la violación del índice único tira un error con code 11000 (igual que Mongo)');
  }
  assert(duplicoFalló, 'NO se puede crear un 2do turno pendiente/confirmado en el mismo slot (anti doble-reserva)');

  await Turno.findByIdAndUpdate(t1._id, { estado: 'cancelado' });
  const t2 = await Turno.create({ userId: 'u1', calendarId: 'principal', resumen: 'Reagendado', fechaInicio: ini, fechaFin: fin, estado: 'confirmado' });
  assert(!!t2._id, 'SÍ se puede reutilizar el slot una vez que el turno anterior está cancelado (índice único es PARCIAL)');

  // ── findByIdAndUpdate con paths con punto ($set anidado) ────────
  const t3 = await Turno.create({ userId: 'u2', calendarId: 'principal', resumen: 'Pago', fechaInicio: new Date('2026-08-01T10:00:00.000Z'), fechaFin: new Date('2026-08-01T11:00:00.000Z'), estado: 'confirmado' });
  const actualizado = await Turno.findByIdAndUpdate(t3._id, { 'pago.monto': 1500, 'pago.metodo': 'mercadopago' }, { new: true });
  assert(actualizado.pago.monto === 1500 && actualizado.pago.metodo === 'mercadopago', 'findByIdAndUpdate soporta paths con punto (pago.monto) como Mongoose real');

  // ── findOneAndUpdate con upsert + $setOnInsert ──────────────────
  await BotCliente.findOneAndUpdate(
    { userId: 'u1', jid: 'cliente1@s.whatsapp.net' },
    { $setOnInsert: { userId: 'u1', jid: 'cliente1@s.whatsapp.net', nombre: 'Juan', historial: [] } },
    { upsert: true, new: false, setDefaultsOnInsert: true },
  );
  const cliente = await BotCliente.findOne({ userId: 'u1', jid: 'cliente1@s.whatsapp.net' }).lean();
  assert(cliente?.nombre === 'Juan', 'findOneAndUpdate con upsert+$setOnInsert crea el documento nuevo');

  let dupCliente = false;
  try {
    await BotCliente.create({ userId: 'u1', jid: 'cliente1@s.whatsapp.net', nombre: 'Otro' });
  } catch (e) { dupCliente = e.code === 11000; }
  assert(dupCliente, 'índice único {userId,jid} de BotCliente se hace cumplir (registrarNuevo depende de esto)');

  // ── documento hidratado: mutar + .save() ────────────────────────
  const wl = await WaitlistEntry.create({ userId: 'u1', jid: 'j1', fecha: '2026-09-01', estado: 'esperando' });
  const wlFresco = await WaitlistEntry.findById(wl._id);
  wlFresco.estado = 'contactado';
  await wlFresco.save();
  const wlReleido = await WaitlistEntry.findById(wl._id).lean();
  assert(wlReleido.estado === 'contactado', 'mutar un documento no-lean y llamar .save() persiste el cambio (patrón de waitlist.service.js)');

  // ── updateMany con $in ────────────────────────────────────────
  await BotCliente.create({ userId: 'u1', jid: 'c2@s.whatsapp.net', silenciado: true });
  await BotCliente.create({ userId: 'u1', jid: 'c3@s.whatsapp.net', silenciado: true });
  const r = await BotCliente.updateMany({ userId: 'u1', jid: { $in: ['c2@s.whatsapp.net', 'c3@s.whatsapp.net'] } }, { $set: { silenciado: false } });
  assert(r.modifiedCount === 2, 'updateMany con $in actualiza todos los docs que matchean (des-silenciar al arrancar)');
  const c2 = await BotCliente.findOne({ jid: 'c2@s.whatsapp.net' }).lean();
  assert(c2.silenciado === false, 'updateMany realmente aplicó el $set');

  // ── proyección: findOne(query, "-historial") ────────────────────
  await BotCliente.create({ userId: 'u9', jid: 'c9@s.whatsapp.net', historial: [{ role: 'user', content: 'hola' }] });
  const sinHistorial = await BotCliente.findOne({ userId: 'u9', jid: 'c9@s.whatsapp.net' }, '-historial').lean();
  assert(sinHistorial.historial === undefined, 'proyección de exclusión "-historial" funciona (evita cargar historial pesado)');

  // ── Config: setKey/getKey/estaCompleta/save (cifrado local) ─────
  const cfg = await Config.create({ userId: 'u1', miNombre: 'Juan', negocio: 'Barbería' });
  cfg.setKey('keyGroq', 'gsk_test_12345');
  await cfg.save();
  const cfgReleido = await Config.findOne({ userId: 'u1' });
  assert(cfgReleido.getKey('keyGroq') === 'gsk_test_12345', 'Config.setKey/getKey cifran y descifran correctamente con credentials-store');
  assert(cfgReleido.estaCompleta() === true, 'estaCompleta() true cuando hay keyGroq+miNombre+negocio');
  assert(JSON.stringify(cfgReleido).includes('gsk_test_12345') === false, 'el valor plano de la key nunca queda en el JSON (solo el blob cifrado)');

  // ── operadores usados por las rutas de la plataforma ───────────
  await Config.create({ userId: 'u7', chatsIgnorados: ['111'], diasBloqueados: [] });
  await Config.findOneAndUpdate({ userId: 'u7' }, { $addToSet: { chatsIgnorados: '222' } }, { new: true });
  await Config.findOneAndUpdate({ userId: 'u7' }, { $addToSet: { chatsIgnorados: '222' } }, { new: true });
  let c7 = await Config.findOne({ userId: 'u7' }).lean();
  assert(c7.chatsIgnorados.length === 2, '$addToSet agrega sin duplicar');
  await Config.findOneAndUpdate({ userId: 'u7' }, { $pull: { chatsIgnorados: '111' } });
  c7 = await Config.findOne({ userId: 'u7' }).lean();
  assert(c7.chatsIgnorados.length === 1 && c7.chatsIgnorados[0] === '222', '$pull quita el valor');
  await Config.findOneAndUpdate({ userId: 'u7' }, { $push: { catalogo: { nombre: 'X' } } });
  c7 = await Config.findOne({ userId: 'u7' }).lean();
  assert(c7.catalogo.length === 1, '$push agrega al array');

  await BotCliente.create({ userId: 'u8', jid: 'a@s.whatsapp.net', nombre: 'María Pérez', etiquetas: ['VIP'], turnosConfirmados: [{ fecha: 'x' }] });
  await BotCliente.create({ userId: 'u8', jid: 'b@s.whatsapp.net', nombre: 'Pedro', etiquetas: [], turnosConfirmados: [] });
  const porNombre = await BotCliente.find({ userId: 'u8', $or: [{ nombre: new RegExp('mar', 'i') }] }).lean();
  assert(porNombre.length === 1 && porNombre[0].nombre === 'María Pérez', 'búsqueda por RegExp (case-insensitive) dentro de $or');
  const vip = await BotCliente.find({ userId: 'u8', etiquetas: 'VIP' }).lean();
  assert(vip.length === 1, 'igualdad contra un campo array = "contiene" (filtro VIP)');
  const conTurno = await BotCliente.find({ userId: 'u8', 'turnosConfirmados.0': { $exists: true } }).lean();
  assert(conTurno.length === 1, 'path con índice numérico + $exists (filtro con_turno)');
  const pagina = await BotCliente.find({ userId: 'u8' }).sort({ jid: 1 }).skip(1).limit(1).lean();
  assert(pagina.length === 1 && pagina[0].jid === 'b@s.whatsapp.net', 'skip/limit paginan');
  const del = await BotCliente.deleteOne({ userId: 'u8', jid: 'a@s.whatsapp.net' });
  assert(del.deletedCount === 1, 'deleteOne borra y reporta deletedCount');
  const sinHist = await BotCliente.findOneAndUpdate({ userId: 'u8', jid: 'b@s.whatsapp.net' }, { nombre: 'Pedro 2' }, { new: true, select: '-historial' });
  assert(sinHist.nombre === 'Pedro 2' && sinHist.historial === undefined, 'findOneAndUpdate respeta la opción select');

  console.log('\n✅ Todos los tests de mongoose-lite pasaron.\n');
  store.cerrar();
}

run().catch((e) => {
  console.error('❌ FALLÓ:', e.message, e.stack);
  process.exit(1);
});
