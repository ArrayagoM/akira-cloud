// tests/instkey.test.js
// Regresión del bug: dos cuentas de WhatsApp de un mismo negocio (plan Agencia,
// slot 0 y slot 1) se pisaban entre sí porque runners/proxies se indexaban
// solo por userId, ignorando el slot. Estos tests fijan el contrato de
// instKey/parseInstKey/sessionDirName que resuelve eso.
'use strict';

const { instKey, parseInstKey, sessionDirName, parseSessionDirName } = require('../lib/instkey');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[instkey] Tests:');

// ── instKey ───────────────────────────────────────────────────
assert(instKey('abc123', 0) === 'abc123:0', 'instKey(uid, 0) === "uid:0"');
assert(instKey('abc123', 1) === 'abc123:1', 'instKey(uid, 1) === "uid:1"');
assert(instKey('abc123', undefined) === 'abc123:0', 'instKey(uid, undefined) default a slot 0');
assert(instKey('abc123', '2') === 'abc123:2', 'instKey acepta slot como string numérico');

// El bug original: dos slots del MISMO uid deben producir claves DISTINTAS
// (antes del fix, ambas colapsaban a la clave "abc123" y la segunda pisaba
// a la primera en el Map de runners/proxies).
assert(instKey('abc123', 0) !== instKey('abc123', 1), 'slot 0 y slot 1 del mismo uid producen claves distintas');

// Dos usuarios DISTINTOS nunca deben colisionar entre sí tampoco.
assert(instKey('userA', 0) !== instKey('userB', 0), 'usuarios distintos nunca colisionan');

// ── parseInstKey (inversa de instKey) ──────────────────────────
assert(JSON.stringify(parseInstKey('abc123:0')) === JSON.stringify({ uid: 'abc123', slot: 0 }), 'parseInstKey("uid:0") roundtrip');
assert(JSON.stringify(parseInstKey('abc123:3')) === JSON.stringify({ uid: 'abc123', slot: 3 }), 'parseInstKey("uid:3") roundtrip');
assert(parseInstKey('sinformatoviejo').uid === 'sinformatoviejo', 'parseInstKey tolera claves sin ":" (compat hacia atrás)');
assert(parseInstKey('sinformatoviejo').slot === 0, 'parseInstKey sin ":" asume slot 0');

// Roundtrip completo para un rango de slots
for (let s = 0; s <= 4; s++) {
  const k = instKey('u1', s);
  const parsed = parseInstKey(k);
  assert(parsed.uid === 'u1' && parsed.slot === s, `roundtrip instKey/parseInstKey para slot ${s}`);
}

// ── sessionDirName ──────────────────────────────────────────────
// slot 0 NO lleva sufijo — así las sesiones ya guardadas antes de este fix
// (carpetas nombradas solo "uid") se siguen encontrando sin migración.
assert(sessionDirName('abc123', 0) === 'abc123', 'sessionDirName slot 0 sin sufijo (compat hacia atrás)');
assert(sessionDirName('abc123', 1) === 'abc123_slot1', 'sessionDirName slot 1 con sufijo _slot1');
assert(sessionDirName('abc123', 4) === 'abc123_slot4', 'sessionDirName slot 4 con sufijo _slot4');

// ── parseSessionDirName (usado por autoRestaurar) ────────────────
assert(JSON.stringify(parseSessionDirName('abc123')) === JSON.stringify({ uid: 'abc123', slot: 0 }), 'parseSessionDirName sin sufijo → slot 0');
assert(JSON.stringify(parseSessionDirName('abc123_slot2')) === JSON.stringify({ uid: 'abc123', slot: 2 }), 'parseSessionDirName con sufijo _slot2');

// Roundtrip sessionDirName ↔ parseSessionDirName
for (let s = 0; s <= 4; s++) {
  const dir = sessionDirName('u1', s);
  const parsed = parseSessionDirName(dir);
  assert(parsed.uid === 'u1' && parsed.slot === s, `roundtrip sessionDirName/parseSessionDirName para slot ${s}`);
}

console.log('\n✅ Todos los tests de instkey pasaron.\n');
