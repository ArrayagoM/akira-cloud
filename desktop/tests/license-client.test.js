// tests/license-client.test.js — el cliente de licencias manda, además de x-akira-cliente, la versión de la app y el canal
// (x-akira-version / x-akira-canal) como headers OPCIONALES: un backend viejo que no los lee no se entera, y uno nuevo los usa para diagnosticar.
'use strict';
const http = require('http');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[license-client] Tests:');
  const licenseClient = require('../main/license/license-client');
  const version = require('../package.json').version;

  const recibidos = [];
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', () => { recibidos.push({ headers: req.headers, url: req.url, body: raw ? JSON.parse(raw) : {} }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ plan: 'pro', features: {}, slotsMax: 1, vigente: true, expira: null })); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  licenseClient.configurar({ serverUrl: `http://127.0.0.1:${server.address().port}`, sessionToken: 'tok-test', deviceId: 'dev-1' });

  try {
    delete process.windowsStore;
    await licenseClient.heartbeat({});
    let h = recibidos[recibidos.length - 1].headers;
    assert(h['x-akira-cliente'] === 'escritorio', 'sigue mandando x-akira-cliente: escritorio');
    assert(h['x-akira-version'] === version && /^\d+\.\d+\.\d+/.test(h['x-akira-version']), 'manda x-akira-version con la versión de la app (package.json)');
    assert(h['x-akira-canal'] === 'exe', 'instalador normal: x-akira-canal = exe');
    assert(h.authorization === 'Bearer tok-test', 'el Authorization no cambia');

    process.windowsStore = true;
    await licenseClient.heartbeat({});
    h = recibidos[recibidos.length - 1].headers;
    assert(h['x-akira-canal'] === 'store', 'empaquetada en Microsoft Store (process.windowsStore): x-akira-canal = store');
    assert(recibidos[recibidos.length - 1].body.deviceId === 'dev-1', 'el cuerpo del heartbeat no cambia');
    assert(licenseClient.cabecerasCliente()['x-akira-canal'] === 'store', 'cabecerasCliente() expone los mismos valores');
  } finally {
    delete process.windowsStore;
    server.close();
  }
  console.log('\n✅ Todos los tests de license-client pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
