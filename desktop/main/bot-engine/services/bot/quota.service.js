// services/bot/quota.service.js — versión local (Electron)
// Misma firma que el original (backend/services/bot/quota.service.js):
// registrarMensajeYVerificarCupo(userId, plan) → { permitido, usados, limite }
// — así akira.bot.js NO se modifica. La diferencia es de dónde sale la
// verdad: acá el cupo NO se guarda en una tabla local (el usuario podría
// editar su propio SQLite y resetear el contador) — se llama al servidor
// de licencias en Vercel en cada mensaje real, igual que antes se llamaba
// a Mongo en cada mensaje real. Ver license/license-client.js.
'use strict';

const licenseClient = require('../../../license/license-client');

async function registrarMensajeYVerificarCupo(_userId, _plan) {
  // userId/plan ya están implícitos en la sesión autenticada del
  // license-client (vienen del JWT de sesión, no de estos parámetros) —
  // se mantienen en la firma solo por compatibilidad con el call site de
  // akira.bot.js, que no se toca.
  const r = await licenseClient.quotaCheck();
  return { permitido: r.permitido, usados: r.usados ?? null, limite: r.limite ?? null };
}

module.exports = { registrarMensajeYVerificarCupo };
