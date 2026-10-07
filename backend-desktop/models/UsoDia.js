// models/UsoDia.js — contadores de uso de pantallas por equipo y día (ver lib/uso.js). Sin datos de los clientes de nadie.
'use strict';

const mongoose = require('mongoose');

const UsoDiaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: { type: String, required: true },
  dia: { type: String, required: true },
  pantallas: { type: mongoose.Schema.Types.Mixed, default: {} },
  version: { type: String, default: '' },
  actualizadoEn: { type: Date, default: Date.now },
}, { timestamps: false });

UsoDiaSchema.index({ deviceId: 1, dia: 1 }, { unique: true });
UsoDiaSchema.index({ actualizadoEn: 1 }, { expireAfterSeconds: 120 * 24 * 3600 }); // se borra solo a los 120 días

module.exports = mongoose.models.UsoDia || mongoose.model('UsoDia', UsoDiaSchema);
