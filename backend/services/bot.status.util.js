// services/bot.status.util.js
// Helper compartido para actualizar el estado de un bot (activo/conectado) en Mongo,
// consciente de slots (plan Agencia — varias cuentas de WhatsApp por usuario).
//
// Extraído de bot.manager.js para que worker.handler.js también pueda usarlo sin
// crear un require circular (worker.handler.js ya es dependencia de bot.manager.js).
'use strict';

const User = require('../models/User');

// slot 0 usa los campos top-level (botActivo/botConectado) por compatibilidad
// hacia atrás con cuentas que no usan el plan Agencia. slot > 0 solo existe
// dentro del array cuentasWA.
async function updateBotStatus(uid, slot, activo, conectado) {
  const topLevel = slot === 0 ? { botActivo: activo, botConectado: conectado } : {};
  // Actualizar elemento del array si existe
  await User.findOneAndUpdate(
    { _id: uid, 'cuentasWA.slot': slot },
    { $set: { ...topLevel, 'cuentasWA.$.activo': activo, 'cuentasWA.$.conectado': conectado } }
  ).catch(() => {});
  // Si no existe en cuentasWA, al menos actualizar campos top-level (slot 0)
  if (slot === 0) {
    await User.findByIdAndUpdate(uid, topLevel).catch(() => {});
  }
}

module.exports = { updateBotStatus };
