// models/WaitlistEntry.js
'use strict';
const mongoose = require('mongoose');

const WaitlistEntrySchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jid:           { type: String, required: true },
  clienteNombre: { type: String, default: '' },
  clienteTel:    { type: String, default: '' },
  fecha:         { type: String, required: true },  // YYYY-MM-DD
  hora:          { type: String, default: null },   // HH:00 o null = cualquier hora
  calendarId:    { type: String, default: 'principal' },
  estado: {
    type: String,
    enum: ['esperando', 'contactado', 'confirmado', 'expirado'],
    default: 'esperando',
    index: true,
  },
  contactadoEn:  { type: Date, default: null },
  expiraEn:      { type: Date, default: null },
}, { timestamps: true });

WaitlistEntrySchema.index({ userId: 1, fecha: 1, estado: 1, createdAt: 1 });
WaitlistEntrySchema.index({ userId: 1, jid: 1, fecha: 1 });

module.exports = mongoose.model('WaitlistEntry', WaitlistEntrySchema);
