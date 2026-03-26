'use strict';
const mongoose = require('mongoose');

const MensajeSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant', 'system', 'tool'], required: true },
  content: { type: String, default: '' },
  tool_calls:   { type: mongoose.Schema.Types.Mixed },
  tool_call_id: { type: String },
  name:         { type: String },
}, { _id: false });

const ClienteMemoriaSchema = new mongoose.Schema({
  // _id = `${userId}:${telefono}` para aislamiento por negocio
  _id:              { type: String },
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  telefono:         { type: String, required: true },
  numeroReal:       { type: String, default: '' },
  nombre:           { type: String, default: '' },
  email:            { type: String, default: '' },
  silenciado:       { type: Boolean, default: false },
  historial:        { type: [MensajeSchema], default: [] },
  turnosConfirmados: { type: mongoose.Schema.Types.Mixed, default: [] },
}, {
  collection: 'clientes_memoria',
  timestamps: true,
});

module.exports = mongoose.model('ClienteMemoria', ClienteMemoriaSchema);
