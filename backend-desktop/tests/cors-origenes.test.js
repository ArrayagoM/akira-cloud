// tests/cors-origenes.test.js — qué direcciones web pueden usar el servidor (CORS). Se carga app.js de verdad (sin base de datos).
// Antes, entrar desde https://akira-cloud.vercel.app (la dirección anterior de la web) daba "Error interno del servidor" (500).
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
process.env.ENCRYPTION_KEY = 'clave-de-prueba-solo-para-test-1234567890';
process.env.NODE_ENV = 'production';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
const { assert, inyectar } = require('./_ayuda');
inyectar('lib/mongo.js', async () => {});

(async () => {
  console.log('\n[cors-origenes] Tests:');
  const app = require('../app');
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const pedir = async (ruta, { origen, metodo = 'GET', headers = {} } = {}) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { 'x-vercel-forwarded-for': '1.2.3.4', ...(origen ? { Origin: origen } : {}), ...headers } });
    return { status: r.status, acao: r.headers.get('access-control-allow-origin'), cred: r.headers.get('access-control-allow-credentials') };
  };

  for (const o of ['https://akiracloud.lat', 'https://www.akiracloud.lat', 'https://akira-cloud.vercel.app']) {
    const r = await pedir('/api/health', { origen: o });
    assert(r.status === 200 && r.acao === o && r.cred === 'true', `${o} puede usar el servidor`);
  }
  let r = await pedir('/api/auth/login', { origen: 'https://akira-cloud.vercel.app', metodo: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert(r.status < 400 && r.acao === 'https://akira-cloud.vercel.app', 'la consulta previa (OPTIONS) del ingreso desde la dirección anterior también pasa');

  r = await pedir('/api/health');
  assert(r.status === 200, 'sin Origin (app de escritorio, celular nativo, curl) sigue entrando');

  for (const o of ['https://evil.example', 'https://akira-cloud.vercel.app.evil.com', 'http://akira-cloud.vercel.app', 'https://otro-akira-cloud.vercel.app', 'https://akira-cloud-git-main-x.vercel.app', 'null']) {
    r = await pedir('/api/health', { origen: o });
    assert(r.acao === null && r.status !== 200, `${o} sigue bloqueado (coincidencia exacta)`);
  }
  server.close();
  console.log('✅ cors-origenes: OK');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
