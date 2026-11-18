// tests/ideas-escritorio.test.js — la app de escritorio reenvía /api/suggestions a la nube y muestra "Ideas" en el menú
// (desktop/main/local-api/server.js, proxy.js y frontend/src/components/Layout.jsx)
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { reenviar } = require('../main/local-api/proxy');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
const escuchar = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
function pedir(puerto, metodo, ruta, { cuerpo, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = cuerpo ? JSON.stringify(cuerpo) : null;
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: metodo, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

(async () => {
  console.log('\n[ideas-escritorio] Tests:');

  // ── "la nube": registra lo que le llega ──
  const recibidos = [];
  const nube = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => { recibidos.push({ metodo: req.method, ruta: req.url, auth: req.headers.authorization || null, cliente: req.headers['x-akira-cliente'] || null, cuerpo: b ? JSON.parse(b) : null }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, eco: req.url })); });
  });
  const pNube = await escuchar(nube);

  // ── la app local montada igual que en server.js ──
  const app = express(); app.use(express.json());
  app.use('/api/suggestions', reenviar(`http://127.0.0.1:${pNube}`));
  const local = http.createServer(app); const pLocal = await escuchar(local);

  let r = await pedir(pLocal, 'POST', '/api/suggestions', { cuerpo: { texto: 'Que se pueda imprimir la agenda' }, headers: { Authorization: 'Bearer TOKEN-DE-PRUEBA' } });
  assert(r.status === 200 && recibidos[0].metodo === 'POST' && recibidos[0].ruta === '/api/suggestions', 'dejar una idea (POST) llega a la nube en la misma ruta');
  assert(recibidos[0].cuerpo && recibidos[0].cuerpo.texto === 'Que se pueda imprimir la agenda', 'con el texto de la idea');
  assert(recibidos[0].auth === 'Bearer TOKEN-DE-PRUEBA', 'con la sesión del usuario (la nube decide quién es)');
  assert(recibidos[0].cliente === 'escritorio', 'y avisando que viene de la app de escritorio');

  r = await pedir(pLocal, 'GET', '/api/suggestions/mias', { headers: { Authorization: 'Bearer TOKEN-DE-PRUEBA' } });
  assert(r.status === 200 && recibidos[1].metodo === 'GET' && recibidos[1].ruta === '/api/suggestions/mias', 'ver las ideas propias (GET /mias) llega a la nube');

  r = await pedir(pLocal, 'PATCH', '/api/suggestions/abc123', { cuerpo: { estado: 'implementada' }, headers: { Authorization: 'Bearer TOKEN-DE-PRUEBA' } });
  assert(recibidos[2].metodo === 'PATCH' && recibidos[2].ruta === '/api/suggestions/abc123', 'responder una idea (PATCH, solo admin) también se reenvía: la nube es la que exige el rol admin');

  await pedir(pLocal, 'POST', '/api/suggestions', { cuerpo: { texto: 'sin sesión' } });
  assert(recibidos[3].auth === null, 'sin sesión no se inventa ninguna: la nube responde 401 sola');

  nube.close(); local.close();

  // ── el montaje real en server.js y el menú de escritorio (comprobación de código) ──
  const server = leer('desktop', 'main', 'local-api', 'server.js');
  assert(/app\.use\('\/api\/suggestions',\s*aNube\)/.test(server), 'server.js monta /api/suggestions con el mismo reenvío a la nube que /api/auth, /api/subscriptions y /api/admin');
  const layout = leer('frontend', 'src', 'components', 'Layout.jsx');
  assert(/\?\s*i\.to !== '\/descargar'/.test(layout) && !/'\/sugerencias'\s*\|\|\s*i\.to === '\/descargar'/.test(layout), 'el menú de escritorio ya no esconde "Ideas" (solo oculta la página de descarga)');
  assert(/to: '\/sugerencias'.*label: 'Ideas'/.test(layout), 'la entrada "Ideas" existe en el menú');

  console.log('✅ ideas-escritorio: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
