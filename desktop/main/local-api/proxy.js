// local-api/proxy.js
// Reenvía al servidor de licencias (Vercel) lo que sigue viviendo en la
// nube: login/registro/OAuth (/api/auth/*) y suscripciones (/api/subscriptions/*).
// El frontend habla con un solo origen (esta API local) y no se entera de
// que parte de las rutas son remotas.
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

function reenviar(serverUrl) {
  return (req, res) => {
    let destino;
    try { destino = new URL(req.originalUrl, serverUrl); } catch { return res.status(500).json({ error: 'URL del servidor inválida' }); }
    const mod = destino.protocol === 'https:' ? https : http;

    const hayCuerpo = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
    const cuerpo = hayCuerpo ? JSON.stringify(req.body) : null;

    const headers = { Accept: 'application/json' };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (cuerpo) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(cuerpo);
    }

    const pr = mod.request(
      { hostname: destino.hostname, port: destino.port || (destino.protocol === 'https:' ? 443 : 80), path: destino.pathname + destino.search, method: req.method, headers, timeout: 20_000 },
      (r) => {
        res.status(r.statusCode || 502);
        if (r.headers['content-type']) res.set('Content-Type', r.headers['content-type']);
        if (r.headers.location) res.set('Location', r.headers.location);
        r.pipe(res);
      },
    );
    pr.on('timeout', () => pr.destroy(new Error('timeout')));
    pr.on('error', () => { if (!res.headersSent) res.status(503).json({ error: 'No hay conexión con el servidor de Akira' }); });
    if (cuerpo) pr.write(cuerpo);
    pr.end();
  };
}

module.exports = { reenviar };
