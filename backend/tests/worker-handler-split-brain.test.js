// tests/worker-handler-split-brain.test.js
// Regresión de un hueco encontrado en auditoría: worker.handler.js guardaba
// la conexión del worker en una única variable module-level (`workerSocket`)
// sin verificar identidad. Si una conexión nueva llegaba mientras el backend
// todavía creía que la vieja seguía activa (reconexión con socket nuevo
// antes de que la vieja avisara su desconexión, dos deploys solapados),
// el 'disconnect' de la vieja nunca limpiaba el estado de los usuarios que
// estaba sirviendo — quedaban con el dashboard diciendo "conectado" pero el
// bot mudo, indefinidamente. esConexionDuplicada() es la guardia que evita
// eso: detecta la conexión duplicada para limpiar el estado del worker viejo
// de inmediato, en vez de esperar un evento que puede no llegar a tiempo.
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akira-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.WORKER_SECRET = process.env.WORKER_SECRET || 'test_worker_secret';

const { esConexionDuplicada } = require('../services/worker.handler');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[worker-handler-split-brain] Tests:');

assert(esConexionDuplicada(null, 'socket-nuevo') === false, 'sin worker previo conectado, no hay conexión duplicada');
assert(
  esConexionDuplicada({ id: 'socket-viejo' }, 'socket-viejo') === false,
  'el mismo socket reconectando con el mismo id no cuenta como duplicado'
);
assert(
  esConexionDuplicada({ id: 'socket-viejo' }, 'socket-nuevo') === true,
  'un socket con id distinto mientras el viejo sigue registrado SÍ es una conexión duplicada — hay que limpiar el viejo'
);
assert(
  esConexionDuplicada(undefined, 'socket-nuevo') === false,
  'workerSocket undefined (nunca hubo conexión) no dispara falso positivo'
);

console.log('\n✅ Todos los tests de worker-handler-split-brain pasaron.\n');
