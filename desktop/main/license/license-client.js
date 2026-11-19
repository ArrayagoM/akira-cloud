// license/license-client.js
// Cliente HTTP hacia backend-desktop (Vercel) — activación/heartbeat de
// licencia y el gate de cupo de mensajes. Es un singleton de módulo:
// `configurar()` se llama una vez al arrancar la app (tras el login), y el
// resto del bot-engine (quota.service.js) lo requiere directo sin tener
// que pasarlo por parámetro en cada función — mismo patrón que el código
// original usaba con `require('../../models/User')` a nivel de módulo.
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

const estado = {
  serverUrl: process.env.AKIRA_LICENSE_SERVER_URL || 'https://akira-licencias.vercel.app',
  sessionToken: null, // JWT de sesión de usuario (login) — mismo que usa el frontend
  deviceId: null,
  licenseToken: null, // JWT de licencia cacheado (plan/features/slotsMax/exp)
  licenseTokenExp: 0, // epoch ms — cuándo vence el JWT de licencia cacheado
  ultimoEstado: null, // { plan, features, slotsMax, vigente, expira }
};

// Versión de la app y canal de instalación (store = Microsoft Store, exe = instalador). Viajan como headers OPCIONALES: el backend
// los puede ignorar (uno viejo no los lee) y sirven para saber qué versión/canal está teniendo cada problema.
let versionApp;
function versionDeApp() {
  if (versionApp === undefined) {
    try { versionApp = String(require('../../package.json').version || '').slice(0, 32); } catch { versionApp = ''; }
  }
  return versionApp;
}
const canalDeApp = () => (process.windowsStore ? 'store' : 'exe');
function cabecerasCliente() {
  const v = versionDeApp();
  return { 'x-akira-cliente': 'escritorio', ...(v ? { 'x-akira-version': v } : {}), 'x-akira-canal': canalDeApp() };
}

function configurar({ serverUrl, sessionToken, deviceId }) {
  if (serverUrl) estado.serverUrl = serverUrl;
  if (sessionToken) estado.sessionToken = sessionToken;
  if (deviceId) estado.deviceId = deviceId;
}

function request(pathname, method, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(pathname, estado.serverUrl);
    } catch (e) {
      return reject(new Error(`AKIRA_LICENSE_SERVER_URL inválida: ${estado.serverUrl}`));
    }
    const mod = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;

    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...cabecerasCliente(),
          ...(estado.sessionToken ? { Authorization: `Bearer ${estado.sessionToken}` } : {}),
          ...(extraHeaders || {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: 10_000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed;
          try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { error: 'Respuesta inválida del servidor' }; }
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error || `Error del servidor de licencias (${res.statusCode})`);
            err.status = res.statusCode;
            err.body = parsed;
            return reject(err);
          }
          resolve(parsed);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timeout contactando el servidor de licencias')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function guardarEstadoLicencia(resp) {
  estado.licenseToken = resp.licenseToken || estado.licenseToken;
  estado.ultimoEstado = { plan: resp.plan, features: resp.features, slotsMax: resp.slotsMax, vigente: resp.vigente, expira: resp.expira };
  // El JWT de licencia dura process.env.LICENSE_JWT_TTL en el server (24h por
  // default) — cacheamos una expiración local conservadora (algo menor,
  // para renovar con margen) sin tener que decodificar el JWT acá.
  estado.licenseTokenExp = Date.now() + 20 * 60 * 60 * 1000; // 20h de margen sobre un TTL de 24h
  return estado.ultimoEstado;
}

async function activar({ deviceId, fingerprint, nombre, reemplazar = false }) {
  configurar({ deviceId });
  const resp = await request('/api/licenses/activate', 'POST', { deviceId, fingerprint, nombre, reemplazar });
  return guardarEstadoLicencia(resp);
}

async function heartbeat(extra = {}) {
  if (!estado.deviceId) throw new Error('license-client: falta deviceId — llamar activar() primero');
  const resp = await request('/api/licenses/heartbeat', 'POST', { ...extra, deviceId: estado.deviceId });
  return guardarEstadoLicencia(resp);
}

// Resumen y estado del bot "en vivo" (sin esperar al latido de 15 min): ver resumen-vivo.js. Responde { mirando }.
async function resumenVivo({ resumen, estadoBot }) {
  if (!estado.deviceId) throw new Error('license-client: falta deviceId');
  return request('/api/licenses/resumen', 'POST', { deviceId: estado.deviceId, resumen, estadoBot });
}

// Datos del negocio para ver desde el celular (OPCIONAL, ver datos-celular.js). Responde { mirando }.
async function datosNegocio({ datos }) {
  if (!estado.deviceId) throw new Error('license-client: falta deviceId');
  return request('/api/licenses/datos', 'PUT', { deviceId: estado.deviceId, datos });
}
// Borra del servidor todo lo subido (sin argumento) o solo los tipos indicados.
async function borrarDatosNegocio(quitar) {
  if (!estado.deviceId) throw new Error('license-client: falta deviceId');
  return request('/api/licenses/datos', 'PUT', Array.isArray(quitar) ? { deviceId: estado.deviceId, quitar } : { deviceId: estado.deviceId, borrar: true });
}

// Cambia la sesión (todavía vigente) por una nueva: ver license/renovacion.js
async function renovarSesion() {
  return request('/api/auth/renovar', 'POST', {});
}

async function features() {
  const resp = await request('/api/bot/features', 'GET');
  return resp;
}

// Llamado por quota.service.js en CADA mensaje entrante real — ver la nota
// de por qué esto no puede ser un valor cacheado en bot-gate.routes.js del
// lado del servidor.
async function quotaCheck() {
  try {
    return await request('/api/bot/quota/check', 'POST', {});
  } catch (err) {
    // Sin conexión / servidor caído: degradar a "permitido" en vez de
    // trabar el bot por un problema de red — el servidor es la fuente de
    // verdad cuando vuelve la conexión, pero no vale la pena que un corte
    // de internet le impida al negocio seguir atendiendo clientes por
    // WhatsApp durante ese lapso (ver offline-grace.js para el límite real
    // de cuánto tiempo se tolera esto sin licencia vigente).
    return { permitido: true, usados: null, limite: null, degradado: true, error: err.message };
  }
}

function restaurarEstado(e) {
  estado.ultimoEstado = { plan: e.plan, features: e.features, slotsMax: e.slotsMax, vigente: e.vigente, expira: e.expira };
}

function getEstado() {
  return estado.ultimoEstado;
}

function licenciaCacheVigente() {
  return !!estado.licenseToken && Date.now() < estado.licenseTokenExp;
}

module.exports = { configurar, request, cabecerasCliente, activar, heartbeat, resumenVivo, datosNegocio, borrarDatosNegocio, renovarSesion, features, quotaCheck, getEstado, restaurarEstado, licenciaCacheVigente };
