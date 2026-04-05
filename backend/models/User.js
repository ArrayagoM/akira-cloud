// models/User.js
'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    nombre:    { type: String, required: true, trim: true, maxlength: 100 },
    apellido:  { type: String, trim: true, maxlength: 100, default: '' },
    email:     {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido'],
    },
    password: {
      type: String,
      minlength: 8,
      select: false, // nunca retornar password en queries
    },
    celular:  { type: String, trim: true, default: '' },
    pais:     { type: String, trim: true, default: 'Argentina' },
    direccion: { type: String, trim: true, default: '' },

    auth_provider: {
      type: String,
      enum: ['local', 'google', 'facebook'],
      default: 'local',
    },
    googleId:   { type: String, sparse: true },
    facebookId: { type: String, sparse: true },
    avatar:     { type: String, default: '' },

    rol: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    status: {
      type: String,
      enum: ['activo', 'bloqueado', 'pendiente'],
      default: 'activo',
    },

    // Suscripción
    plan: {
      type: String,
      enum: ['trial', 'basico', 'pro', 'agencia', 'admin'],
      default: 'trial',
    },
    planPeriodo: {
      type: String,
      enum: ['mensual', 'anual', null],
      default: null,
    },
    trialExpira: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    planExpira:  { type: Date },

    // Estado del bot (slot 0 — backward compat)
    botActivo:    { type: Boolean, default: false },
    botConectado: { type: Boolean, default: false },

    // Cuentas WhatsApp múltiples (plan Agencia: hasta 5 slots)
    cuentasWA: {
      type: [{
        slot:      { type: Number, required: true, min: 0, max: 4 },
        nombre:    { type: String, default: '' },
        activo:    { type: Boolean, default: false },
        conectado: { type: Boolean, default: false },
      }],
      default: [],
    },

    // Metadatos
    ultimoLogin: { type: Date },
    ipUltimoLogin: { type: String },
    loginCount:  { type: Number, default: 0 },
    loginFailedCount:    { type: Number, default: 0 },
    loginLockedUntil:    { type: Date,   default: null },
    tokenVersion:        { type: Number, default: 0 },
    bloqueadoPor: { type: String }, // motivo del bloqueo

    resetPasswordToken:   { type: String,  select: false },
    resetPasswordExpires: { type: Date,    select: false },

    // Testers
    esTester: { type: Boolean, default: false },

    // Sistema de referidos
    codigoReferido:      { type: String, unique: true, sparse: true }, // código propio para compartir
    codigoReferidoUsado: { type: String, default: '' },                // código que usó al registrarse
    creditoReferidos:    { type: Number, default: 0 },                 // ARS acumulados por referidos
    descuentoReferido:   { type: Number, default: 0 },                 // descuento pendiente por haber sido referido (5000)
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ── Índices ──────────────────────────────────────────────────
// email ya tiene unique:true en el schema — no duplicar índice aquí
UserSchema.index({ rol: 1, status: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ plan: 1, status: 1 });
UserSchema.index({ botActivo: 1 });

// ── Hooks ────────────────────────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Métodos ──────────────────────────────────────────────────
UserSchema.methods.compararPassword = async function (candidato) {
  if (!this.password) return false;
  return bcrypt.compare(candidato, this.password);
};

UserSchema.methods.planVigente = function () {
  if (this.esTester) return true; // testers: siempre activo sin pagar
  if (this.rol === 'admin' || this.plan === 'admin') return true; // admin: siempre activo
  if (this.plan === 'trial') return this.trialExpira > new Date();
  if (this.planExpira) return this.planExpira > new Date();
  return false;
};

UserSchema.virtual('nombreCompleto').get(function () {
  return `${this.nombre} ${this.apellido}`.trim();
});

UserSchema.statics.generarCodigoReferido = function (nombre) {
  const base = nombre.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) || 'USER';
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}-${rand}`;
};

module.exports = mongoose.model('User', UserSchema);
