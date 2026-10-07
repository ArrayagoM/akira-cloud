'use strict';
const mongoose = require('mongoose');

// Registro de cada email que sale de la plataforma (campañas, pruebas y emails del sistema
// como recuperar contraseña). Lo ve el admin en su panel → Emails.
// estado: enviado (salió hacia el servidor de correo) → entregado | rebotado | spam (lo informa Resend por webhook)
//         fallido (no se pudo ni enviar)
const EmailLogSchema = new mongoose.Schema({
  para:      { type: String, required: true, lowercase: true, trim: true, index: true },
  asunto:    { type: String, default: '', trim: true },
  tipo:      { type: String, enum: ['campana', 'prueba', 'sistema'], default: 'sistema', index: true },
  campana:   { type: String, default: '', index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  estado:    { type: String, enum: ['enviado', 'fallido', 'entregado', 'rebotado', 'spam'], default: 'enviado', index: true },
  error:     { type: String, default: '' },
  enviadoEn: { type: Date, default: Date.now, index: true },
  eventos:   { type: [{ tipo: String, fecha: Date, detalle: String, _id: false }], default: [] },
  // true si se reconstruyó a partir de datos viejos (se sabe que se envió, no hay detalle de entrega)
  reconstruido: { type: Boolean, default: false },
}, { collection: 'email_logs', timestamps: true });

module.exports = mongoose.model('EmailLog', EmailLogSchema);
