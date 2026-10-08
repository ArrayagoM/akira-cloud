// routes/mobile.routes.js
// API de la app móvil de Akira (Android/iOS): ver el estado de tu PC y del bot, registrar el celular para las
// notificaciones push y mandar comandos mínimos (pausar/reanudar, vacaciones). El bot y los datos NO están
// acá: siguen en la PC. Todo requiere la sesión del usuario (el mismo login de la web y del programa).
'use strict';

const router = require('express').Router();
const Device = require('../models/Device');
const MobileDevice = require('../models/MobileDevice');
const { requireAuth } = require('../middleware/auth');
const comandos = require('../lib/comandos');
const push = require('../services/push.service');
const logger = require('../config/logger');

const MAX_CELULARES = 5;
const misPCs = (userId) => Device.find({ userId, activo: true, revocado: false });

// GET /api/mobile/web-push/clave — clave pública (VAPID) para que la app web pueda pedir avisos. Sin sesión.
router.get('/web-push/clave', (_req, res) => {
  if (!push.webPushDisponible()) return res.status(503).json({ disponible: false });
  res.json({ disponible: true, clave: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/mobile/registrar { pushToken, plataforma, nombre }  ó  { suscripcion, nombre } (app web instalada)
router.post('/registrar', requireAuth, async (req, res) => {
  try {
    const { plataforma = 'otra', nombre = '', suscripcion } = req.body || {};
    let { pushToken } = req.body || {};
    let plat = ['android', 'ios', 'web'].includes(plataforma) ? plataforma : 'otra';
    let sus = null;
    if (suscripcion) {
      if (!push.suscripcionValida(suscripcion)) return res.status(400).json({ error: 'Suscripción de notificaciones inválida' });
      pushToken = suscripcion.endpoint; plat = 'web';
      sus = { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.keys.p256dh, auth: suscripcion.keys.auth } };
    } else if (!push.tokenValido(pushToken)) return res.status(400).json({ error: 'Token de notificaciones inválido' });
    let d = await MobileDevice.findOne({ pushToken });
    if (!d) {
      const cuantos = (await MobileDevice.find({ userId: req.user._id, activo: true })).length;
      if (cuantos >= MAX_CELULARES) return res.status(409).json({ error: `Ya tenés ${MAX_CELULARES} celulares registrados. Quitá alguno desde la app.` });
      d = await MobileDevice.create({ userId: req.user._id, pushToken, plataforma: plat, nombre: String(nombre).slice(0, 60), ...(sus ? { suscripcion: sus } : {}) });
    } else {
      // El token pertenece a quien inició sesión ahora (cambió de cuenta en el mismo celular).
      d.userId = req.user._id; d.plataforma = plat; d.nombre = String(nombre).slice(0, 60) || d.nombre; d.activo = true; d.ultimoUso = new Date(); if (sus) d.suscripcion = sus;
      await d.save();
    }
    res.json({ ok: true });
  } catch (e) { logger.error('[Mobile] registrar: ' + e.message); res.status(500).json({ error: 'No se pudo registrar el celular' }); }
});

// POST /api/mobile/desregistrar { pushToken } — al cerrar sesión en la app
router.post('/desregistrar', requireAuth, async (req, res) => {
  try {
    const d = await MobileDevice.findOne({ pushToken: req.body?.pushToken, userId: req.user._id });
    if (d) { d.activo = false; await d.save(); }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'No se pudo quitar el celular' }); }
});

// GET /api/mobile/estado → estado de cada PC del usuario
router.get('/estado', requireAuth, async (req, res) => {
  try {
    const ahora = new Date();
    const pcs = (await misPCs(req.user._id)).map((d) => comandos.resumirEstado(d, ahora));
    res.json({ pcs, ahora: ahora.toISOString(), usuario: { nombre: req.user.nombre || '', email: req.user.email || '' } });
  } catch (e) { logger.error('[Mobile] estado: ' + e.message); res.status(500).json({ error: 'No se pudo leer el estado' }); }
});

// POST /api/mobile/comandos { deviceId, tipo } — la PC lo retira en ~1 min (si el control remoto está activado)
router.post('/comandos', requireAuth, async (req, res) => {
  try {
    const { deviceId, tipo } = req.body || {};
    const d = await Device.findOne({ userId: req.user._id, deviceId, activo: true, revocado: false });
    if (!d) return res.status(404).json({ error: 'No encontré esa PC' });
    const c = comandos.encolar(d, String(tipo));
    await d.save();
    res.json({ ok: true, comando: { id: c.id, tipo: c.tipo, estado: c.estado, venceEn: c.venceEn } });
  } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo enviar el comando', codigo: e.codigo }); }
});

// GET /api/mobile/comandos/:id?deviceId=... — para que la app vea si la PC ya lo ejecutó
router.get('/comandos/:id', requireAuth, async (req, res) => {
  try {
    const d = await Device.findOne({ userId: req.user._id, deviceId: String(req.query.deviceId), activo: true, revocado: false });
    const c = d && (d.comandos || []).find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Comando no encontrado' });
    comandos.limpiar(d); // marca vencidos
    const actual = d.comandos.find((x) => x.id === req.params.id) || c;
    res.json({ id: actual.id, tipo: actual.tipo, estado: actual.estado });
  } catch { res.status(500).json({ error: 'No se pudo leer el comando' }); }
});

// POST /api/mobile/prueba — manda una notificación de prueba a los celulares del usuario
router.post('/prueba', requireAuth, async (req, res) => {
  try {
    const r = await push.notificarUsuario(req.user._id, { titulo: 'Akira', cuerpo: 'Las notificaciones funcionan: te avisaremos si tu bot se cae.', datos: { tipo: 'prueba' } });
    res.json({ ok: r.enviados > 0, enviados: r.enviados });
  } catch { res.status(500).json({ error: 'No se pudo enviar la prueba' }); }
});

module.exports = router;
