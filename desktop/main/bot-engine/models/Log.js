// models/Log.js — shim local de backend/models/Log.js
// Misma API que usan las rutas y el bot manager: Log.registrar({...}) (nunca
// tira), Log.find().sort().limit().lean(), Log.countDocuments({...}).
// Se podan los más viejos para que la base local no crezca sin límite.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

const coleccion = crearColeccion('logs');
const MAX_LOGS = 3000;
let desdePoda = 0;

async function registrar({ userId, tipo, nivel = 'info', mensaje, detalle, ip, userAgent }) {
  try {
    await coleccion.create({ userId: userId && String(userId), tipo, nivel, mensaje: String(mensaje || '').slice(0, 1000), detalle, ip, userAgent });
    if (++desdePoda >= 200) {
      desdePoda = 0;
      const todos = await coleccion.find({}).sort({ createdAt: -1 }).lean();
      for (const viejo of todos.slice(MAX_LOGS)) await coleccion.deleteOne({ _id: viejo._id });
    }
  } catch (err) {
    console.error('[Log] Error al registrar:', err.message); // un fallo de log nunca rompe el flujo
  }
}

module.exports = { ...coleccion, registrar };
