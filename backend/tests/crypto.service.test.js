// tests/crypto.service.test.js
'use strict';

process.env.ENCRYPTION_KEY = 'clave-de-prueba-segura-32-chars!!';

const cryptoSvc = require('../services/crypto.service');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[crypto.service] Tests:');

// Encriptar y desencriptar texto simple
const original  = 'mi-api-key-secreta-123';
const cifrado   = cryptoSvc.encrypt(original);
const decifrado = cryptoSvc.decrypt(cifrado);
assert(decifrado === original, 'encrypt/decrypt roundtrip');

// Cada encriptación genera un IV distinto (no reutiliza)
const cifrado2 = cryptoSvc.encrypt(original);
assert(cifrado.iv !== cifrado2.iv, 'IVs distintos en cada llamada');

// Texto vacío devuelve null (no lanza)
assert(cryptoSvc.encrypt('') === null, 'encrypt("") devuelve null');

// Datos corruptos devuelven null (no lanza)
const resultado = cryptoSvc.decrypt({ iv: 'aaa', encrypted: 'bbb', authTag: 'ccc' });
assert(resultado === null, 'decrypt con datos corruptos devuelve null');

console.log('\n✅ Todos los tests de crypto.service pasaron.\n');
