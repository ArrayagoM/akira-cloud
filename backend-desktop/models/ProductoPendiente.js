// models/ProductoPendiente.js
// Producto cargado desde el celular que todavía espera a que la PC lo retire (ver lib/productos-celular.js).
// La foto solo vive acá hasta que la PC confirma; después se borra. Mongo borra el registro solo cuando vence (expireAt).
'use strict';

const mongoose = require('mongoose');

const ProductoPendienteSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: { type: String, required: true },
  estado:   { type: String, enum: ['pendiente', 'hecho', 'fallo'], default: 'pendiente' },
  producto: {
    nombre:      { type: String, default: '' }, // vacío si el celular mandó solo la foto: la PC lo completa leyéndola
    precio:      { type: Number, default: 0 },
    categoria:   { type: String, default: '' },
    stock:       { type: Number, default: -1 },
    descripcion: { type: String, default: '' },
    codigo:      { type: String, default: '' },
  },
  foto:     { mime: { type: String, default: '' }, data: { type: String, default: '' } },
  detalle:  { type: String, default: '' },
  creadoEn: { type: Date, default: Date.now },
  hechoEn:  { type: Date, default: null },
  expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { collection: 'productospendientes' });

ProductoPendienteSchema.index({ userId: 1, deviceId: 1, estado: 1, creadoEn: 1 });

module.exports = mongoose.models.ProductoPendiente || mongoose.model('ProductoPendiente', ProductoPendienteSchema);
