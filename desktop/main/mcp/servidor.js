// main/mcp/servidor.js
// Servidor HTTP del MCP. Es lo único de Akira que escucha para asistentes externos, y se cuida así:
//  · Solo escucha en 127.0.0.1 (esta misma PC). Nunca en la red ni en internet.
//  · Puerto propio (distinto al de la interfaz de Akira) y solo mientras el dueño lo tenga activado.
//  · Pide el encabezado Host correcto (frena el "DNS rebinding") y rechaza cualquier pedido que traiga Origin: los navegadores siempre
//    mandan Origin, así que ninguna página web puede usarlo; los asistentes de escritorio no lo mandan.
//  · Sin llave válida → 401, antes de leer el cuerpo. Con 10 llaves incorrectas en un minuto → se frena todo por un minuto.
//  · Máximo de pedidos por minuto por conexión, tamaño máximo del pedido, tiempos máximos y máximo de conexiones simultáneas.
//  · Sin CORS, sin redirecciones, sin detalles técnicos en los errores.
// Probado en tests/mcp.test.js.
'use strict';

const http = require('http');

const PUERTO_PREFERIDO = 47322;
const MAX_CUERPO = 64 * 1024;
const MAX_PEDIDOS_POR_MINUTO = 120;
const MAX_FALLOS = 10;
const VENTANA_MS = 60_000;

const cabeceras = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" };
function responder(res, estado, cuerpo, extra = {}) {
  const texto = cuerpo === undefined ? '' : JSON.stringify(cuerpo);
  res.writeHead(estado, { ...cabeceras, ...(texto ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(texto) } : { 'Content-Length': 0 }), ...extra });
  res.end(texto);
}

function crearServidor({ tokens, protocolo, log = () => {}, ahora = () => Date.now(), puertoPreferido = PUERTO_PREFERIDO, maxPedidos = MAX_PEDIDOS_POR_MINUTO }) {
  let server = null; let puerto = null;
  let fallos = []; let bloqueadoHasta = 0;
  const pedidosPorConexion = new Map(); // id de llave → marcas de tiempo

  const hostOk = (h) => h === `127.0.0.1:${puerto}` || h === `localhost:${puerto}`;
  const esLoopback = (a) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

  function limitar(id) {
    const t = ahora(); const marcas = (pedidosPorConexion.get(id) || []).filter((x) => t - x < VENTANA_MS);
    if (marcas.length >= maxPedidos) { pedidosPorConexion.set(id, marcas); return false; }
    marcas.push(t); pedidosPorConexion.set(id, marcas); return true;
  }
  function anotarFallo() {
    const t = ahora(); fallos = fallos.filter((x) => t - x < VENTANA_MS); fallos.push(t);
    if (fallos.length >= MAX_FALLOS) { bloqueadoHasta = t + VENTANA_MS; fallos = []; log('[mcp] demasiados intentos con llave incorrecta: se frena por 1 minuto'); }
  }

  function leerCuerpo(req) {
    return new Promise((resolve, reject) => {
      const partes = []; let total = 0; let cortado = false;
      req.on('data', (c) => { if (cortado) return; total += c.length; if (total > MAX_CUERPO) { cortado = true; partes.length = 0; reject(Object.assign(new Error('grande'), { estado: 413 })); } else partes.push(c); });
      req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function atender(req, res) {
    try {
      if (!esLoopback(req.socket.remoteAddress) || !hostOk(req.headers.host)) return responder(res, 403, { error: 'No permitido' });
      if (req.headers.origin !== undefined) return responder(res, 403, { error: 'No permitido' });   // un navegador: no entra
      const ruta = String(req.url || '').split('?')[0];
      if (ruta !== '/mcp') return responder(res, 404, { error: 'No encontrado' });
      if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' });

      if (ahora() < bloqueadoHasta) return responder(res, 429, { error: 'Demasiados intentos. Probá de nuevo en un minuto.' }, { 'Retry-After': '60' });
      const m = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
      const conexion = m ? tokens.verificar(m[1]) : null;
      if (!conexion) { anotarFallo(); return responder(res, 401, { error: 'Llave de acceso inválida' }, { 'WWW-Authenticate': 'Bearer realm="akira"' }); }
      if (!limitar(conexion.id)) return responder(res, 429, { error: 'Demasiados pedidos por minuto.' }, { 'Retry-After': '30' });
      if (!/^application\/json(\s*;|$)/i.test(req.headers['content-type'] || '')) return responder(res, 415, { error: 'Content-Type tiene que ser application/json' });

      let mensaje;
      try { mensaje = JSON.parse(await leerCuerpo(req)); } catch (e) {
        if (e.estado === 413) { res.once('finish', () => req.destroy()); return responder(res, 413, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Pedido demasiado grande' } }, { Connection: 'close' }); } // se corta la conexión: no se sigue recibiendo
        return responder(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
      }
      tokens.marcarUso(conexion.id);
      const r = await protocolo.procesar(mensaje, conexion);
      if (r === null) return responder(res, 202);
      return responder(res, 200, r);
    } catch (e) {
      log('[mcp] error:', e.message);
      if (!res.headersSent) responder(res, 500, { error: 'Error interno' });
    }
  }

  function iniciar() {
    if (server) return Promise.resolve(puerto);
    return new Promise((resolve, reject) => {
      const crear = (p) => {
        const s = http.createServer((req, res) => { atender(req, res); });
        s.maxConnections = 16; s.headersTimeout = 10_000; s.requestTimeout = 15_000; s.keepAliveTimeout = 5_000; s.maxHeadersCount = 40;
        s.once('error', (e) => { if (e.code === 'EADDRINUSE' && p !== 0) crear(0); else reject(e); });
        s.listen(p, '127.0.0.1', () => { server = s; puerto = s.address().port; resolve(puerto); });
      };
      crear(puertoPreferido);
    });
  }
  function detener() {
    return new Promise((resolve) => {
      if (!server) return resolve();
      const s = server; server = null; puerto = null;
      s.close(() => resolve());
      s.closeAllConnections?.();
    });
  }

  return { iniciar, detener, puerto: () => puerto, escuchando: () => !!server };
}

module.exports = { crearServidor, PUERTO_PREFERIDO, MAX_CUERPO, MAX_PEDIDOS_POR_MINUTO, MAX_FALLOS };
