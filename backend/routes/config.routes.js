// routes/config.routes.js
'use strict';

const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Config = require('../models/Config');
const Log    = require('../models/Log');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

// Todas las rutas requieren auth
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
//  GET /api/config — obtener config del usuario (sin keys)
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let config = await Config.findOne({ userId: req.user._id });
    if (!config) {
      config = await Config.create({ userId: req.user._id });
    }
    res.json({
      config: config.toJSON(),
      keys:   config.resumenKeys(), // solo indica qué keys están cargadas
    });
  } catch (err) {
    logger.error('[Config] GET error:', err.message);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/negocio — actualizar datos del negocio
// ─────────────────────────────────────────────────────────────
router.put('/negocio', [
  body('miNombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('negocio').trim().notEmpty().withMessage('El nombre del negocio es obligatorio'),
  body('servicios').trim().optional(),
  body('precioTurno').isFloat({ min: 0 }).withMessage('El precio debe ser un número positivo'),
  body('horasCancelacion').isInt({ min: 0 }).withMessage('Las horas deben ser un número positivo'),
  body('promptPersonalizado').optional().isLength({ max: 2000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { miNombre, negocio, servicios, precioTurno, horasCancelacion, promptPersonalizado, dominioNgrok, mpWebhookUrl } = req.body;

    const config = await Config.findOneAndUpdate(
      { userId: req.user._id },
      {
        miNombre:    miNombre.trim(),
        negocio:     negocio.trim(),
        servicios:   servicios?.trim() || 'turnos y reservas',
        precioTurno: parseFloat(precioTurno),
        horasCancelacion: parseInt(horasCancelacion),
        promptPersonalizado: (promptPersonalizado || '').trim(),
        dominioNgrok: (dominioNgrok || '').trim(),
        mpWebhookUrl: (mpWebhookUrl || '').trim(),
        configurado: true,
      },
      { upsert: true, new: true }
    );

    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: 'Datos del negocio actualizados' });
    res.json({ config: config.toJSON(), keys: config.resumenKeys() });

  } catch (err) {
    logger.error('[Config] PUT negocio error:', err.message);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/keys — actualizar API Keys (cifradas)
// ─────────────────────────────────────────────────────────────
router.put('/keys', [
  body('campo').isIn(['keyGroq','keyMP','idCalendar','keyRime','keyNgrok','credentialsGoogleB64'])
    .withMessage('Campo inválido'),
  body('valor').notEmpty().withMessage('El valor no puede estar vacío'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { campo, valor } = req.body;

    let config = await Config.findOne({ userId: req.user._id });
    if (!config) config = new Config({ userId: req.user._id });

    // Cifrar y guardar
    config.setKey(campo, valor.trim());
    await config.save();

    await Log.registrar({
      userId: req.user._id,
      tipo: 'config_update',
      mensaje: `Key '${campo}' actualizada`,
    });

    logger.info(`[Config] Key '${campo}' actualizada para user ${req.user._id}`);
    res.json({ ok: true, keys: config.resumenKeys() });

  } catch (err) {
    logger.error('[Config] PUT keys error:', err.message);
    res.status(500).json({ error: 'Error al guardar la key' });
  }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/config/keys/:campo — eliminar una key
// ─────────────────────────────────────────────────────────────
router.delete('/keys/:campo', async (req, res) => {
  const campos = ['keyGroq','keyMP','idCalendar','keyRime','keyNgrok','credentialsGoogleB64'];
  if (!campos.includes(req.params.campo)) {
    return res.status(400).json({ error: 'Campo inválido' });
  }

  try {
    const config = await Config.findOne({ userId: req.user._id });
    if (!config) return res.status(404).json({ error: 'Configuración no encontrada' });

    config.setKey(req.params.campo, null);
    await config.save();

    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Key '${req.params.campo}' eliminada` });
    res.json({ ok: true, keys: config.resumenKeys() });

  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la key' });
  }
});

module.exports = router;
