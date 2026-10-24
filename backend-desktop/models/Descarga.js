// models/Descarga.js
// Una descarga del instalador (Windows, Mac o Android) pedida desde nuestro enlace. Sirve para el contador del panel de administración.
// No se guarda la IP ni el navegador: solo una huella corta (sha256 con clave) para no contar dos veces al mismo visitante.
// Los pedidos de buscadores y robots no se guardan. Se borran solos a los 400 días.
'use strict';

const mongoose = require('mongoose');

const DescargaSchema = new mongoose.Schema({
  plataforma: { type: String, required: true, enum: ['windows', 'android', 'mac-arm64', 'mac-x64'], index: true },
  origen:     { type: String, default: 'directo' },       // de dónde vino (parámetro r= del enlace: web, email, tiktok…)
  visitante:  { type: String, required: true },           // huella corta del visitante
  fecha:      { type: Date, default: Date.now, index: true, expires: 400 * 24 * 3600 },
});
DescargaSchema.index({ visitante: 1, plataforma: 1, fecha: -1 });

module.exports = mongoose.models.Descarga || mongoose.model('Descarga', DescargaSchema);
