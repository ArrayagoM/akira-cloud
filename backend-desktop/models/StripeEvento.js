// models/StripeEvento.js
// Eventos de Stripe ya procesados. Stripe puede mandar el mismo evento más de una vez (reintentos): el _id es el id del evento y es único,
// así que el segundo intento no hace nada. Se borran solos a los 35 días (Stripe reintenta durante unos días, no más).
'use strict';

const mongoose = require('mongoose');

const StripeEventoSchema = new mongoose.Schema({
  _id:    { type: String },                       // evt_...
  tipo:   { type: String, default: '' },
  creado: { type: Date, default: Date.now },
  expira: { type: Date, default: () => new Date(Date.now() + 35 * 86400000) },
}, { versionKey: false });
StripeEventoSchema.index({ expira: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.StripeEvento || mongoose.model('StripeEvento', StripeEventoSchema);
