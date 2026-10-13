// lib/sesion.js
// Duración y renovación de la sesión de la app de escritorio.
//
// El bot corre las 24 horas, así que la sesión NO puede vencer a los 7 días y obligar a volver a ingresar: pasadas 72 horas sin validar la
// licencia el bot se pausa. Por eso la app de escritorio (que avisa con el encabezado x-akira-cliente: escritorio):
//  · recibe sesiones de 30 días, y
//  · las renueva sola (POST /api/auth/renovar) mientras la sesión siga vigente, así que mientras la use nunca vence.
// Para que una credencial robada no se pueda renovar para siempre, cada sesión recuerda cuándo se ingresó de verdad (claim "oa") y no se
// renueva pasados 180 días: ahí hay que volver a ingresar con contraseña. Cambiar la contraseña o "cerrar sesión en todos" invalida todo
// (tokenVersion), como antes. Funciones puras: probadas en tests/sesion-renovar.test.js.
'use strict';

const jwt = require('jsonwebtoken');

const DIA_S = 24 * 60 * 60;
const MAX_ANTIGUEDAD_DIAS = 180;

// → undefined (el servidor usa su duración normal, 7 días) o la duración de la app de escritorio
function expiracionSegunCliente(req) {
  const cliente = String(req?.headers?.['x-akira-cliente'] || '').toLowerCase();
  return cliente === 'escritorio' ? (process.env.DESKTOP_JWT_EXPIRES_IN || '30d') : undefined;
}

// Decodifica sin verificar (solo se usa DESPUÉS de que requireAuth ya verificó el token)
function payloadDe(token) {
  try { return jwt.decode(String(token || '')) || null; } catch { return null; }
}

// ¿Se puede renovar esta sesión? → { ok, oa } | { ok:false, motivo }
function evaluarRenovacion(payload, ahoraS = Math.floor(Date.now() / 1000)) {
  if (!payload || !payload.id) return { ok: false, motivo: 'token_invalido' };
  const oa = Number(payload.oa) || Number(payload.iat) || 0; // "oa" = cuándo se ingresó con contraseña; los tokens viejos no lo traen: cuenta su emisión
  if (!oa) return { ok: false, motivo: 'token_invalido' };
  if (ahoraS - oa > MAX_ANTIGUEDAD_DIAS * DIA_S) return { ok: false, motivo: 'sesion_muy_antigua' };
  return { ok: true, oa };
}

module.exports = { expiracionSegunCliente, payloadDe, evaluarRenovacion, MAX_ANTIGUEDAD_DIAS };
