'use strict';

const express    = require('express');
const router     = express.Router();
const { body, validationResult } = require('express-validator');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const Suggestion = require('../models/Suggestion');
const Config     = require('../models/Config');
const { analizarSugerencia } = require('../services/suggestion.service');
const logger     = require('../config/logger');

// ── POST /api/suggestions — usuario envía una sugerencia ──────
router.post('/',
  requireAuth,
  [body('texto').trim().notEmpty().isLength({ min: 20, max: 2000 })
    .withMessage('La sugerencia debe tener entre 20 y 2000 caracteres')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      // Limitar a 5 sugerencias por usuario por día
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const count = await Suggestion.countDocuments({ userId: req.user._id, createdAt: { $gte: hoy } });
      if (count >= 5) return res.status(429).json({ error: 'Máximo 5 sugerencias por día. ¡Gracias por tu entusiasmo!' });

      // Crear con estado analizando
      const sug = await Suggestion.create({
        userId:     req.user._id,
        userNombre: req.user.nombre,
        userEmail:  req.user.email,
        texto:      req.body.texto,
        estado:     'analizando',
      });

      res.status(201).json({ ok: true, id: sug._id, mensaje: '¡Gracias! Tu sugerencia está siendo analizada por la IA.' });

      // Análisis async — no bloquear la respuesta al usuario
      setImmediate(async () => {
        try {
          let groqKey = process.env.GROQ_PLATFORM_API_KEY || process.env.GROQ_API_KEY;
          try {
            const cfg = await Config.findOne({ userId: req.user._id });
            if (cfg?.keyGroq?.encrypted) { const k = cfg.getKey('keyGroq'); if (k) groqKey = k; }
          } catch {}

          if (!groqKey) { await Suggestion.findByIdAndUpdate(sug._id, { estado: 'analizada', puntuacion: 5 }); return; }

          const resultado = await analizarSugerencia(req.body.texto, groqKey);
          await Suggestion.findByIdAndUpdate(sug._id, {
            estado: 'analizada',
            puntuacion: resultado.puntuacion,
            analisisIA: resultado.analisisIA,
          });
          logger.info(`[Suggestion] Analizada: score=${resultado.puntuacion} cat=${resultado.analisisIA.categoria}`);
        } catch (e) {
          logger.error('[Suggestion] Error análisis async:', e.message);
          await Suggestion.findByIdAndUpdate(sug._id, { estado: 'analizada', puntuacion: 5 }).catch(() => {});
        }
      });

    } catch (err) {
      logger.error('[Suggestion] Error creando:', err.message);
      res.status(500).json({ error: 'Error al guardar la sugerencia' });
    }
  }
);

// ── GET /api/suggestions/mias — sugerencias del usuario ──────
router.get('/mias', requireAuth, async (req, res) => {
  try {
    const sugs = await Suggestion.find({ userId: req.user._id })
      .sort({ createdAt: -1 }).limit(20).lean();
    res.json({ sugerencias: sugs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/suggestions — admin: todas ordenadas por score ──
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { estado, categoria, page = 1 } = req.query;
    const filtro = {};
    if (estado)    filtro.estado    = estado;
    if (categoria) filtro['analisisIA.categoria'] = categoria;

    const limit = 30;
    const skip  = (parseInt(page) - 1) * limit;

    const [sugs, total] = await Promise.all([
      Suggestion.find(filtro)
        .sort({ puntuacion: -1, createdAt: -1 })
        .skip(skip).limit(limit).lean(),
      Suggestion.countDocuments(filtro),
    ]);

    // Stats rápidas
    const stats = await Suggestion.aggregate([
      { $group: { _id: '$estado', count: { $sum: 1 } } }
    ]);

    res.json({ sugerencias: sugs, total, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/suggestions/:id — admin actualiza estado/nota ─
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { estado, notaAdmin } = req.body;
    const update = {};
    if (estado)    update.estado    = estado;
    if (notaAdmin !== undefined) update.notaAdmin = notaAdmin;
    const sug = await Suggestion.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!sug) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true, sugerencia: sug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
