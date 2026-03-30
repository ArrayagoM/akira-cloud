// models/Turno.js
'use strict';

const mongoose = require('mongoose');

const TurnoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Identificador de unidad (para alojamiento: nombre de cabaña/depto)
    // Para turnos normales: vacío o 'principal'
    calendarId: { type: String, default: 'principal', trim: true },

    // Datos del cliente
    clienteNombre:    { type: String, default: '', trim: true },
    clienteTelefono:  { type: String, default: '', trim: true },
    clienteEmail:     { type: String, default: '', trim: true },

    // Datos del turno
    resumen:    { type: String, required: true, trim: true },
    descripcion:{ type: String, default: '', trim: true },
    fechaInicio:{ type: Date, required: true, index: true },
    fechaFin:   { type: Date, required: true },

    // Estado del turno
    estado: {
      type: String,
      enum: ['pendiente', 'confirmado', 'cancelado'],
      default: 'confirmado',
    },

    // Pago
    pago: {
      monto:    { type: Number, default: 0 },
      metodo:   { type: String, default: '' }, // 'transferencia' | 'mercadopago' | 'efectivo'
      comprobante: { type: String, default: '' },
    },

    // Notificación enviada al dueño
    notificadoDueno: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Índice compuesto para queries frecuentes del bot
TurnoSchema.index({ userId: 1, fechaInicio: 1 });
TurnoSchema.index({ userId: 1, calendarId: 1, fechaInicio: 1 });

module.exports = mongoose.model('Turno', TurnoSchema);
