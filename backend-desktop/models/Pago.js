// models/Pago.js
// Cada cobro de suscripción aprobado por Mercado Pago que activó (o renovó) un plan. Sirve para el panel de ingresos del administrador.
// El número de pago de Mercado Pago es único: un mismo pago nunca se registra dos veces.
'use strict';

const mongoose = require('mongoose');

const PagoSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email:             { type: String, default: '' },          // copia del email al momento del pago (por si después cambia)
  mpPagoId:          { type: String, required: true, unique: true },
  plan:              { type: String, required: true },       // basico | pro | agencia
  periodo:           { type: String, default: 'mensual' },   // mensual | anual
  monto:             { type: Number, required: true },       // lo que Mercado Pago cobró de verdad (ARS)
  descuentoReferido: { type: Number, default: 0 },
  estado:            { type: String, default: 'aprobado' },  // aprobado | reembolsado
  fecha:             { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.models.Pago || mongoose.model('Pago', PagoSchema);
