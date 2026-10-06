// routes/support.routes.js
// Chat de soporte técnico con Akira IA
'use strict';

const express        = require('express');
const router         = express.Router();
const { body, validationResult } = require('express-validator');
const passport       = require('passport');
const SupportChat    = require('../models/SupportChat');
const Config         = require('../models/Config');
const supportService = require('../services/support.service');
const logger         = require('../config/logger');

const auth = passport.authenticate('jwt', { session: false });

// ── POST /api/support/chat ─────────────────────────────────────
// Enviar mensaje y obtener respuesta de Akira
router.post(
  '/chat',
  auth,
  [body('mensaje').trim().notEmpty().isLength({ max: 2000 }).withMessage('Mensaje requerido (máx 2000 chars)')],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) return res.status(400).json({ error: errores.array()[0].msg });

    try {
      const usuario = req.user;
      const { mensaje } = req.body;

      // Obtener historial existente o crear uno nuevo
      let chat = await SupportChat.findOne({ userId: usuario._id });
      if (!chat) chat = new SupportChat({ userId: usuario._id, messages: [] });

      // Obtener Groq API Key — usar la del usuario si tiene, sino la de la plataforma
      let groqApiKey = process.env.GROQ_PLATFORM_API_KEY || process.env.GROQ_API_KEY;

      // Si el usuario tiene su propia key configurada, usarla
      try {
        const config = await Config.findOne({ userId: usuario._id });
        if (config?.keyGroq?.encrypted) {
          const userKey = config.getKey('keyGroq');
          if (userKey) groqApiKey = userKey;
        }
      } catch {}

      if (!groqApiKey) {
        return res.status(503).json({ error: 'Servicio de IA temporalmente no disponible' });
      }

      // Generar respuesta
      const respuesta = await supportService.procesarMensaje({
        usuario,
        groqApiKey,
        mensajeUsuario: mensaje,
        historialPrevio: chat.messages,
      });

      // Guardar ambos mensajes en el historial
      await chat.agregarMensaje('user', mensaje);
      await chat.agregarMensaje('assistant', respuesta);

      res.json({ respuesta, timestamp: new Date().toISOString() });

    } catch (err) {
      logger.error('[Support] Error en chat:', err.message);
      if (err.status === 429) return res.status(429).json({ error: 'Demasiadas consultas. Esperá un momento.' });
      res.status(500).json({ error: 'Error procesando tu consulta. Intentá de nuevo.' });
    }
  }
);

// ── GET /api/support/history ───────────────────────────────────
// Obtener historial de chat del usuario
router.get('/history', auth, async (req, res) => {
  try {
    const chat = await SupportChat.findOne({ userId: req.user._id }).lean();
    res.json({ messages: chat?.messages || [] });
  } catch (err) {
    logger.error('[Support] Error obteniendo historial:', err.message);
    res.status(500).json({ error: 'Error obteniendo historial' });
  }
});

// ── DELETE /api/support/history ────────────────────────────────
// Limpiar historial del usuario
router.delete('/history', auth, async (req, res) => {
  try {
    await SupportChat.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { messages: [] } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('[Support] Error limpiando historial:', err.message);
    res.status(500).json({ error: 'Error limpiando historial' });
  }
});

module.exports = router;
