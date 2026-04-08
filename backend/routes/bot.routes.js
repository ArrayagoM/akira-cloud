// routes/bot.routes.js
'use strict';

const router     = require('express').Router();
const botManager = require('../services/bot.manager');
const Log        = require('../models/Log');
const WAAuth     = require('../models/WAAuth');
const Config     = require('../models/Config');
const BotCliente = require('../models/BotCliente');
const Turno      = require('../models/Turno');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── Límites de cuentas por plan ───────────────────────────────
const SLOTS_POR_PLAN = { trial: 1, basico: 1, pro: 1, agencia: 5, admin: 5 };

function getSlot(req) {
  const s = parseInt(req.query.slot ?? req.body?.slot ?? '0');
  return isNaN(s) ? 0 : Math.max(0, Math.min(4, s));
}

// GET /api/bot/accounts — listar cuentas WhatsApp del usuario
router.get('/accounts', async (req, res) => {
  try {
    const uid    = String(req.user._id);
    const maxSlots = SLOTS_POR_PLAN[req.user.plan] || 1;
    const cuentas  = req.user.cuentasWA || [];

    // Combinar con estado en memoria
    const result = Array.from({ length: maxSlots }, (_, slot) => {
      const db     = cuentas.find(c => c.slot === slot) || {};
      const status = botManager.getBotStatus(uid, slot);
      return {
        slot,
        nombre:    db.nombre || (slot === 0 ? 'Principal' : `Cuenta ${slot + 1}`),
        activo:    slot === 0 ? (req.user.botActivo    || status.activo)    : (db.activo    || status.activo),
        conectado: slot === 0 ? (req.user.botConectado || false)            : (db.conectado || false),
        enMemoria: status.activo,
      };
    });

    res.json({ accounts: result, maxSlots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bot/accounts — agregar/nombrar una cuenta (requiere plan Agencia)
router.post('/accounts', async (req, res) => {
  try {
    const uid      = String(req.user._id);
    const maxSlots = SLOTS_POR_PLAN[req.user.plan] || 1;
    const { slot, nombre } = req.body;
    const slotNum  = parseInt(slot);

    if (isNaN(slotNum) || slotNum < 0 || slotNum >= maxSlots) {
      return res.status(400).json({ error: `Tu plan permite hasta ${maxSlots} cuenta(s) (slots 0–${maxSlots - 1})` });
    }

    const User = require('../models/User');
    // Upsert slot en el array
    await User.findOneAndUpdate(
      { _id: uid, 'cuentasWA.slot': slotNum },
      { $set: { 'cuentasWA.$.nombre': nombre || `Cuenta ${slotNum + 1}` } }
    );
    // Si no existía el slot, agregarlo
    await User.findOneAndUpdate(
      { _id: uid, 'cuentasWA.slot': { $ne: slotNum } },
      { $addToSet: { cuentasWA: { slot: slotNum, nombre: nombre || `Cuenta ${slotNum + 1}`, activo: false, conectado: false } } }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bot/accounts/:slot — eliminar una cuenta (detiene el bot primero)
router.delete('/accounts/:slot', async (req, res) => {
  try {
    const uid     = String(req.user._id);
    const slotNum = parseInt(req.params.slot);
    if (slotNum === 0) return res.status(400).json({ error: 'No podés eliminar la cuenta principal (slot 0)' });

    await botManager.stopBot(uid, slotNum).catch(() => {});
    const User = require('../models/User');
    await User.findByIdAndUpdate(uid, { $pull: { cuentasWA: { slot: slotNum } } });
    await WAAuth.deleteMany({ _id: new RegExp(`^${uid}_slot${slotNum}:`) });

    res.json({ ok: true, msg: `Cuenta ${slotNum} eliminada` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bot/status
router.get('/status', async (req, res) => {
  try {
    const slot   = getSlot(req);
    const status = botManager.getBotStatus(req.user._id, slot);
    const cuenta = (req.user.cuentasWA || []).find(c => c.slot === slot) || {};
    res.json({
      slot,
      activo:           slot === 0 ? req.user.botActivo    : (cuenta.activo    || status.activo),
      conectado:        slot === 0 ? req.user.botConectado : (cuenta.conectado || false),
      instanciaEnMemoria: status.activo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bot/start
router.post('/start', async (req, res) => {
  const slot   = getSlot(req);
  const maxSlots = SLOTS_POR_PLAN[req.user.plan] || 1;
  if (slot >= maxSlots) {
    return res.status(403).json({ ok: false, msg: `Tu plan solo permite ${maxSlots} cuenta(s) de WhatsApp` });
  }
  const result = await botManager.startBot(req.user._id, slot);
  res.json(result);
});

// POST /api/bot/stop
router.post('/stop', async (req, res) => {
  const slot   = getSlot(req);
  const result = await botManager.stopBot(req.user._id, slot);
  res.json(result);
});

// POST /api/bot/reset-session — borra la sesión WhatsApp de MongoDB (fuerza QR nuevo)
router.post('/reset-session', async (req, res) => {
  try {
    const uid  = String(req.user._id);
    const slot = getSlot(req);
    await botManager.stopBot(uid, slot).catch(() => {});
    // Borrar sesión del slot correspondiente
    const sessionPrefix = slot === 0 ? `${uid}:` : `${uid}_slot${slot}:`;
    const result = await WAAuth.deleteMany({ _id: new RegExp(`^${sessionPrefix}`) });
    await Log.registrar({ userId: uid, tipo: 'bot_reset', mensaje: `Slot ${slot}: Sesión reiniciada (${result.deletedCount} docs eliminados)` });
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

// GET /api/bot/agenda — turnos/reservas del usuario
router.get('/agenda', async (req, res) => {
  try {
    const uid  = String(req.user._id);
    const path = require('path');
    const fs   = require('fs');

    const dataDir      = path.resolve(__dirname, '../sessions', uid, 'data');
    const reservasPath = path.join(dataDir, '_reservas.json');

    let reservasPendientes = {};
    if (fs.existsSync(reservasPath)) {
      try { reservasPendientes = JSON.parse(fs.readFileSync(reservasPath, 'utf8')); } catch {}
    }

    const [turnosLogs, config, turnos] = await Promise.all([
      Log.find({ userId: req.user._id, tipo: { $in: ['bot_reservation', 'bot_payment'] } })
        .sort({ createdAt: -1 }).limit(100).lean(),
      Config.findOne({ userId: req.user._id }).lean(),
      Turno.find({ userId: req.user._id, estado: { $ne: 'cancelado' } })
        .sort({ fechaInicio: 1 }).lean(),
    ]);

    // Argentina es UTC-3 fijo (sin cambio horario)
    const arISO = (d, part) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(...part === 'date' ? [0, 10] : [11, 16]);

    // Mapear Turnos MongoDB al formato esperado por el frontend
    const confirmadas = turnos.map(t => ({
      nombre:    t.clienteNombre   || 'Sin nombre',
      telefono:  t.clienteTelefono || '',
      email:     t.clienteEmail    || '',
      fecha:     arISO(t.fechaInicio, 'date'),
      hora:      arISO(t.fechaInicio, 'time'),
      horaFin:   arISO(t.fechaFin,   'time'),
      unidad:    t.calendarId !== 'principal' ? t.calendarId : '',
      totalPrecio: t.pago?.monto || 0,
      estado:    t.estado,
      _id:       t._id.toString(),
    }));

    res.json({
      pendientes:          Object.values(reservasPendientes),
      logs:                turnosLogs,
      confirmadas,
      tipoNegocio:         config?.tipoNegocio         || 'turnos',
      unidadesAlojamiento: config?.unidadesAlojamiento || [],
      checkInHora:         config?.checkInHora          || '14:00',
      checkOutHora:        config?.checkOutHora         || '10:00',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper ────────────────────────────────────────────────────
function extraerNum(jid) { return (jid || '').split('@')[0].replace(/\D/g, ''); }

// ─────────────────────────────────────────────────────────────
//  GET /api/bot/clientes — listar todos los chats del bot
// ─────────────────────────────────────────────────────────────
router.get('/clientes', async (req, res) => {
  try {
    const { q, filtro, page = 1 } = req.query;
    const limit = 30;
    const skip  = (Math.max(1, parseInt(page)) - 1) * limit;

    const base = { userId: req.user._id };
    if (q) {
      const re = new RegExp(q.slice(0, 50), 'i');
      base.$or = [{ nombre: re }, { telefono: re }, { numeroReal: re }];
    }
    if (filtro === 'silenciados') base.silenciado = true;
    if (filtro === 'con_turno')   base['turnosConfirmados.0'] = { $exists: true };

    // Chats ignorados (bloqueados) vienen de Config
    const cfg      = await Config.findOne({ userId: req.user._id }, 'chatsIgnorados').lean();
    const ignorados = new Set(cfg?.chatsIgnorados || []);

    if (filtro === 'bloqueados') {
      if (ignorados.size === 0) return res.json({ clientes: [], total: 0 });
      base.jid = { $in: [...ignorados].map(n => `${n}@s.whatsapp.net`) };
    }

    const [clientes, total] = await Promise.all([
      BotCliente.find(base)
        .sort({ updatedAt: -1 })
        .skip(skip).limit(limit)
        .select('-historial')
        .lean(),
      BotCliente.countDocuments(base),
    ]);

    res.json({
      clientes: clientes.map(c => ({ ...c, bloqueado: ignorados.has(extraerNum(c.jid)) })),
      total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/bot/clientes/:jid — silenciar o bloquear un chat
// ─────────────────────────────────────────────────────────────
router.patch('/clientes/:jid', async (req, res) => {
  try {
    const jid = decodeURIComponent(req.params.jid);
    const num = extraerNum(jid);
    const { silenciado, bloqueado } = req.body;

    // Actualizar silenciado en BotCliente
    const dbUpdate = {};
    if (silenciado !== undefined) dbUpdate.silenciado = !!silenciado;

    const cliente = await BotCliente.findOneAndUpdate(
      { userId: req.user._id, jid },
      dbUpdate,
      { new: true, select: '-historial' }
    );
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Notificar al bot para actualizar caché en RAM
    if (silenciado !== undefined) {
      try {
        const { silenciarCliente } = require('../services/bot.manager');
        if (silenciarCliente) silenciarCliente(String(req.user._id), jid, !!silenciado);
      } catch {}
    }

    // Bloquear/desbloquear: actualizar chatsIgnorados en Config
    if (bloqueado !== undefined) {
      const upd = bloqueado
        ? { $addToSet: { chatsIgnorados: num } }
        : { $pull:     { chatsIgnorados: num } };
      await Config.findOneAndUpdate({ userId: req.user._id }, upd, { upsert: true });
      try {
        const bm = require('../services/bot.manager');
        const wh = require('../services/worker.handler');
        if (!bm.recargarConfig(req.user._id) && wh.isWorkerAvailable()) {
          wh.sendToWorker('worker:config-reload', { userId: String(req.user._id) });
        }
      } catch {}
    }

    const cfgFinal = await Config.findOne({ userId: req.user._id }, 'chatsIgnorados').lean();
    const igFinal  = new Set(cfgFinal?.chatsIgnorados || []);

    res.json({ ok: true, cliente: { ...cliente.toObject(), bloqueado: igFinal.has(num) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
