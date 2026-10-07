// routes/licenses.routes.js
// Activación/heartbeat/desactivación de licencias por dispositivo — lo que
// el software de escritorio llama al arrancar y periódicamente mientras
// corre, en vez de sostener un socket persistente (Vercel serverless no
// sostiene conexiones abiertas). Ver Fase 3 del plan de migración.
'use strict';

const router = require('express').Router();
const User = require('../models/User');
const Device = require('../models/Device');
const Log = require('../models/Log');
const { requireAuth } = require('../middleware/auth');
const { featuresDePlan } = require('../config/planes');
const {
  planEfectivo,
  calcularVigencia,
  slotsMaxDePlan,
  dispositivosMaxDePlan,
  generarLicenseToken,
} = require('../services/license.service');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────
//  POST /api/licenses/activate
//  { deviceId, fingerprint, nombre } → { licenseToken, plan, features,
//    slotsMax, expira, vigente }
// ─────────────────────────────────────────────────────────────
router.post('/activate', requireAuth, async (req, res) => {
  try {
    const { deviceId, fingerprint = '', nombre = '', reemplazar = false } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Falta deviceId' });

    const user = req.user;
    const plan = planEfectivo(user);
    const { vigente, expira } = calcularVigencia(user);

    if (!vigente) {
      await Log.registrar({ userId: user._id, tipo: 'security_block', nivel: 'warn', mensaje: `Activacion de licencia rechazada - plan no vigente (deviceId ${deviceId.slice(0, 8)})`, ip: req.ip });
      return res.status(403).json({ error: 'Tu suscripción no está vigente. Renová tu plan para activar el software.', vigente: false });
    }

    let device = await Device.findOne({ userId: user._id, deviceId });

    if (device?.revocado) {
      return res.status(403).json({ error: 'Este equipo fue revocado. Contactá a soporte.', revocado: true });
    }

    if (!device || !device.activo) {
      const maxDispositivos = dispositivosMaxDePlan(plan);
      const activos = await Device.find({ userId: user._id, activo: true, revocado: false }).sort({ ultimoHeartbeat: 1 });
      if (activos.length >= maxDispositivos) {
        if (!reemplazar) {
          return res.status(409).json({
            codigo: 'LIMITE_DISPOSITIVOS',
            error: `Tu plan permite ${maxDispositivos} equipo(s) activo(s) y ya tenés Akira activo en otro.`,
            limiteDispositivos: maxDispositivos,
            dispositivos: activos.map((d) => ({ nombre: d.nombre || 'Otro equipo', ultimoHeartbeat: d.ultimoHeartbeat })),
          });
        }
        // El usuario confirmó el cambio: se desactivan los más viejos hasta dejar lugar.
        const sobran = activos.length - maxDispositivos + 1;
        for (const viejo of activos.slice(0, sobran)) {
          viejo.activo = false;
          await viejo.save();
        }
        await Log.registrar({ userId: user._id, tipo: 'config_update', mensaje: `Equipo reemplazado: se activó ${nombre || deviceId.slice(0, 8)} y se desactivaron ${sobran} anterior(es)`, ip: req.ip });
      }
      if (!device) {
        device = await Device.create({ userId: user._id, deviceId, fingerprint, nombre, activo: true });
        await Log.registrar({ userId: user._id, tipo: 'config_update', mensaje: `Nueva instalación de escritorio activada: ${nombre || deviceId.slice(0, 8)}`, ip: req.ip });
      } else {
        device.activo = true;
      }
    }
    device.fingerprint = fingerprint || device.fingerprint;
    device.nombre = nombre || device.nombre;
    device.ultimoHeartbeat = new Date();
    await device.save();

    const planE = planEfectivo(user);
    const features = featuresDePlan(planE);
    const slotsMax = slotsMaxDePlan(planE);
    const licenseToken = generarLicenseToken({ userId: user._id, deviceId, plan: planE, features, slotsMax });

    res.json({ licenseToken, plan: planE, features, slotsMax, expira, vigente: true });
  } catch (err) {
    logger.error('[Licenses] activate error: ' + err.message);
    res.status(500).json({ error: 'Error al activar la licencia' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/licenses/heartbeat
//  { deviceId } → renueva el licenseToken si la suscripción sigue vigente;
//  403 explícito si venció o el dispositivo fue revocado.
// ─────────────────────────────────────────────────────────────
router.post('/heartbeat', requireAuth, async (req, res) => {
  try {
    const { deviceId, version, resumen, estadoBot, uso } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Falta deviceId' });

    const user = req.user;
    const device = await Device.findOne({ userId: user._id, deviceId });
    if (!device || device.revocado || !device.activo) {
      return res.status(403).json({ error: 'Este equipo ya no está activo en tu cuenta', revocado: true });
    }

    const { vigente, expira } = calcularVigencia(user);
    if (!vigente) {
      return res.status(403).json({ error: 'Suscripción vencida', vigente: false, expira });
    }

    device.ultimoHeartbeat = new Date();
    const { sanearResumen, sanearVersion } = require('../lib/resumen-negocio');
    const ver = sanearVersion(version); if (ver) device.version = ver;
    // resumen === null → el usuario lo desactivó en la app: se borra lo que hubiera en el servidor.
    if (resumen === null) { device.resumen = null; device.resumenEn = null; }
    else if (resumen !== undefined) { const r = sanearResumen(resumen); if (r) { device.resumen = r; device.resumenEn = new Date(); } }
    // Estado del bot → alertas por email si se cayó / volvió. Un fallo acá nunca debe impedir renovar la licencia.
    if (estadoBot !== undefined) {
      try {
        const { procesarEstadoBot } = require('../services/alertas-estado.service');
        await procesarEstadoBot({
          user, device, estadoBot,
          enviar: (m) => require('../services/email.service').enviarEmail(m),
          notificarPush: (p) => require('../services/push.service').notificarUsuario(user._id, p),
        });
      } catch (e) { logger.warn('[Licenses] estado del bot: ' + e.message); }
    }
    // Estadísticas de uso (opcionales, solo si el usuario las activó): contadores de pantallas, nada de datos de sus clientes
    if (uso !== undefined) {
      try { await require('../services/uso.service').guardarUso({ UsoDia: require('../models/UsoDia'), userId: user._id, deviceId, version, datos: uso }); }
      catch (e) { logger.warn('[Licenses] uso: ' + e.message); }
    }
    await device.save();

    const planE = planEfectivo(user);
    const features = featuresDePlan(planE);
    const slotsMax = slotsMaxDePlan(planE);
    const licenseToken = generarLicenseToken({ userId: user._id, deviceId, plan: planE, features, slotsMax });

    res.json({ licenseToken, plan: planE, features, slotsMax, expira, vigente: true });
  } catch (err) {
    logger.error('[Licenses] heartbeat error: ' + err.message);
    res.status(500).json({ error: 'Error al renovar la licencia' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/licenses/comandos
//  { deviceId, celularActivo?, hechos? } — la PC retira los comandos que mandó el celular (pausar/reanudar,
//  vacaciones) y confirma los que ya ejecutó. Solo responde comandos si el usuario activó el control desde
//  el celular en la PC (celularActivo). También sirve de señal de vida.
// ─────────────────────────────────────────────────────────────
router.post('/comandos', requireAuth, async (req, res) => {
  try {
    const { deviceId, celularActivo, hechos } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'Falta deviceId' });
    const device = await Device.findOne({ userId: req.user._id, deviceId });
    if (!device || device.revocado || !device.activo) return res.status(403).json({ error: 'Este equipo ya no está activo en tu cuenta', revocado: true });
    const cm = require('../lib/comandos');
    if (typeof celularActivo === 'boolean') device.celularActivo = celularActivo;
    cm.confirmar(device, hechos);
    const lista = device.celularActivo === true ? cm.pendientes(device) : [];
    device.ultimoHeartbeat = new Date();
    await device.save();
    res.json({ comandos: lista });
  } catch (err) {
    logger.error('[Licenses] comandos error: ' + err.message);
    res.status(500).json({ error: 'Error al consultar comandos' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/licenses/deactivate — libera el cupo de dispositivos
//  (ej. el cliente cambia de PC).
// ─────────────────────────────────────────────────────────────
router.post('/deactivate', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Falta deviceId' });

    const device = await Device.findOne({ userId: req.user._id, deviceId });
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    device.activo = false;
    await device.save();

    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Instalación de escritorio desactivada: ${device.nombre || deviceId.slice(0, 8)}`, ip: req.ip });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[Licenses] deactivate error: ' + err.message);
    res.status(500).json({ error: 'Error al desactivar el dispositivo' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/licenses/mine — lista los dispositivos activos del usuario
//  (para mostrarlos en un panel "mis instalaciones" si hace falta).
// ─────────────────────────────────────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  const devices = await Device.find({ userId: req.user._id, activo: true, revocado: false })
    .select('deviceId nombre activadoEn ultimoHeartbeat version resumen resumenEn estadoBot estadoBotEn')
    .lean();
  res.json({ devices, limite: dispositivosMaxDePlan(planEfectivo(req.user)) });
});

module.exports = router;
