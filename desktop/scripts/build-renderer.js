// scripts/build-renderer.js — compila la interfaz de escritorio (frontend/ → renderer-app/)
// con las variables correctas y comprueba el resultado. Se corre con:  npm run build:ui
// Por qué existe: en Git Bash para Windows, "VITE_API_URL=/api vite build" convierte
// /api en "C:/Program Files/Git/api" y deja toda la app apuntando a una URL inexistente.
// Acá las variables se pasan por código (sin shell de por medio) y el build se verifica.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', '..', 'frontend');
const salida = path.join(__dirname, '..', 'renderer-app');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const r = spawnSync(npx, ['vite', 'build', '--outDir', salida, '--emptyOutDir'], {
  cwd: frontend,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_DESKTOP: '1', VITE_API_URL: '/api', VITE_SOCKET_URL: '/', MSYS_NO_PATHCONV: '1' },
});
if (r.status !== 0) { console.error('❌ Falló la compilación de la interfaz'); process.exit(1); }

const assets = path.join(salida, 'assets');
const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js'));
const malos = js.filter((f) => /Program Files|[A-Z]:\/(?:Users|Program)/.test(fs.readFileSync(path.join(assets, f), 'utf8')));
const sinApi = !js.some((f) => fs.readFileSync(path.join(assets, f), 'utf8').includes('"/api"'));
if (malos.length) { console.error('❌ La interfaz quedó con rutas de Windows incrustadas en:', malos.join(', ')); process.exit(1); }
if (sinApi) { console.error('❌ No se encontró la base de API "/api" en la interfaz compilada'); process.exit(1); }
console.log('✅ Interfaz de escritorio compilada y verificada (API = /api)');
