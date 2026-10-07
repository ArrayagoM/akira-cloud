// routes/email-webhook.routes.js
// Recibe los avisos de entrega de Resend (entregado / rebotado / marcado como spam) y los
// refleja en el registro de emails del panel de admin. Solo acepta avisos con firma válida.
// NO se rastrean aperturas ni clics: no se modifica ningún email para espiar al destinatario.
'use strict';

const router = require('express').Router();
const logger = require('../config/logger');
const connectMongo = require('../lib/mongo');
const { verificarFirma, estadoDeEvento } = require('../lib/email-webhook');

router.post('/', async (req, res) => {
  try {
    const secreto = process.env.RESEND_WEBHOOK_SECRET;
    if (!secreto) return res.status(503).json({ error: 'Webhook no configurado' });
    const cuerpo = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const valido = verificarFirma({ cuerpo, id: req.headers['svix-id'], timestamp: req.headers['svix-timestamp'], firma: req.headers['svix-signature'], secreto });
    if (!valido) return res.status(401).json({ error: 'Firma inválida' });

    const evento = JSON.parse(cuerpo);
    const estado = estadoDeEvento(evento.type);
    if (!estado) return res.json({ ok: true, ignorado: true }); // otros eventos (envío, demora…) no se registran

    await connectMongo();
    const EmailLog = require('../models/EmailLog');
    const d = evento.data || {};
    const para = String(Array.isArray(d.to) ? d.to[0] : d.to || '').toLowerCase().trim();
    if (!para) return res.json({ ok: true, ignorado: true });

    // El aviso trae destinatario y asunto: se busca el envío más reciente (últimos 10 días) que coincida.
    const desde = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const log = await EmailLog.findOne({ para, asunto: d.subject, enviadoEn: { $gte: desde }, estado: { $in: ['enviado', 'entregado'] } }).sort({ enviadoEn: -1 });
    if (!log) return res.json({ ok: true, sinRegistro: true });

    log.estado = estado;
    log.eventos.push({ tipo: evento.type, fecha: evento.created_at ? new Date(evento.created_at) : new Date(), detalle: String(d.bounce?.message || d.reason || '').slice(0, 200) });
    await log.save();
    res.json({ ok: true });
  } catch (e) {
    logger.error('[EmailWebhook] ' + e.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
