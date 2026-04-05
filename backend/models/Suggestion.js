'use strict';
const mongoose = require('mongoose');

const SuggestionSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userNombre:  { type: String, default: '' },
  userEmail:   { type: String, default: '' },
  texto:       { type: String, required: true, maxlength: 2000 },
  estado: {
    type: String,
    enum: ['analizando', 'analizada', 'en_progreso', 'implementada', 'descartada'],
    default: 'analizando',
  },
  puntuacion:  { type: Number, min: 1, max: 10, default: null }, // Score IA 1-10
  analisisIA: {
    resumen:        { type: String, default: '' },
    categoria:      { type: String, default: '' }, // UX, Bot, Seguridad, Integración, Negocio, Performance
    valor:          { type: String, default: '' }, // por qué es valiosa
    dificultad:     { type: String, default: '' }, // baja, media, alta
    prioridad:      { type: String, default: '' }, // baja, media, alta, crítica
  },
  notaAdmin:   { type: String, default: '' },
  votos:       { type: Number, default: 0 }, // futuro: upvotes de otros usuarios
}, { timestamps: true });

SuggestionSchema.index({ puntuacion: -1, createdAt: -1 });
SuggestionSchema.index({ userId: 1, createdAt: -1 });
SuggestionSchema.index({ estado: 1 });

module.exports = mongoose.model('Suggestion', SuggestionSchema);
