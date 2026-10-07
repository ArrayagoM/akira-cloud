// routes/bot-gate.routes.js
// Lo que el bot-engine local llama para (a) saber qué features tiene
// habilitadas y (b) verificar/consumir cupo de mensajes en CADA mensaje
// real entrante — esto es intencionalmente un endpoint aparte del JWT de
// licencia (que es cacheable): el cupo no puede vivir solo en un token que
// el usuario podría congelar/reusar para resetear el contador.
'use strict';

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { featuresDePlan } = require('../config/planes');
const { slotsMaxDePlan, calcularVigencia, planEfectivo } = require('../services/license.service');
const { registrarMensajeYVerificarCupo } = require('../services/quota.service');
const logger = require('../config/logger');
const MpEvento = require('../models/MpEvento');

// POST /api/bot/webhook-mp/:userId — PÚBLICO (lo llama MercadoPago, sin JWT).
// Solo encola el evento; el pago se verifica contra la API de MP en la PC
// del cliente. Respuesta 200 inmediata (requisito de MP).
router.post('/webhook-mp/:userId', async (req, res) => {
  res.sendStatus(200);
  try {
    const { userId } = req.params;
    const p = req.body;
    if (!/^[a-f0-9]{24}$/i.test(userId)) return;
    if (p?.type !== 'payment' || !p?.data?.id) return;
    const pendientes = await MpEvento.countDocuments({ userId });
    if (pendientes > 200) return; // tope anti-abuso
    await MpEvento.create({ userId, payload: { type: p.type, action: p.action, data: { id: String(p.data.id) } } });
  } catch (err) {
    logger.error('[BotGate] webhook-mp error: ' + err.message);
  }
});

// GET /api/bot/features — features + slotsMax del plan actual del usuario
router.get('/features', requireAuth, (req, res) => {
  const { vigente, expira } = calcularVigencia(req.user);
  res.json({
    plan: planEfectivo(req.user),
    features: featuresDePlan(planEfectivo(req.user)),
    slotsMax: slotsMaxDePlan(planEfectivo(req.user)),
    vigente,
    expira,
  });
});

// GET /api/bot/uso — mensajes usados este mes y límite del plan (para mostrarlo en la web).
router.get('/uso', requireAuth, async (req, res) => {
  try {
    const { mesActual } = require('../services/quota.service');
    const User = require('../models/User');
    const u = await User.findById(req.user._id).select('mensajesMes mesContadorMensajes').lean();
    const mes = mesActual();
    const limite = featuresDePlan(planEfectivo(req.user)).mensajesMes;
    res.json({ mes, usados: u?.mesContadorMensajes === mes ? (u.mensajesMes || 0) : 0, limite: Number.isFinite(limite) ? limite : null });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el uso' });
  }
});

// POST /api/bot/quota/check — { } (userId sale del JWT de sesión, no del body,
// para que un dispositivo no pueda reportar cupo a nombre de otro usuario)
router.post('/quota/check', requireAuth, async (req, res) => {
  try {
    const { vigente } = calcularVigencia(req.user);
    if (!vigente) {
      return res.status(403).json({ permitido: false, error: 'Suscripción vencida' });
    }
    const resultado = await registrarMensajeYVerificarCupo(req.user._id, planEfectivo(req.user));
    res.json(resultado);
  } catch (err) {
    logger.error('[BotGate] quota/check error: ' + err.message);
    // Ante un error real de nuestro lado, no cortar el bot del usuario —
    // el mismo criterio que ya usa quota.service.js con el catch silencioso
    // de la escritura del contador.
    res.json({ permitido: true, usados: null, limite: null, degradado: true });
  }
});

module.exports = router;
