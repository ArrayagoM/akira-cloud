// services/license.service.js
// Lógica de licencia por dispositivo. Sigue el mismo criterio que
// quota.service.js: las decisiones puras (¿está vigente el plan?, ¿cuántos
// dispositivos permite?) están separadas del I/O a Mongo, para poder
// testearlas sin DB real.
'use strict';

const jwt = require('jsonwebtoken');

// Mismos límites de SLOTS_POR_PLAN que backend/routes/bot.routes.js —
// cuántas cuentas de WhatsApp puede tener ACTIVAS una instalación, según el
// plan. Duplicado a propósito (no import cross-proyecto entre backend/ y
// backend-desktop/, ver nota en el plan de migración) — si se cambia acá,
// cambiarlo también allá mientras convivan los dos backends.
const SLOTS_POR_PLAN = { trial: 1, basico: 1, pro: 1, agencia: 5, admin: 5 };

// Cuántas instalaciones (PCs) distintas puede tener activas un mismo
// usuario. Concepto nuevo — no existía antes del software de escritorio.
// Un plan con más cuentas de WhatsApp (agencia) también admite gestionarlas
// desde más de una PC; trial/básico/pro quedan atados a una sola máquina.
const DISPOSITIVOS_POR_PLAN = { trial: 1, basico: 1, pro: 1, agencia: 2, admin: 99 };

// Admin (rol o plan) y testers tienen todo habilitado sin pagar: se les aplica
// el plan 'admin' (todas las funciones, 5 cuentas, equipos sin tope practico).
function planEfectivo(user) {
  if (user.rol === 'admin' || user.plan === 'admin' || user.esTester) return 'admin';
  return user.plan;
}

function slotsMaxDePlan(plan) {
  return SLOTS_POR_PLAN[plan] || 1;
}

function dispositivosMaxDePlan(plan) {
  return DISPOSITIVOS_POR_PLAN[plan] || 1;
}

// Replica exacta de User.planVigente() (backend/models/User.js) pero como
// función pura sobre un objeto plano, para poder testearla sin Mongo y para
// poder calcular además el momento exacto de expiración (que el método de
// instancia no expone, solo el booleano).
function calcularVigencia(user, ahora = new Date()) {
  if (user.esTester) return { vigente: true, expira: null };
  if (user.rol === 'admin' || user.plan === 'admin') return { vigente: true, expira: null };
  if (user.plan === 'trial') {
    const exp = user.trialExpira ? new Date(user.trialExpira) : null;
    return { vigente: !!exp && exp > ahora, expira: exp };
  }
  const exp = user.planExpira ? new Date(user.planExpira) : null;
  return { vigente: !!exp && exp > ahora, expira: exp };
}

// Firma el JWT de licencia (corto plazo, claims de plan/features/slotsMax).
// Distinto del JWT de sesión de usuario (JWT_SECRET) — este es el que el
// Electron cachea localmente y revalida en cada heartbeat.
function generarLicenseToken({ userId, deviceId, plan, features, slotsMax }) {
  const secret = (process.env.LICENSE_JWT_SECRET || '').trim();
  if (!secret) throw new Error('LICENSE_JWT_SECRET no configurado');
  return jwt.sign(
    { sub: String(userId), deviceId, plan, features, slotsMax },
    secret,
    { expiresIn: (process.env.LICENSE_JWT_TTL || '24h').trim() },
  );
}

function verificarLicenseToken(token) {
  const secret = (process.env.LICENSE_JWT_SECRET || '').trim();
  if (!secret) throw new Error('LICENSE_JWT_SECRET no configurado');
  return jwt.verify(token, secret); // lanza si expiró o es inválido
}

module.exports = {
  planEfectivo,
  SLOTS_POR_PLAN,
  DISPOSITIVOS_POR_PLAN,
  slotsMaxDePlan,
  dispositivosMaxDePlan,
  calcularVigencia,
  generarLicenseToken,
  verificarLicenseToken,
};
