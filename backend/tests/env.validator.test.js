// tests/env.validator.test.js
'use strict';

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[env.validator] Tests:');

// Guardamos process.exit original
const exitOriginal = process.exit;
let exitCode       = null;
process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

// ── Test 1: vars completas y válidas → no llama process.exit ──
exitCode = null;
process.env.MONGO_URI       = 'mongodb://localhost/test';
process.env.JWT_SECRET      = 'una-clave-jwt-de-al-menos-32-caracteres-ok';
process.env.ENCRYPTION_KEY  = 'clave-16-chars!!';

// Invalidar caché para releer el módulo
delete require.cache[require.resolve('../config/env.validator')];
try {
  require('../config/env.validator')();
  assert(exitCode === null, 'No llama process.exit cuando las vars están completas');
} catch (e) {
  if (String(e.message).startsWith('process.exit')) {
    assert(false, 'No llama process.exit cuando las vars están completas');
  } else { throw e; }
}

// ── Test 2: ENCRYPTION_KEY corta → process.exit(1) ────────────
exitCode = null;
process.env.ENCRYPTION_KEY = 'corta';
delete require.cache[require.resolve('../config/env.validator')];
try { require('../config/env.validator')(); } catch {}
assert(exitCode === 1, 'Llama process.exit(1) cuando ENCRYPTION_KEY es muy corta');

// ── Test 3: MONGO_URI faltante → process.exit(1) ──────────────
exitCode = null;
delete process.env.MONGO_URI;
process.env.ENCRYPTION_KEY = 'clave-16-chars!!';
delete require.cache[require.resolve('../config/env.validator')];
try { require('../config/env.validator')(); } catch {}
assert(exitCode === 1, 'Llama process.exit(1) cuando MONGO_URI falta');

// Restaurar
process.exit = exitOriginal;
console.log('\n✅ Todos los tests de env.validator pasaron.\n');
