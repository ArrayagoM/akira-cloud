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

    // Transferencia bancaria (alternativa a MercadoPago)
    aliasTransferencia: { type: String, default: '', trim: true },
    cbuTransferencia:   { type: String, default: '', trim: true },
    bancoTransferencia: { type: String, default: '', trim: true },

    // Servicios múltiples: [{ nombre, precio, duracion, intervaloRecordatorioDias, mensajeRecordatorio }]
    serviciosList: {
      type: [{
        nombre:   { type: String, required: true },
        precio:   { type: Number, required: true, min: 0 },
        duracion: { type: Number, default: 60 }, // minutos
        // Cada cuántos días recordarle al cliente que vuelva por este servicio (0 = desactivado)
        intervaloRecordatorioDias: { type: Number, default: 0, min: 0 },
        // Mensaje custom para el recordatorio. Variables: {nombre}, {negocio}, {dias}
        mensajeRecordatorio: { type: String, default: '', trim: true, maxlength: 500 },
      }],
      default: [],
    },

    // Webhook
    mpWebhookUrl: { type: String, default: '', trim: true },

    // Horarios de atención por día de la semana
    horariosAtencion: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        lunes:     { activo: true,  inicio: '09:00', fin: '18:00' },
        martes:    { activo: true,  inicio: '09:00', fin: '18:00' },
        miercoles: { activo: true,  inicio: '09:00', fin: '18:00' },
        jueves:    { activo: true,  inicio: '09:00', fin: '18:00' },
        viernes:   { activo: true,  inicio: '09:00', fin: '18:00' },
        sabado:    { activo: true,  inicio: '09:00', fin: '13:00' },
        domingo:   { activo: false, inicio: '09:00', fin: '18:00' },
      }),
    },

    // Número al que el bot notifica cuando confirma un turno
    celularNotificaciones: { type: String, default: '', trim: true },

    // Modo pausa: el bot no acepta nuevas reservas
    modoPausa:     { type: Boolean, default: false },
    // Días específicamente bloqueados: ['YYYY-MM-DD', ...]
    diasBloqueados: { type: [String], default: [] },
    // Chats ignorados: el bot no responde a estos números ['549...', ...]
    chatsIgnorados: { type: [String], default: [] },

    // Tipo de negocio — cambia el flujo del bot
    // 'turnos'     → slots horarios (barbería, médico, etc.)
    // 'alojamiento'→ check-in / check-out (cabañas, depts, hospedajes)
    // 'servicios'  → trabajos sobre ítems (lavaderos, mecánicos, veterinarias)
    tipoNegocio:   { type: String, enum: ['turnos', 'alojamiento', 'servicios'], default: 'turnos' },
    checkInHora:   { type: String, default: '14:00', trim: true },
    checkOutHora:  { type: String, default: '10:00', trim: true },
    minimaEstadia: { type: Number, default: 1, min: 1 },

    // Dirección y ubicación de la propiedad
    direccionPropiedad: { type: String, default: '', trim: true },
    linkUbicacion:      { type: String, default: '', trim: true }, // link de Google Maps

    // Unidades de alojamiento (cabañas, departamentos, habitaciones...)
    unidadesAlojamiento: {
      type: [{
        nombre:         { type: String, required: true },
        descripcion:    { type: String, default: '' },
        capacidad:      { type: Number, default: 2, min: 1 },
        precioPorNoche: { type: Number, default: 0, min: 0 },
        amenidades:     { type: String, default: '' }, // "WiFi, TV, parrilla, jacuzzi"
      }],
      default: [],
    },

    // ── Catálogo de productos (revendedores / tiendas / WA Business) ──────
    // fuente: 'manual' | 'wa_catalog' | 'status'
    catalogo: {
      type: [{
        waProductId:  { type: String, default: '' },       // ID en WA Business
        nombre:       { type: String, required: true },
        descripcion:  { type: String, default: '' },
        precio:       { type: Number, default: 0, min: 0 },
        moneda:       { type: String, default: 'ARS' },
        categoria:    { type: String, default: '' },
        stock:        { type: Number, default: -1 },       // -1 = sin límite
        imagen:       { type: String, default: '' },       // URL de imagen
        disponible:   { type: Boolean, default: true },
        fuente:       { type: String, default: 'manual' },
      }],
      default: [],
    },
    catalogoSincronizadoEn: { type: Date, default: null },

    googleReviewLink:    { type: String, default: '', trim: true },
    activarResenas:      { type: Boolean, default: true },
    activarReengagement: { type: Boolean, default: true },
    mensajeReengagement30: { type: String, default: '', trim: true },
    mensajeReengagement60: { type: String, default: '', trim: true },

    // Estado de configuración
    configurado: { type: Boolean, default: false },
    credentialsGoogleB64: { ...EncryptedField }, // credentials.json de Google cifrado

    // Google Calendar OAuth (tokens del usuario, cifrados)
    googleCalendarTokens: { ...EncryptedField },
    googleEmail: { type: String, default: '', trim: true },
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
        delete ret.googleCalendarTokens;
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
    credentialsGoogle:    !!this.credentialsGoogleB64?.encrypted,
    googleCalendarOAuth:  !!this.googleCalendarTokens?.encrypted,
    googleEmail:          this.googleEmail || '',
    tieneTransferencia:   !!(this.aliasTransferencia || this.cbuTransferencia),
    tieneCatalogo:        this.catalogo?.length > 0,
    catalogoProductos:    this.catalogo?.length || 0,
    catalogoSincronizadoEn: this.catalogoSincronizadoEn || null,
  };
};

module.exports = mongoose.model('Config', ConfigSchema);
