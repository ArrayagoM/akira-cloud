// local-api/session.js
// La API local solo atiende a quien presente un JWT que el servidor de
// licencias haya validado, y además activa la licencia de ESTE equipo.
// Es la misma pareja que en la plataforma hace `requireAuth` (JWT válido +
// cuenta no bloqueada), más el chequeo de licencia por dispositivo.
//
// Sin internet: si el token ya se validó antes y la ventana de gracia
// offline sigue abierta, se sigue operando (ver license/offline-grace.js).
'use strict';

const licenseClient = require('../license/license-client');
const offlineGrace = require('../license/offline-grace');
const { obtenerDeviceId } = require('../device');
const sessionStore = require('../license/session-store');

const REVALIDAR_MS = 10 * 60 * 1000;

function crearSesion({ userDataDir, nombreEquipo, alActivar }) {
  const actual = { token: null, user: null, validadoEn: 0, activada: false, errorActivacion: null };

  function payloadDe(token) {
    try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
  }

  async function validar(token, { reemplazar = false } = {}) {
    if (!reemplazar && actual.token === token && actual.activada && Date.now() - actual.validadoEn < REVALIDAR_MS) return actual;

    licenseClient.configurar({ sessionToken: token });
    try {
      const { user } = await licenseClient.request('/api/auth/me', 'GET');
      const estado = await licenseClient.activar({ deviceId: obtenerDeviceId(userDataDir), nombre: nombreEquipo, reemplazar });
      offlineGrace.guardar(userDataDir, estado);
      sessionStore.guardar(userDataDir, { token, userId: user._id || user.id, email: user.email });
      const primeraVez = !actual.activada || actual.token !== token;
      Object.assign(actual, { token, user: { ...user, _id: user._id || user.id }, validadoEn: Date.now(), activada: true, errorActivacion: null });
      if (primeraVez) alActivar?.(actual);
      return actual;
    } catch (err) {
      if (err.status === 401) throw Object.assign(new Error('Sesión inválida o expirada'), { status: 401 });
      if (err.status === 409 && err.body?.codigo === 'LIMITE_DISPOSITIVOS') {
        // Ya hay otro equipo activo: la interfaz le ofrece al usuario usar este en su lugar.
        actual.errorActivacion = { codigo: 'LIMITE_DISPOSITIVOS', mensaje: err.message, dispositivos: err.body.dispositivos || [] };
        throw Object.assign(new Error(err.message), { status: 409, body: err.body });
      }
      if (err.status === 403 || err.status === 409) {
        actual.errorActivacion = { codigo: 'LICENCIA', mensaje: err.message, dispositivos: [] };
        throw Object.assign(new Error(err.message), { status: 403, body: err.body });
      }

      // Sin conexión con el servidor de licencias → modo gracia offline
      const p = payloadDe(token);
      const gracia = offlineGrace.evaluar(userDataDir);
      const vigente = p?.exp ? p.exp * 1000 > Date.now() : false;
      if (gracia.puedeOperar && vigente && actual.user && String(actual.user._id) === String(p.id)) {
        actual.token = token;
        return actual;
      }
      throw Object.assign(new Error('No hay conexión con el servidor de licencias'), { status: 503 });
    }
  }

  // Middleware de Express: deja req.user (mismo shape que passport en la
  // plataforma: _id, plan, rol, email…) o corta con 401/403/503.
  function requerirSesion(req, res, next) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'No auth token' });
    validar(m[1])
      .then((s) => { req.user = { ...s.user }; next(); })
      .catch((err) => res.status(err.status || 500).json({ error: err.message }));
  }

  return { requerirSesion, validar, estado: () => actual };
}

module.exports = { crearSesion };
