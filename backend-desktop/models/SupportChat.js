// models/SupportChat.js
// Historial de chat de soporte técnico entre el usuario y Akira.
'use strict';

const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    role:      { type: String, enum: ['user', 'assistant'], required: true },
    content:   { type: String, required: true, maxlength: 8000 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SupportChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    messages: {
      type: [MessageSchema],
      default: [],
      // Mantener máximo 100 mensajes por usuario
      validate: {
        validator: v => v.length <= 100,
        message:   'Historial de chat excede el límite de 100 mensajes',
      },
    },
  },
  { timestamps: true }
);

// Agregar mensaje y rotar si supera 100
SupportChatSchema.methods.agregarMensaje = async function (role, content) {
  this.messages.push({ role, content });
  if (this.messages.length > 100) {
    // Eliminar los primeros 2 (par user+assistant) para liberar espacio
    this.messages.splice(0, 2);
  }
  await this.save();
};

module.exports = mongoose.model('SupportChat', SupportChatSchema);
