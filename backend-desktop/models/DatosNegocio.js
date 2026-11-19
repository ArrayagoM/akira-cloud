// models/DatosNegocio.js
// Copia de los datos del negocio que el usuario eligió ver desde el celular (agenda, caja, clientes y deudores, catálogo).
// OPCIONAL: solo existe si el usuario lo activó en la app de la PC. Se guarda CIFRADA (services/crypto.service.js) y solo la lee
// la cuenta dueña (GET /api/mobile/datos). Se borra al apagar la opción, al desactivar el equipo y sola a los 30 días sin novedades
// de la PC. Nunca se muestra en el panel de administración.
'use strict';

const mongoose = require('mongoose');

const DatosNegocioSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId:     { type: String, required: true },
    tipo:         { type: String, enum: ['agenda', 'caja', 'clientes', 'catalogo'], required: true },
    cifrado:      { type: String, required: true, select: false },
    hash:         { type: String, default: '' },
    actualizadoEn: { type: Date, default: Date.now, index: { expires: 30 * 24 * 3600 } }, // TTL: Mongo lo borra a los 30 días sin novedades
  },
  { collection: 'datos_negocio' },
);
DatosNegocioSchema.index({ userId: 1, deviceId: 1, tipo: 1 }, { unique: true });

module.exports = mongoose.model('DatosNegocio', DatosNegocioSchema);
