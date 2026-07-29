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

    // ─── Memoria de largo plazo (perfil del cliente) ─────────────────
    // Resumen corto (2-4 líneas) que el bot va aprendiendo del cliente:
    // cómo prefiere que le hablen, si es frecuente, si suele cancelar,
    // método de pago preferido, etc. A diferencia de `historial` (que se
    // trunca a los últimos mensajes), este campo NUNCA se resetea — se
    // actualiza periódicamente vía LLM (ver services/bot/perfil-cliente.service.js)
    // justo antes de que el historial local se trunque, para no perder ese
    // contexto viejo. Es la base de "la atención del negocio" que persiste
    // más allá de la ventana de contexto corta.
    perfilResumen:                { type: String, default: '', maxlength: 2000 },

    noShowCount:                  { type: Number, default: 0 },
    ultimoMensajeReengagement:    { type: Date, default: null },

    // ─── CRM: notas privadas + etiquetas + recordatorios personalizados ─
    notas:                        { type: String, default: '', maxlength: 1000 },
    etiquetas:                    { type: [String], default: [] },          // ['VIP', 'Frecuente', 'Alergia']
    ultimoServicio:               { type: String, default: '' },             // último servicio reservado (cache)
    // Si está seteado, override del intervalo del servicio para este cliente puntual
    intervaloRecordatorioDias:    { type: Number, default: null, min: 0 },
    totalGastado:                 { type: Number, default: 0 },              // suma turnos confirmados (cache)
  },
  { timestamps: true, collection: 'bot_clientes' }
);

// Índice compuesto para buscar rápido por negocio + jid
BotClienteSchema.index({ userId: 1, jid: 1 }, { unique: true });

module.exports = mongoose.model('BotCliente', BotClienteSchema);
