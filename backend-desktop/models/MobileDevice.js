// models/MobileDevice.js
// Celulares (app Android/iOS de Akira) que recibirán las notificaciones push de un usuario. La app móvil
// solo MONITOREA y hace ajustes mínimos: el bot y los datos siguen en la PC.
'use strict';

const mongoose = require('mongoose');

const MobileDeviceSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pushToken:  { type: String, required: true, unique: true }, // ExponentPushToken[...]  (en la app web: la URL de la suscripción)
    suscripcion: { type: mongoose.Schema.Types.Mixed, default: null }, // solo app web: { endpoint, keys: { p256dh, auth } }
    plataforma: { type: String, enum: ['android', 'ios', 'web', 'otra'], default: 'otra' },
    nombre:     { type: String, default: '' },
    activo:     { type: Boolean, default: true },
    ultimoUso:  { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'mobile_devices' },
);

module.exports = mongoose.model('MobileDevice', MobileDeviceSchema);
