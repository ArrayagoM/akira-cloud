// models/Log.js
'use strict';

const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    tipo: {
      type: String,
      enum: [
        'auth_login',
        'auth_logout',
        'auth_register',
        'auth_fail',
        'bot_start',
        'bot_stop',
        'bot_qr',
        'bot_connected',
        'bot_disconnected',
        'bot_message_in',
        'bot_message_out',
        'bot_reservation',
        'bot_payment',
        'bot_autostart',
        'bot_watchdog',
        'bot_healthcheck',
        'bot_silenced',
        'config_update',
        'admin_action',
        'security_block',
        'security_rate_limit',
        'error',
      ],
      required: true,
      index: true,
    },

    nivel: {
      type: String,
      enum: ['info', 'warn', 'error', 'critical'],
      default: 'info',
    },

    mensaje:   { type: String, required: true, maxlength: 1000 },
    detalle:   { type: mongoose.Schema.Types.Mixed },
    ip:        { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
    // TTL automático: logs normales se eliminan a los 90 días
    // los de seguridad/error se pueden retener más
  }
);

// Índice compuesto para queries frecuentes del admin
LogSchema.index({ userId: 1, createdAt: -1 });
LogSchema.index({ tipo: 1, createdAt: -1 });
LogSchema.index({ nivel: 1, createdAt: -1 });
// TTL: eliminar logs info/warn después de 90 días
LogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { nivel: { $in: ['info', 'warn'] } } });

// ── Helper estático para crear logs fácilmente ───────────────
LogSchema.statics.registrar = async function ({ userId, tipo, nivel = 'info', mensaje, detalle, ip, userAgent }) {
  try {
    await this.create({ userId, tipo, nivel, mensaje, detalle, ip, userAgent });
  } catch (err) {
    // Nunca dejar que un fallo de log rompa el flujo principal
    console.error('[Log] Error al registrar:', err.message);
  }
};

module.exports = mongoose.model('Log', LogSchema);
