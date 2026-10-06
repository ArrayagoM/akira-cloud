// routes/google.routes.js
// Renueva access tokens de Google Calendar en nombre de la app de escritorio.
// El "client secret" de la aplicación de Google NO puede viajar dentro de un
// programa instalado en la PC de cada cliente (cualquiera podría extraerlo),
// así que la app le manda el refresh_token del propio usuario a este servidor
// y recibe el access token nuevo. El servidor no guarda ningún token.
//
// Exige sesión válida + un equipo activo de ese usuario (igual que /api/sync).
'use strict';

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const Device = require('../models/Device');
const logger = require('../config/logger');

router.use(requireAuth);

router.post('/refresh', async (req, res) => {
  try {
    const deviceId = String(req.headers['x-device-id'] || '');
    const device = deviceId && await Device.findOne({ userId: req.user._id, deviceId, activo: true, revocado: false }).lean();
    if (!device) return res.status(403).json({ error: 'Equipo no activado para esta cuenta' });

    const refreshToken = String(req.body?.refresh_token || '');
    if (!refreshToken || refreshToken.length > 2000) return res.status(400).json({ error: 'Falta refresh_token' });
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ error: 'Google no está configurado en el servidor' });
    }

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      logger.warn(`[Google] refresh falló (${r.status}): ${data.error || 'desconocido'}`);
      return res.status(r.status === 400 ? 400 : 502).json({ error: data.error_description || data.error || 'Google rechazó el token' });
    }
    // Solo lo necesario para el cliente de googleapis; nunca se devuelve ni guarda el client secret.
    res.json({ access_token: data.access_token, expires_in: data.expires_in, scope: data.scope, token_type: data.token_type });
  } catch (err) {
    logger.error('[Google] refresh error: ' + err.message);
    res.status(500).json({ error: 'Error al renovar el token de Google' });
  }
});

module.exports = router;
