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
const { registrarMensajeYVerificarCupo, registrarDiaDeUsoTrial } = require('../services/quota.service');
const logger = require('../config/logger');
const MpEvento = require('../models/MpEvento');
const { consumir } = require('../lib/limite');

// Topes del webhook público de Mercado Pago (no lleva firma): sin esto cualquiera podía mandar eventos falsos a nombre de un userId
// y llenar la cola de ese cliente. Valen para todas las instancias (contadores en la base, lib/limite.js).
//  · Por IP: Mercado Pago avisa desde pocas IPs por TODOS los clientes, así que el tope es holgado; frena a quien inunda varios userId desde una IP.
//  · Por userId: un negocio real recibe pocos avisos por minuto (cada pago manda 2-3); frena a quien inunda un solo cliente desde muchas IP.
// Pasado el tope el evento se descarta en silencio (la respuesta es la misma 200) y se avisa UNA vez por ventana en el log.
const TOPE_WEBHOOK_IP = { max: 3000, ventanaMs: 10 * 60e3 }; // MP avisa desde pocas IPs por todos los clientes: el tope fino es por userId (abajo); este solo frena una inundación masiva
const TOPE_WEBHOOK_USUARIO = { max: 100, ventanaMs: 10 * 60e3 };

// POST /api/bot/webhook-mp/:userId — PÚBLICO (lo llama MercadoPago, sin JWT).
// Solo encola el evento; el pago se verifica contra la API de MP en la PC
// del cliente. Respuesta 200 inmediata (requisito de MP).
router.post('/webhook-mp/:userId', async (req, res) => {
  // Se procesa ANTES de responder (en Vercel la función puede congelarse al responder y el evento se perdería); siempre se contesta 200,
  // con o sin evento guardado, para no darle pistas a quien prueba la ruta.
  try {
    const { userId } = req.params;
    const p = req.body;
    if (!/^[a-f0-9]{24}$/i.test(userId)) return;
    if (p?.type !== 'payment' || !p?.data?.id) return;
    const porIp = await consumir(`wh:ip:${req.ip || 'desconocida'}`, TOPE_WEBHOOK_IP);
    if (!porIp.ok) { if (porIp.n === TOPE_WEBHOOK_IP.max + 1) logger.warn('[BotGate] webhook-mp: tope por IP superado, se descartan eventos'); return; }
    const porUsuario = await consumir(`wh:u:${userId.toLowerCase()}`, TOPE_WEBHOOK_USUARIO);
    if (!porUsuario.ok) { if (porUsuario.n === TOPE_WEBHOOK_USUARIO.max + 1) logger.warn(`[BotGate] webhook-mp: tope por usuario superado (${userId}), se descartan eventos`); return; }
    const pendientes = await MpEvento.countDocuments({ userId });
    if (pendientes > 200) return; // tope anti-abuso
    await MpEvento.create({ userId, payload: { type: p.type, action: p.action, data: { id: String(p.data.id) } } });
  } catch (err) {
    logger.error('[BotGate] webhook-mp error: ' + err.message);
  } finally {
    res.sendStatus(200);
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
    if (req.user.plan === 'trial' && planEfectivo(req.user) === 'trial') await registrarDiaDeUsoTrial(req.user._id); // la prueba gasta un día solo si hubo uso
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
