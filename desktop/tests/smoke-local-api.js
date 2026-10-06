// Prueba de humo del servidor local (no es *.test.js: usa la red real para el
// proxy al servidor de licencias). Correr con:
//   set ELECTRON_RUN_AS_NODE=1 && node_modules\electron\dist\electron.exe tests\smoke-local-api.js
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-smoke-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

async function pedir(base, ruta, opts = {}) {
  const r = await fetch(base + ruta, { redirect: 'manual', ...opts, headers: { Host: new URL(base).host, ...(opts.headers || {}) } });
  const texto = await r.text();
  return { status: r.status, texto, loc: r.headers.get('location') };
}
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); };

(async () => {
  await require('../main/esm-compat').preparar();
  const botService = require('../main/slots/bot-service');
  const srv = await require('../main/local-api/server').iniciar({
    userDataDir: dir, serverUrl: 'https://akira-licencias.vercel.app',
    frontendDir: path.join(__dirname, '..', 'renderer-app'), nombreEquipo: 'smoke', botService,
  });
  const b = srv.url;
  console.log('\n[local-api] Smoke en', b);

  let r = await pedir(b, '/api/health');
  ok(r.status === 200 && JSON.parse(r.texto).modo === 'escritorio', '/api/health responde modo escritorio');

  r = await pedir(b, '/');
  ok(r.status === 200 && r.texto.includes('<div id="root">'), 'sirve el frontend de React en /');
  r = await pedir(b, '/dashboard');
  ok(r.status === 200 && r.texto.includes('<div id="root">'), 'fallback SPA: /dashboard devuelve index.html');

  r = await pedir(b, '/api/config');
  ok(r.status === 401, '/api/config sin token → 401');
  r = await pedir(b, '/api/bot/status', { headers: { Authorization: 'Bearer basura' } });
  ok(r.status === 401, '/api/bot/status con token inválido → 401 (validado contra la nube)');

  r = await pedir(b, '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'no@existe.com', password: 'Xx123456' }) });
  ok(r.status === 401 && /Credenciales/.test(r.texto), '/api/auth/login se reenvía a la nube y devuelve su 401');

  r = await pedir(b, '/api/auth/google');
  ok(r.status === 302 && r.loc.includes('akira-licencias.vercel.app/api/auth/google?desktop_port='), '/api/auth/google redirige al servidor con el puerto local');

  r = await pedir(b, '/api/admin/users');
  ok(r.status === 404, 'rutas de admin no existen en escritorio');

  r = await pedir(b, '/api/health', { headers: { Host: 'evil.com' } });
  ok(r.status === 403 || r.status === 0 || true, 'guarda de Host (verificada abajo con http crudo)');

  // Host y Origin falsos con http crudo (fetch no deja pisar Host)
  const http = require('http');
  const crudo = (headers) => new Promise((res) => {
    http.get({ host: '127.0.0.1', port: srv.puerto, path: '/api/health', headers }, (x) => { x.resume(); res(x.statusCode); });
  });
  ok((await crudo({ Host: 'evil.com' })) === 403, 'Host ajeno (DNS rebinding) → 403');
  ok((await crudo({ Origin: 'https://evil.com' })) === 403, 'Origin ajeno (otra web llamando a localhost) → 403');
  ok((await crudo({ Origin: b })) === 200, 'el propio origen de la app sí pasa');

  srv.cerrar();
  console.log('\n✅ Smoke del servidor local OK\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
