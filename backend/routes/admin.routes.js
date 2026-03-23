// routes/admin.routes.js
'use strict';

const router     = require('express').Router();
const { body, validationResult } = require('express-validator');
const User       = require('../models/User');
const Log        = require('../models/Log');
const botManager = require('../services/bot.manager');
const { requireAuth, requireAdmin, generarJWT } = require('../middleware/auth');
const logger     = require('../config/logger');

// Todas las rutas requieren auth + admin
router.use(requireAuth, requireAdmin);

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/dashboard
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsuarios,
      activos,
      bloqueados,
      botsActivos,
      erroresHoy,
      registrosHoy,
    ] = await Promise.all([
      User.countDocuments({ rol: 'user' }),
      User.countDocuments({ rol: 'user', status: 'activo' }),
      User.countDocuments({ rol: 'user', status: 'bloqueado' }),
      User.countDocuments({ botActivo: true, botConectado: true }),
      Log.countDocuments({ nivel: 'error', createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } }),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } }),
    ]);

    const activeInMemory = botManager.getActiveCount();

    res.json({
      stats: { totalUsuarios, activos, bloqueados, botsActivos, activeInMemory, erroresHoy, registrosHoy },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/users — listar usuarios con paginación
// ─────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status;
    const plan   = req.query.plan;

    const query = { rol: 'user' };
    if (status) query.status = status;
    if (plan)   query.plan   = plan;
    if (search) {
      query.$or = [
        { nombre:   { $regex: search, $options: 'i' } },
        { apellido: { $regex: search, $options: 'i' } },
        { email:    { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/users/:id — detalle de un usuario
// ─────────────────────────────────────────────────────────────
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const logs = await Log.find({ userId: req.params.id })
      .sort({ createdAt: -1 }).limit(30).lean();

    res.json({ user, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/admin/users/:id — editar usuario
// ─────────────────────────────────────────────────────────────
router.put('/users/:id', [
  body('nombre').optional().trim().notEmpty(),
  body('apellido').optional().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('plan').optional().isIn(['trial','basico','pro','agencia']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const allowed = ['nombre','apellido','email','celular','pais','plan','planExpira'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      mensaje: `Admin editó usuario ${req.params.id}`,
      detalle: updates,
    });

    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/users/:id/block — 🚨 BOTÓN DE PÁNICO
// ─────────────────────────────────────────────────────────────
router.post('/users/:id/block', [
  body('motivo').optional().trim(),
], async (req, res) => {
  try {
    const motivo = req.body.motivo || 'Bloqueado por administrador';
    const result = await botManager.panicStop(req.params.id, motivo);

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      nivel: 'critical',
      mensaje: `Admin bloqueó usuario ${req.params.id}: ${motivo}`,
    });

    logger.warn(`[Admin] 🚨 Usuario ${req.params.id} bloqueado por ${req.user.email}: ${motivo}`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/users/:id/unblock — desbloquear usuario
// ─────────────────────────────────────────────────────────────
router.post('/users/:id/unblock', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      status: 'activo',
      bloqueadoPor: null,
    });

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      mensaje: `Admin desbloqueó usuario ${req.params.id}`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/users/:id/password — cambiar contraseña
// ─────────────────────────────────────────────────────────────
router.post('/users/:id/password', [
  body('nuevaPassword').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    user.password = req.body.nuevaPassword;
    await user.save();

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      nivel: 'warn',
      mensaje: `Admin cambió contraseña de usuario ${req.params.id}`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/bots/:id/stop — detener bot específico
// ─────────────────────────────────────────────────────────────
router.post('/bots/:id/stop', async (req, res) => {
  try {
    const result = await botManager.stopBot(req.params.id);
    await Log.registrar({ userId: req.user._id, tipo: 'admin_action', mensaje: `Admin detuvo bot de ${req.params.id}` });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/logs — logs globales del sistema
// ─────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page) || 1);
    const limit   = Math.min(100, parseInt(req.query.limit) || 50);
    const nivel   = req.query.nivel;
    const tipo    = req.query.tipo;
    const userId  = req.query.userId;

    const query = {};
    if (nivel)  query.nivel  = nivel;
    if (tipo)   query.tipo   = tipo;
    if (userId) query.userId = userId;

    const [logs, total] = await Promise.all([
      Log.find(query)
        .populate('userId', 'nombre email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Log.countDocuments(query),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/bots/active — bots activos en memoria
// ─────────────────────────────────────────────────────────────
router.get('/bots/active', async (req, res) => {
  try {
    const ids = botManager.getActiveUserIds();
    const users = ids.length > 0
      ? await User.find({ _id: { $in: ids } }).select('nombre email botActivo botConectado').lean()
      : [];
    res.json({ count: ids.length, bots: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
