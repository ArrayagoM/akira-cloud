// models/Device.js
// Licencia por dispositivo — no existía ningún concepto de "instalación"
// en el modelo anterior (instkey.js era uid:slot, identifica una cuenta de
// WhatsApp en memoria, no un equipo físico). Este modelo es la base del
// gate de licencia del software de escritorio.
'use strict';

const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      unique: true,
      // UUID v4 generado por la app Electron en el primer arranque y
      // persistido en userData/device-id.json — identifica la instalación,
      // no la cuenta de WhatsApp (eso lo sigue haciendo el slot, dentro
      // de la instalación).
    },
    fingerprint: { type: String, default: '' }, // hash de características de la máquina — solo para detectar reinstalaciones, no es anti-fraude fuerte
    nombre:      { type: String, default: '' }, // ej. "PC de Juan - Barbería"

    activo:       { type: Boolean, default: true },
    activadoEn:   { type: Date, default: Date.now },
    ultimoHeartbeat: { type: Date, default: Date.now },

    revocado:       { type: Boolean, default: false },
    revocadoMotivo: { type: String, default: '' },
    revocadoEn:     { type: Date },
  },
  { timestamps: true },
);

DeviceSchema.index({ userId: 1, activo: 1, revocado: 1 });

module.exports = mongoose.model('Device', DeviceSchema);
