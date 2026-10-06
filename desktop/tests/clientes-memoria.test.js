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

  console.log('\n✅ Todos los tests de clientes-memoria pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
