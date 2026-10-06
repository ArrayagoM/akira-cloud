// config/planes.js
// Fuente única de verdad de qué incluye cada plan — antes existía en la
// LANDING (tabla de precios) pero el código nunca lo hacía cumplir: un Trial
// podía usar Google Calendar, MercadoPago, audio y mandar mensajes
// ilimitados exactamente igual que un plan Agencia. Este módulo es lo que
// bot.manager.js y el chequeo de cupo de mensajes usan para que la tabla de
// precios sea cierta.
//
// NOTA: el límite de cuentas de WhatsApp (SLOTS_POR_PLAN) sigue viviendo en
// bot.routes.js — ya funcionaba correctamente, no se tocó para no arriesgar
// una regresión ahí.
'use strict';

const PLANES = {
  trial:   { mensajesMes: 100,      calendar: false, mercadopago: false, audio: false },
  basico:  { mensajesMes: 500,      calendar: false, mercadopago: false, audio: false },
  pro:     { mensajesMes: Infinity, calendar: true,  mercadopago: true,  audio: true  },
  agencia: { mensajesMes: Infinity, calendar: true,  mercadopago: true,  audio: true  },
  admin:   { mensajesMes: Infinity, calendar: true,  mercadopago: true,  audio: true  },
};

// Cualquier plan no reconocido se trata como "trial" (el más restrictivo) —
// más seguro que asumir acceso total ante un valor inesperado en Mongo.
function featuresDePlan(plan) {
  return PLANES[plan] || PLANES.trial;
}

module.exports = { PLANES, featuresDePlan };
