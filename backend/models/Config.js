// models/Config.js
'use strict';

const mongoose    = require('mongoose');
const cryptoSvc   = require('../services/crypto.service');

// ── Sub-schema para campos cifrados ─────────────────────────
const EncryptedField = {
  iv:         { type: String },
  encrypted:  { type: String },
  authTag:    { type: String },
};

const ConfigSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // API Keys — almacenadas SIEMPRE cifradas (AES-256-GCM)
    keyGroq:     { ...EncryptedField },
    keyMP:       { ...EncryptedField },
    idCalendar:  { ...EncryptedField },
    keyRime:     { ...EncryptedField },
    keyNgrok:    { ...EncryptedField },
    dominioNgrok: { type: String, trim: true, default: '' },

    // Configuración del negocio (no sensible)
    miNombre:    { type: String, default: '', trim: true },
    negocio:     { type: String, default: '', trim: true },
    servicios:   { type: String, default: 'turnos y reservas', trim: true },
    precioTurno: { type: Number, default: 1000, min: 0 },
    horasCancelacion: { type: Number, default: 24, min: 0 },
    promptPersonalizado: { type: String, default: '', maxlength: 2000 },

    // Webhook
    mpWebhookUrl: { type: String, default: '', trim: true },

    // Estado de configuración
    configurado: { type: Boolean, default: false },
    credentialsGoogleB64: { ...EncryptedField }, // credentials.json de Google cifrado
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        // Nunca exponer los campos cifrados crudos al frontend
        delete ret.keyGroq;
        delete ret.keyMP;
        delete ret.idCalendar;
        delete ret.keyRime;
        delete ret.keyNgrok;
        delete ret.credentialsGoogleB64;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ── Método: guardar key cifrada ──────────────────────────────
ConfigSchema.methods.setKey = function (campo, valor) {
  if (!valor) {
    this[campo] = undefined;
    return;
  }
  this[campo] = cryptoSvc.encrypt(valor);
};

// ── Método: obtener key descifrada ───────────────────────────
ConfigSchema.methods.getKey = function (campo) {
  if (!this[campo]?.encrypted) return null;
  return cryptoSvc.decrypt(this[campo]);
};

// ── Método: verificar si la config está completa ─────────────
ConfigSchema.methods.estaCompleta = function () {
  return !!(this.keyGroq?.encrypted && this.miNombre && this.negocio);
};

// ── Método: retornar resumen seguro de qué keys están cargadas ─
ConfigSchema.methods.resumenKeys = function () {
  return {
    groq:     !!this.keyGroq?.encrypted,
    mp:       !!this.keyMP?.encrypted,
    calendar: !!this.idCalendar?.encrypted,
    rime:     !!this.keyRime?.encrypted,
    ngrok:    !!this.keyNgrok?.encrypted,
    credentialsGoogle: !!this.credentialsGoogleB64?.encrypted,
  };
};

module.exports = mongoose.model('Config', ConfigSchema);
