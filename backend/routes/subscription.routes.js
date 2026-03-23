// routes/subscription.routes.js
// Maneja suscripciones de la plataforma con MercadoPago Preapproval
'use strict';

const router  = require('express').Router();
const https   = require('https');
const crypto  = require('crypto');
const User    = require('../models/User');
const Log     = require('../models/Log');
const { requireAuth } = require('../middleware/auth');
const logger  = require('../config/logger');

// ── Configuración de planes ──────────────────────────────────
const PLANES = {
  basico: {
    nombre:      'Plan Básico',
    precio:      15,
    moneda:      'ARS',
    frecuencia:  1,
    tipo:        'months',
    descripcion: 'Akira Cloud Plan Básico — 1 número WhatsApp, hasta 500 mensajes/mes',
  },
  pro: {
    nombre:      'Plan Pro',
    precio:      35,
    moneda:      'ARS',
    frecuencia:  1,
    tipo:        'months',
    descripcion: 'Akira Cloud Plan Pro — Mensajes ilimitados + Calendar + MercadoPago',
  },
  agencia: {
    nombre:      'Plan Agencia',
    precio:      80,
    moneda:      'ARS',
    frecuencia:  1,
    tipo:        'months',
    descripcion: 'Akira Cloud Plan Agencia — Hasta 5 números WhatsApp + panel multi-cliente',
  },
};

// ── Helper: llamada a la API de MP ───────────────────────────
function mpRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.mercadopago.com',
      path,
      method,
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || parsed.error || `MP error ${res.statusCode}`);
            err.status = res.statusCode;
            err.mpResponse = parsed;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Error parseando respuesta de MP: ' + data.slice(0, 100)));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
//  GET /api/subscriptions/planes — info pública de planes
// ─────────────────────────────────────────────────────────────
router.get('/planes', (_req, res) => {
  res.json({ planes: PLANES });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/subscriptions/checkout — generar link de pago
// ─────────────────────────────────────────────────────────────
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!PLANES[plan]) {
      return res.status(400).json({ error: 'Plan inválido. Opciones: basico, pro, agencia' });
    }

    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Pagos no configurados aún. Contactá al administrador.' });
    }

    const planInfo  = PLANES[plan];
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl  = process.env.BACKEND_URL  || 'http://localhost:5000';

    // Crear preferencia de pago (checkout pro para suscripciones)
    const preferencia = await mpRequest('/preapproval', 'POST', {
      preapproval_plan_id: undefined,          // sin plan maestro
      reason:              planInfo.descripcion,
      external_reference:  `${req.user._id}|${plan}`,
      payer_email:         req.user.email,
      auto_recurring: {
        frequency:       planInfo.frecuencia,
        frequency_type:  planInfo.tipo,
        transaction_amount: planInfo.precio,
        currency_id:     planInfo.moneda,
      },
      back_url:            `${frontendUrl}/dashboard?suscripcion=ok`,
      notification_url:    `${backendUrl}/api/subscriptions/webhook`,
      status:              'pending',
    });

    logger.info(`[SUB] Checkout generado para ${req.user.email} — plan: ${plan}`);

    await Log.registrar({
      userId:  req.user._id,
      tipo:    'config_update',
      mensaje: `Checkout de suscripción iniciado — plan: ${plan}`,
    });

    res.json({
      ok:       true,
      init_point: preferencia.init_point,
      plan,
      precio:   planInfo.precio,
    });

  } catch (err) {
    logger.error('[SUB] Error generando checkout:', err.message, err.mpResponse || '');
    res.status(500).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Error al generar el pago. Intentá de nuevo.'
        : err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/subscriptions/mi-suscripcion — estado actual
// ─────────────────────────────────────────────────────────────
router.get('/mi-suscripcion', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    res.json({
      plan:         user.plan,
      status:       user.status,
      trialExpira:  user.trialExpira,
      planExpira:   user.planExpira,
      planVigente:  user.plan === 'trial'
        ? new Date(user.trialExpira) > new Date()
        : user.planExpira ? new Date(user.planExpira) > new Date() : false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/subscriptions/webhook — notificaciones de MP
// ─────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {

  // Verificar firma si está configurada
  if (process.env.MP_WEBHOOK_SECRET) {
    try {
      const xSig    = req.headers['x-signature'] || '';
      const xReqId  = req.headers['x-request-id'] || '';
      const dataId  = req.query?.['data.id'] || req.body?.data?.id || '';
      const partes  = Object.fromEntries(xSig.split(',').map(p => p.split('=')));
      const ts      = partes['ts'] || '';
      const v1Rec   = partes['v1'] || '';

      if (v1Rec) {
        const manifest   = `id:${dataId};request-id:${xReqId};ts:${ts};`;
        const v1Calc     = crypto
          .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
          .update(manifest).digest('hex');

        if (v1Calc.length === v1Rec.length &&
            !crypto.timingSafeEqual(Buffer.from(v1Calc), Buffer.from(v1Rec))) {
          logger.warn('[SUB Webhook] Firma inválida');
          return res.sendStatus(401);
        }
      }
    } catch (e) {
      logger.warn('[SUB Webhook] Error verificando firma:', e.message);
    }
  }

  // MP requiere 200 rápido
  res.sendStatus(200);

  const payload = req.body;
  logger.info('[SUB Webhook] Recibido:', JSON.stringify(payload));

  // Solo procesar eventos de suscripción
  const tipo = payload.type;
  if (!['subscription_preapproval', 'payment'].includes(tipo)) return;

  try {
    const dataId = payload.data?.id;
    if (!dataId) return;

    // ── Evento de suscripción ──────────────────────────────
    if (tipo === 'subscription_preapproval') {
      const sub = await mpRequest(`/preapproval/${dataId}`);
      logger.info(`[SUB Webhook] Suscripción ${sub.id} — status: ${sub.status}`);

      const [userId, plan] = (sub.external_reference || '').split('|');
      if (!userId || !plan) return;

      if (sub.status === 'authorized') {
        // Suscripción activa — actualizar plan
        const expira = new Date();
        expira.setMonth(expira.getMonth() + 1);

        await User.findByIdAndUpdate(userId, {
          plan,
          planExpira:    expira,
          status:        'activo',
        });

        await Log.registrar({
          userId,
          tipo:    'bot_payment',
          nivel:   'info',
          mensaje: `Suscripción ${plan} activada — MP ID: ${sub.id}`,
        });

        logger.info(`[SUB] ✅ Plan ${plan} activado para user ${userId}`);

        // Notificar al usuario vía Socket.io
        if (global.io) {
          global.io.to(`user:${userId}`).emit('suscripcion:activada', { plan, expira });
        }
      }

      if (sub.status === 'cancelled' || sub.status === 'paused') {
        await User.findByIdAndUpdate(userId, { plan: 'trial' });
        logger.info(`[SUB] Plan cancelado para user ${userId}`);
        if (global.io) {
          global.io.to(`user:${userId}`).emit('suscripcion:cancelada', {});
        }
      }
    }

    // ── Evento de pago individual ──────────────────────────
    if (tipo === 'payment') {
      const pago = await mpRequest(`/v1/payments/${dataId}`);
      logger.info(`[SUB Webhook] Pago ${pago.id} — status: ${pago.status}`);

      if (pago.status === 'approved') {
        const [userId, plan] = (pago.external_reference || '').split('|');
        if (!userId || !plan || !PLANES[plan]) return;

        const expira = new Date();
        expira.setMonth(expira.getMonth() + 1);

        await User.findByIdAndUpdate(userId, {
          plan,
          planExpira: expira,
          status:     'activo',
        });

        await Log.registrar({
          userId,
          tipo:    'bot_payment',
          nivel:   'info',
          mensaje: `Pago aprobado — plan: ${plan} — MP ID: ${pago.id}`,
        });

        if (global.io) {
          global.io.to(`user:${userId}`).emit('suscripcion:activada', { plan, expira });
        }

        logger.info(`[SUB] ✅ Pago aprobado — plan ${plan} para user ${userId}`);
      }
    }

  } catch (err) {
    logger.error('[SUB Webhook] Error procesando notificación:', err.message);
  }
});

module.exports = router;
