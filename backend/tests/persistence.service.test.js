// tests/persistence.service.test.js
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crearPersistencia = require('../services/bot/persistence.service');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-test-'));
const logs   = [];
const db     = crearPersistencia(tmpDir, msg => logs.push(msg));

console.log('\n[persistence.service] Tests:');

// cargar archivo que no existe devuelve {}
const rutaInexistente = path.join(tmpDir, 'no-existe.json');
assert(JSON.stringify(db.cargar(rutaInexistente)) === '{}', 'cargar archivo inexistente devuelve {}');

// guardar y cargar datos
const ruta  = path.join(tmpDir, 'test.json');
const datos = { clave: 'valor', numero: 42 };
db.guardar(ruta, datos);
const leido = db.cargar(ruta);
assert(leido.clave === 'valor' && leido.numero === 42, 'guardar/cargar roundtrip');

// cargarMemoria de un chatId que no existe devuelve null
assert(db.cargarMemoria('5491100000000@c.us') === null, 'cargarMemoria inexistente devuelve null');

// guardarMemoria y cargarMemoria roundtrip
const memoria = { nombre: 'Juan', historial: [{ role: 'user', content: 'Hola' }], silenciado: false };
db.guardarMemoria('5491100000000@c.us', memoria);
const mLeida = db.cargarMemoria('5491100000000@c.us');
assert(mLeida.nombre === 'Juan', 'guardarMemoria/cargarMemoria roundtrip — nombre');
assert(mLeida.historial.length === 1, 'guardarMemoria/cargarMemoria roundtrip — historial');

// Limpieza
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('\n✅ Todos los tests de persistence.service pasaron.\n');
