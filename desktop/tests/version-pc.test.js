// tests/version-pc.test.js — ¿la Akira de la PC alcanza para recibir productos del celular? (frontend/src/lib/versionPc.js)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[version-pc] Tests:');
  const { versionAlcanza, VERSION_MIN_PRODUCTOS } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'versionPc.js')).href);
  assert(VERSION_MIN_PRODUCTOS === '1.0.34', 'la primera versión con carga de productos es la 1.0.34');
  assert(versionAlcanza('1.0.32', '1.0.34') === false, 'la 1.0.32 (Microsoft Store hoy) NO alcanza');
  assert(versionAlcanza('1.0.33', '1.0.34') === false, 'la 1.0.33 no alcanza');
  assert(versionAlcanza('1.0.34', '1.0.34') === true, 'la 1.0.34 alcanza (igual)');
  assert(versionAlcanza('1.0.35', '1.0.34') === true, 'la 1.0.35 alcanza');
  assert(versionAlcanza('1.1.0', '1.0.34') === true && versionAlcanza('2.0.0', '1.0.34') === true, 'versiones mayores alcanzan');
  assert(versionAlcanza('1.0.100', '1.0.34') === true, 'compara números, no texto (100 > 34)');
  assert(versionAlcanza('v1.0.34', '1.0.34') === true, 'acepta el prefijo "v"');
  assert(versionAlcanza('', '1.0.34') === true && versionAlcanza(undefined, '1.0.34') === true && versionAlcanza('rara', '1.0.34') === true, 'versión desconocida: no se bloquea');
  console.log('✅ version-pc: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
