'use strict';
const mongoose = require('mongoose');

const ReferidoSchema = new mongoose.Schema({
  referente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referido:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  codigo:    { type: String, required: true },
  descuentoAplicado: { type: Number, default: 5000 }, // descuento al referido
  comisionPendiente: { type: Number, default: 5000 }, // comision para el referente
  comisionPagada:    { type: Boolean, default: false },
  pagoMpId:          { type: String, default: '' },   // MP payment ID que activó la comisión
  estado: {
    type: String,
    enum: ['pendiente', 'activo', 'pagado'],
    default: 'pendiente',  // pendiente hasta que el referido pague su primer plan
  },
}, { collection: 'referidos', timestamps: true });

module.exports = mongoose.model('Referido', ReferidoSchema);
