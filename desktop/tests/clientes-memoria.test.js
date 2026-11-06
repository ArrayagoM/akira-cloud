// tests/clientes-memoria.test.js — la memoria de cada cliente (historial,
// nombre, turnos) tiene que persistir en la base local. El servicio original
// consulta mongoose.connection.readyState antes de guardar y de leer; en
// escritorio eso se responde "conectada" (ver esm-compat.js).
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

require('../main/db/store').abrir(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'akira-mem-')), 'a.db'));

(async () => {
  console.log('\n[clientes-memoria] Tests:');
  await require('../main/esm-compat').preparar();

  const crear = require('../main/bot-engine/services/bot/mongo-clientes.service');
  const logs = [];
  const log = (m) => logs.push(m);
  const jid = '5492241497226@s.whatsapp.net';

  const a = crear('user1', log);
  await a.inicializar();
  assert(a.cargarMemoria(jid) === null, 'cliente nuevo: sin memoria todavía');

  a.guardarMemoria(jid, { nombre: 'Ana', telefono: '2241497226', historial: [{ role: 'user', content: 'Hola' }, { role: 'assistant', content: '¡Hola Ana!' }], turnosConfirmados: [] });
  await new Promise((r) => setTimeout(r, 300)); // el guardado en base es en segundo plano
  assert(!logs.some((l) => /skip|⚠️/.test(l)), 'no se saltea el guardado por "base desconectada"');

  // Simula reiniciar la app: servicio nuevo, caché vacía, lee de la base local
  const b = crear('user1', log);
  await b.inicializar();
  const m = b.cargarMemoria(jid);
  assert(m && m.nombre === 'Ana', 'después de reiniciar, el cliente y su nombre siguen ahí');
  assert(m.historial.length === 2 && m.historial[0].content === 'Hola', 'el historial de la conversación se conserva');

  const c = crear('user1', log);
  const m2 = await c.cargarMemoriaAsync(jid);
  assert(m2 && m2.nombre === 'Ana', 'cargarMemoriaAsync también encuentra al cliente (ya no devuelve null por "no conectado")');

  const otro = crear('user2', log); await otro.inicializar();
  assert(otro.cargarMemoria(jid) === null, 'otro negocio no ve la memoria de este (aislamiento por userId)');
  // silencios al reiniciar: la pausa MANUAL del dueño se conserva; la automática (derivación) y los registros viejos se levantan
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const jidM = '5492241000001@s.whatsapp.net'; const jidA = '5492241000002@s.whatsapp.net'; const jidV = '5492241000003@s.whatsapp.net';
  const d = crear('user3', log); await d.inicializar();
  for (const j of [jidM, jidA, jidV]) d.guardarMemoria(j, { nombre: 'C' + j.slice(-3), telefono: j, historial: [], turnosConfirmados: [] });
  await new Promise((r) => setTimeout(r, 300));
  await BotCliente.findOneAndUpdate({ userId: 'user3', jid: jidM }, { $set: { silenciado: true, silenciadoManual: true } });
  await BotCliente.findOneAndUpdate({ userId: 'user3', jid: jidA }, { $set: { silenciado: true, silenciadoManual: false } });
  await BotCliente.findOneAndUpdate({ userId: 'user3', jid: jidV }, { $set: { silenciado: true } });
  const e = crear('user3', log); await e.inicializar();
  assert(e.cargarMemoria(jidM).silenciado === true && e.cargarMemoria(jidM).silenciadoManual === true, 'tras reiniciar, el chat que el dueño pausó sigue pausado');
  assert(e.cargarMemoria(jidA).silenciado === false && e.cargarMemoria(jidV).silenciado === false, 'tras reiniciar, el silencio automático y el de registros viejos se levantan (como antes)');
  await new Promise((r) => setTimeout(r, 300));
  const f = crear('user3', log);
  assert((await f.cargarMemoriaAsync(jidM)).silenciado === true && (await f.cargarMemoriaAsync(jidA)).silenciado === false, 'cargarMemoriaAsync aplica la misma regla');
  const m1 = e.cargarMemoria(jidM); e.guardarMemoria(jidM, { ...m1, historial: [{ role: 'user', content: 'hola' }] });
  await new Promise((r) => setTimeout(r, 300));
  assert((await BotCliente.findOne({ userId: 'user3', jid: jidM })).silenciadoManual === true, 'seguir charlando con un chat pausado no le quita la pausa');
  e.guardarMemoria(jidM, { ...e.cargarMemoria(jidM), silenciado: false });
  await new Promise((r) => setTimeout(r, 300));
  const rM = await BotCliente.findOne({ userId: 'user3', jid: jidM });
  assert(rM.silenciado === false && rM.silenciadoManual === false, 'al reactivar el chat la marca de pausa manual se borra');


  console.log('\n✅ Todos los tests de clientes-memoria pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
