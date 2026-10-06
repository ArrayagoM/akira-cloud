// Corre cada *.test.js bajo el runtime de Electron (como Node, sin ventana):
// better-sqlite3 queda compilado para el ABI de Electron (lo hace
// electron-builder al empaquetar), así que los tests deben usar el mismo
// runtime que la app real y no el Node del sistema.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const electron = require('electron');

const archivos = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
let fallo = false;
for (const f of archivos) {
  const r = spawnSync(electron, [path.join(__dirname, f)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) { fallo = true; console.error(`❌ ${f} falló (exit ${r.status})`); }
}
process.exit(fallo ? 1 : 0);
