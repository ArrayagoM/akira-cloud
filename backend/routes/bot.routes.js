// routes/bot.routes.js
'use strict';

const router     = require('express').Router();
const botManager = require('../services/bot.manager');
const Log        = require('../models/Log');
const WAAuth     = require('../models/WAAuth');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/bot/status
router.get('/status', async (req, res) => {
  try {
    const status = botManager.getBotStatus(req.user._id);
    res.json({
      activo: req.user.botActivo,
      conectado: req.user.botConectado,
      instanciaEnMemoria: status.activo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bot/start
router.post('/start', async (req, res) => {
  const result = await botManager.startBot(req.user._id);
  res.json(result);
});

// POST /api/bot/stop
router.post('/stop', async (req, res) => {
  const result = await botManager.stopBot(req.user._id);
  res.json(result);
});

// POST /api/bot/reset-session — borra la sesión WhatsApp de MongoDB (fuerza QR nuevo)
router.post('/reset-session', async (req, res) => {
  try {
    const uid = String(req.user._id);
    // Detener bot si está activo
    await botManager.stopBot(uid).catch(() => {});
    // Borrar todos los documentos wa_auth del usuario
    const result = await WAAuth.deleteMany({ _id: new RegExp(`^${uid}:`) });
    await Log.registrar({ userId: uid, tipo: 'bot_reset', mensaje: `Sesión WhatsApp reiniciada (${result.deletedCount} docs eliminados)` });
    res.json({ ok: true, msg: 'Sesión eliminada. Iniciá el bot de nuevo para escanear el QR.', deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bot/logs — últimos logs del usuario
router.get('/logs', async (req, res) => {
  try {
    const logs = await Log.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 50)
      .lean();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bot/stats
router.get('/stats', async (req, res) => {
  try {
    const [mensajes, reservas, pagos] = await Promise.all([
      Log.countDocuments({ userId: req.user._id, tipo: { $in: ['bot_message_in','bot_message_out'] } }),
      Log.countDocuments({ userId: req.user._id, tipo: 'bot_reservation' }),
      Log.countDocuments({ userId: req.user._id, tipo: 'bot_payment' }),
    ]);
    res.json({ mensajes, reservas, pagos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
