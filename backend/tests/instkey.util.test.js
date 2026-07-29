// tests/instkey.util.test.js — espejo backend de worker/tests/instkey.test.js.
// Ambas implementaciones (worker/lib/instkey.js y este archivo) deben producir
// el MISMO formato de clave porque viaja por el wire (worker:ready → botIds,
// worker:start-bot → {userId, slot}, etc.) entre dos procesos Node distintos.
'use strict';

const { instKey, parseInstKey } = require('../services/instkey.util');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[instkey.util] Tests:');

assert(instKey('abc123', 0) === 'abc123:0', 'instKey(uid, 0) === "uid:0"');
assert(instKey('abc123', 1) === 'abc123:1', 'instKey(uid, 1) === "uid:1"');
assert(instKey('abc123', 0) !== instKey('abc123', 1), 'slot 0 y slot 1 del mismo uid producen claves distintas');
assert(instKey('userA', 0) !== instKey('userB', 0), 'usuarios distintos nunca colisionan');

assert(JSON.stringify(parseInstKey('abc123:0')) === JSON.stringify({ uid: 'abc123', slot: 0 }), 'parseInstKey("uid:0") roundtrip');
assert(JSON.stringify(parseInstKey('abc123:3')) === JSON.stringify({ uid: 'abc123', slot: 3 }), 'parseInstKey("uid:3") roundtrip');
assert(parseInstKey('sinslot').slot === 0, 'parseInstKey sin ":" asume slot 0 (compat hacia atrás)');

for (let s = 0; s <= 4; s++) {
  const k = instKey('u1', s);
  const parsed = parseInstKey(k);
  assert(parsed.uid === 'u1' && parsed.slot === s, `roundtrip instKey/parseInstKey para slot ${s}`);
}

console.log('\n✅ Todos los tests de instkey.util pasaron.\n');
