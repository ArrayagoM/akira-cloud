// models/Limite.js
// Contadores del limitador de intentos (registro, verificación de email, recuperar contraseña…). Viven en la base y no en la memoria del servidor:
// en Vercel cada arranque en frío empezaba de cero y el límite anterior no frenaba a nadie. Se borran solos al vencer la ventana.
'use strict';

const mongoose = require('mongoose');

const LimiteSchema = new mongoose.Schema({
  _id:    { type: String },                       // por ejemplo "reg:ip:1.2.3.4"
  n:      { type: Number, default: 0 },
  expira: { type: Date, required: true },
}, { versionKey: false });
LimiteSchema.index({ expira: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.Limite || mongoose.model('Limite', LimiteSchema);
