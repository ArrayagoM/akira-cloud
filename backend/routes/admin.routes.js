// routes/admin.routes.js
'use strict';

const router     = require('express').Router();
const { body, validationResult } = require('express-validator');
const User       = require('../models/User');
const Log        = require('../models/Log');
const Referido   = require('../models/Referido');
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
    const hace24h = new Date(Date.now() - 24*60*60*1000);
    const [
      totalUsuarios,
      activos,
      bloqueados,
      botsActivosDB,
      botsConectadosDB,
      erroresHoy,
      warningsHoy,
      registrosHoy,
      desconexionesHoy,
    ] = await Promise.all([
      User.countDocuments({ rol: 'user' }),
      User.countDocuments({ rol: 'user', status: 'activo' }),
      User.countDocuments({ rol: 'user', status: 'bloqueado' }),
      User.countDocuments({ botActivo: true, status: 'activo' }),
      User.countDocuments({ botActivo: true, botConectado: true, status: 'activo' }),
      Log.countDocuments({ nivel: 'error', createdAt: { $gte: hace24h } }),
      Log.countDocuments({ nivel: 'warn', createdAt: { $gte: hace24h } }),
      User.countDocuments({ createdAt: { $gte: hace24h } }),
      Log.countDocuments({ tipo: 'bot_disconnected', createdAt: { $gte: hace24h } }),
    ]);

    const activeInMemory  = botManager.getActiveCount();
    // Discrepancias: DB dice botActivo pero no están en RAM
    const keysEnRAM       = botManager.getActiveUserIds();
    const idsEnRAM        = new Set(keysEnRAM.map(k => k.split(':')[0]));
    const discrepancias   = Math.max(0, botsActivosDB - idsEnRAM.size);

    res.json({
      stats: {
        totalUsuarios,
        activos,
        bloqueados,
        botsActivos:     activeInMemory,      // bots realmente corriendo en RAM
        botsConectadosDB,                      // bots con sesión WA confirmada en DB
        botsActivosDB,                         // bots que "deberían" estar corriendo según DB
        discrepancias,                         // diferencia DB vs RAM (bots caídos sin reiniciar)
        activeInMemory,
        erroresHoy,
        warningsHoy,
        registrosHoy,
        desconexionesHoy,
      },
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
  body('plan').optional().isIn(['trial','basico','pro','agencia','admin']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const allowed = ['nombre','apellido','email','celular','pais','plan','planPeriodo','planExpira'];
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
//  POST /api/admin/users/:id/activar-plan — activar/cambiar plan manualmente
// ─────────────────────────────────────────────────────────────
router.post('/users/:id/activar-plan', [
  body('plan').isIn(['trial','basico','pro','agencia','admin']).withMessage('Plan inválido'),
  body('meses').optional().isInt({ min: 1, max: 24 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { plan, meses = 1, periodo = 'mensual' } = req.body;

    const expira = new Date();
    if (plan === 'trial') {
      expira.setDate(expira.getDate() + (meses * 30));
    } else {
      expira.setMonth(expira.getMonth() + parseInt(meses));
    }

    const updates = {
      plan,
      planPeriodo: plan === 'trial' ? null : periodo,
      status: 'activo',
    };
    if (plan === 'trial') {
      updates.trialExpira = expira;
    } else {
      updates.planExpira = expira;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      nivel: 'info',
      mensaje: `Admin activó plan ${plan} (${meses} mes/es) para ${user.email} — expira ${expira.toLocaleDateString('es-AR')}`,
    });

    logger.info(`[Admin] ✅ Plan ${plan} activado para ${user.email} por admin ${req.user.email} — expira ${expira.toLocaleDateString('es-AR')}`);

    // Notificar al usuario por Socket.io si está conectado
    if (global.io) {
      global.io.to(`user:${req.params.id}`).emit('suscripcion:activada', {
        plan, planBase: plan, expira,
        mensaje: `¡Plan ${plan} activado!`,
      });
    }

    res.json({ ok: true, user: user.toJSON(), expira });
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
//  POST /api/admin/bots/healthcheck — forzar healthcheck global
//  IMPORTANTE: debe ir ANTES de /bots/:id/* para que Express no confunda "healthcheck" con un :id
// ─────────────────────────────────────────────────────────────
router.post('/bots/healthcheck', async (req, res) => {
  try {
    await botManager.ejecutarHealthcheck();
    await Log.registrar({ userId: req.user._id, tipo: 'bot_healthcheck', nivel: 'info', mensaje: `Admin forzó healthcheck global de bots` });
    res.json({ ok: true, ts: new Date().toISOString() });
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
    await Log.registrar({ userId: req.params.id, tipo: 'bot_stop', nivel: 'warn', mensaje: `Admin detuvo bot manualmente (admin: ${req.user.email})` });
    await Log.registrar({ userId: req.user._id, tipo: 'admin_action', mensaje: `Admin detuvo bot de ${req.params.id}` });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/bots/:id/restart — reiniciar bot específico
// ─────────────────────────────────────────────────────────────
router.post('/bots/:id/restart', async (req, res) => {
  try {
    const uid = req.params.id;
    // Detener primero (si está corriendo)
    await botManager.stopBot(uid).catch(() => {});
    // Pequeño delay para que Baileys cierre el socket limpiamente
    await new Promise(r => setTimeout(r, 2000));
    const result = await botManager.startBot(uid, 0);
    await Log.registrar({ userId: uid, tipo: 'bot_autostart', nivel: 'info', mensaje: `Admin reinició bot manualmente (admin: ${req.user.email})` });
    await Log.registrar({ userId: req.user._id, tipo: 'admin_action', mensaje: `Admin reinició bot de ${uid}` });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/users/:id/promote — promover a admin
// ─────────────────────────────────────────────────────────────
router.post('/users/:id/promote', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { rol: 'admin', plan: 'admin', status: 'activo', bloqueadoPor: null },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      nivel: 'warn',
      mensaje: `Admin promovió a ${req.params.id} (${user.email}) a rol admin`,
    });

    res.json({ ok: true, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/promote-self — promover tu propio usuario a admin
//  Solo disponible en development para setup inicial
// ─────────────────────────────────────────────────────────────
router.post('/promote-self', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { rol: 'admin', plan: 'admin', status: 'activo' },
      { new: true }
    );
    res.json({ ok: true, msg: `Promovido a admin: ${user.email}`, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/users/:id/tester — toggle modo tester
// ─────────────────────────────────────────────────────────────
router.post('/users/:id/tester', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    user.esTester = !user.esTester;
    await user.save();

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      nivel: 'info',
      mensaje: `Admin ${user.esTester ? 'activó' : 'desactivó'} modo tester para ${user.email}`,
    });

    logger.info(`[Admin] Tester ${user.esTester ? 'ON' : 'OFF'} para ${user.email} por ${req.user.email}`);

    // Notificar al usuario si está conectado
    if (global.io && user.esTester) {
      global.io.to(`user:${req.params.id}`).emit('suscripcion:activada', {
        plan: 'tester', planBase: 'tester',
        mensaje: '¡Acceso tester activado por el administrador!',
      });
    }

    res.json({ ok: true, esTester: user.esTester });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/referidos — listar todos los referidos
// ─────────────────────────────────────────────────────────────
router.get('/referidos', async (req, res) => {
  try {
    const referidos = await Referido.find()
      .populate('referente', 'nombre email creditoReferidos')
      .populate('referido',  'nombre email plan')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const totalPendiente = referidos
      .filter(r => !r.comisionPagada && r.estado !== 'pendiente')
      .reduce((a, r) => a + (r.comisionPendiente || 0), 0);

    res.json({ referidos, total: referidos.length, totalPendiente });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/admin/referidos/:id/pagar — marcar comisión como pagada
// ─────────────────────────────────────────────────────────────
router.post('/referidos/:id/pagar', async (req, res) => {
  try {
    const ref = await Referido.findById(req.params.id);
    if (!ref) return res.status(404).json({ error: 'Referido no encontrado' });
    if (ref.comisionPagada) return res.status(400).json({ error: 'La comisión ya fue pagada' });

    ref.comisionPagada = true;
    ref.estado = 'pagado';
    await ref.save();

    // Descontar del crédito del referente (ya fue acreditado)
    await User.findByIdAndUpdate(ref.referente, {
      $inc: { creditoReferidos: -(ref.comisionPendiente || 0) },
    });

    await Log.registrar({
      userId: req.user._id,
      tipo: 'admin_action',
      nivel: 'info',
      mensaje: `Admin marcó comisión de referido ${req.params.id} como pagada ($${ref.comisionPendiente})`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/users/:id/bot-diagnostic — diagnóstico completo del bot de un usuario
// ─────────────────────────────────────────────────────────────
router.get('/users/:id/bot-diagnostic', async (req, res) => {
  try {
    const uid = req.params.id;

    const WAAuth     = require('../models/WAAuth');
    const BotCliente = require('../models/BotCliente');
    const Config     = require('../models/Config');

    const [
      waAuthDocs,
      clientesTotal,
      clientesSilenciados,
      configDoc,
      ultimosLogs,
      user,
    ] = await Promise.all([
      WAAuth.find({ _id: { $regex: `^${uid}:` } }).select('_id').lean(),
      BotCliente.countDocuments({ userId: uid }),
      BotCliente.countDocuments({ userId: uid, silenciado: true }),
      Config.findOne({ userId: uid }).select('keyGroq miNombre negocio').lean(),
      Log.find({ userId: uid }).sort({ createdAt: -1 }).limit(15).lean(),
      User.findById(uid).select('nombre email botActivo botConectado plan status esTester').lean(),
    ]);

    const keysEnRAM = botManager.getActiveUserIds();
    const enRAM     = keysEnRAM.some(k => k.split(':')[0] === uid);
    const qrData    = botManager.getQRPendiente(uid);

    const tieneWAAuth  = waAuthDocs.length > 0;
    const tieneConfig  = !!configDoc;
    const tieneGroq    = !!(configDoc?.keyGroq?.encrypted);
    const esperandoQR  = !!qrData;

    // Determinar causa probable de fallo
    let causaProbable = null;
    if (esperandoQR)           causaProbable = '⚡ QR listo — el usuario debe escanearlo desde su panel ahora (expira en 60s)';
    else if (!tieneWAAuth)     causaProbable = 'Sin sesión WhatsApp — necesita iniciar el bot y escanear el QR desde su panel';
    else if (!tieneGroq)       causaProbable = 'Sin clave Groq — el bot no puede responder con IA';
    else if (!enRAM && user?.botActivo) causaProbable = 'Bot caído — no está en memoria RAM (usá Reiniciar)';
    else if (clientesSilenciados > 0) causaProbable = `${clientesSilenciados} cliente(s) silenciado(s) — bot no les responde`;

    res.json({
      user,
      enRAM,
      tieneWAAuth,
      waAuthDocCount: waAuthDocs.length,
      tieneConfig,
      tieneGroq,
      clientesTotal,
      clientesSilenciados,
      causaProbable,
      esperandoQR,
      qr: qrData?.qr || null, // QR base64 si está pendiente (el admin puede mostrárselo al usuario)
      ultimosLogs,
    });
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
    const limit   = Math.min(200, parseInt(req.query.limit) || 50);
    const nivel   = req.query.nivel;   // error|warn|info|critical
    const tipo    = req.query.tipo;    // bot_start|bot_disconnected|etc
    const userId  = req.query.userId;
    const desde   = req.query.desde;   // ISO date — filtrar desde esta fecha
    const buscar  = req.query.buscar;  // búsqueda libre en mensaje

    const query = {};
    if (nivel)  query.nivel  = nivel;
    if (tipo)   query.tipo   = tipo;
    if (userId) query.userId = userId;
    if (desde)  query.createdAt = { $gte: new Date(desde) };
    if (buscar) query.mensaje = { $regex: buscar, $options: 'i' };

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
//  GET /api/admin/bots/active — estado completo de todos los bots
//  Cruza DB (botActivo=true) con RAM (instancias activas) para detectar discrepancias
// ─────────────────────────────────────────────────────────────
router.get('/bots/active', async (req, res) => {
  try {
    // IDs activos en RAM (instancias corriendo ahora mismo)
    const keysEnRAM = botManager.getActiveUserIds(); // formato "userId:slot"
    const idsEnRAM  = new Set(keysEnRAM.map(k => k.split(':')[0]));

    // Usuarios con botActivo=true en DB
    const usersDB = await User.find({ botActivo: true, status: 'activo' })
      .select('nombre email botActivo botConectado plan planExpira esTester createdAt')
      .lean();

    // Usuarios en RAM pero sin botActivo en DB (edge case)
    const idsEnDBSet = new Set(usersDB.map(u => u._id.toString()));
    const enRAMnoEnDB = [...idsEnRAM].filter(id => !idsEnDBSet.has(id));

    // Construir lista enriquecida
    const bots = usersDB.map(u => {
      const uid         = u._id.toString();
      const enRAM       = idsEnRAM.has(uid);
      const discrepancia = u.botActivo && !enRAM; // DB dice activo pero no está en RAM
      return {
        ...u,
        enRAM,
        discrepancia,
        estado: enRAM ? (u.botConectado ? 'conectado' : 'iniciando') : 'caido',
      };
    });

    // Agregar los raros que están en RAM pero no en DB
    for (const uid of enRAMnoEnDB) {
      bots.push({ _id: uid, nombre: '(sin datos)', email: uid, enRAM: true, discrepancia: false, estado: 'conectado', botActivo: true, botConectado: true });
    }

    const caidos       = bots.filter(b => b.discrepancia).length;
    const conectados   = bots.filter(b => b.estado === 'conectado').length;
    const iniciando    = bots.filter(b => b.estado === 'iniciando').length;

    res.json({ count: bots.length, conectados, iniciando, caidos, bots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
