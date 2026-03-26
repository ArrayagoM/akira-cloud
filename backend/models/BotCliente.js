// models/BotCliente.js
// Un registro por cada cliente de WhatsApp de un negocio.
// Relación: 1 User → N BotClientes
'use strict';

const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

// ── Sub-schema para mensajes del historial ───────────────────
const HistorialItemSchema = new mongoose.Schema({
  role:         { type: String, required: true },   // user | assistant | tool | system
  content:      { type: String, default: null },
  tool_calls:   { type: mongoose.Schema.Types.Mixed, default: undefined },
  tool_call_id: { type: String, default: undefined },
  name:         { type: String, default: undefined },
}, { _id: false });

// ── Sub-schema para turnos confirmados ───────────────────────
const TurnoSchema = new mongoose.Schema({
  fecha:    { type: String },
  hora:     { type: String },
  horaFin:  { type: String, default: null },
  pagoId:   { type: String, default: null },
  confirmadoEn: { type: String, default: null },
}, { _id: false });

// ── Schema principal ─────────────────────────────────────────
const BotClienteSchema = new mongoose.Schema(
  {
    userId:    { type: ObjectId, ref: 'User', required: true, index: true },
    jid:       { type: String, required: true },       // ej: 5491112345678@s.whatsapp.net
    nombre:    { type: String, default: '' },
    telefono:  { type: String, default: '' },
    numeroReal:{ type: String, default: '' },
    email:     { type: String, default: null },
    silenciado:{ type: Boolean, default: false },
    historial: {
      type:    [HistorialItemSchema],
      default: [],
    },
    turnosConfirmados: {
      type:    [TurnoSchema],
      default: [],
    },
  },
  { timestamps: true, collection: 'bot_clientes' }
);

// Índice compuesto para buscar rápido por negocio + jid
BotClienteSchema.index({ userId: 1, jid: 1 }, { unique: true });

module.exports = mongoose.model('BotCliente', BotClienteSchema);
