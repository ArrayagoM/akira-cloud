// routes/config.routes.js
'use strict';

const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const jwt    = require('jsonwebtoken');
const { google } = require('googleapis');
const Config = require('../models/Config');
const Log    = require('../models/Log');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────
//  Helpers OAuth Google Calendar
// ─────────────────────────────────────────────────────────────
function crearOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BACKEND_URL}/api/config/google/callback`
  );
}

// ─────────────────────────────────────────────────────────────
//  GET /api/config/google/connect — inicia OAuth de Calendar
//  No requiere auth header (viene desde window.location.href)
//  Verifica el JWT desde ?token=...
// ─────────────────────────────────────────────────────────────
router.get('/google/connect', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(401).json({ error: 'No auth token' });

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google OAuth no configurado en el servidor' });
  }

  const oauth2Client = crearOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state: token,   // pasamos el JWT como state para identificar al usuario en el callback
    prompt: 'consent',
  });
  res.redirect(url);
});

// ─────────────────────────────────────────────────────────────
//  GET /api/config/google/callback — callback de OAuth Calendar
// ─────────────────────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, state: userToken, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || '';
  const redirectUri = `${process.env.BACKEND_URL}/api/config/google/callback`;

  if (error || !code || !userToken) {
    const reason = error || 'missing_params';
    logger.warn(`[Config] Google OAuth callback — error: ${reason}`);
    return res.redirect(`${frontendUrl}/config?calendar=error&reason=${encodeURIComponent(reason)}`);
  }

  try {
    const payload = jwt.verify(userToken, process.env.JWT_SECRET);
    const userId  = payload.id;

    const oauth2Client = crearOAuth2Client();
    logger.info(`[Config] Google OAuth usando redirect_uri: ${redirectUri}`);

    const { tokens }   = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Obtener email del usuario de Google
    const oauth2       = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data }     = await oauth2.userinfo.get();

    // Guardar tokens cifrados
    let config = await Config.findOne({ userId });
    if (!config) config = new Config({ userId });
    config.setKey('googleCalendarTokens', JSON.stringify(tokens));
    config.googleEmail = data.email || '';
    await config.save();

    // Notificar al bot para que recargue los tokens sin reiniciarse
    try {
      const botManager    = require('../services/bot.manager');
      const workerHandler = require('../services/worker.handler');
      if (!botManager.recargarCalendar(userId) && workerHandler.isWorkerAvailable()) {
        workerHandler.sendToWorker('worker:calendar-reload', { userId: String(userId) });
      }
    } catch (e) { logger.warn('[Config] recargarCalendar: ' + e.message); }

    await Log.registrar({ userId, tipo: 'config_update', mensaje: `Google Calendar conectado (${data.email})` });
    logger.info(`[Config] Google Calendar OAuth OK para user ${userId} — ${data.email}`);
    res.redirect(`${frontendUrl}/config?calendar=ok`);

  } catch (err) {
    // Detectar el tipo de error para dar mejor feedback al frontend
    const msg = err.message || '';
    let reason = 'unknown';
    if (msg.includes('redirect_uri_mismatch')) reason = 'redirect_uri_mismatch';
    else if (msg.includes('invalid_client'))   reason = 'invalid_client';
    else if (msg.includes('invalid_grant'))    reason = 'invalid_grant';
    else if (msg.includes('access_denied'))    reason = 'access_denied';
    else if (msg.includes('expired'))          reason = 'token_expired';
    else if (msg.includes('invalid signature') || msg.includes('jwt'))  reason = 'jwt_error';
    else if (msg.includes('ENCRYPTION') || msg.includes('CRITICO'))     reason = 'encryption_error';
    else if (msg.includes('ECONNREFUSED') || msg.includes('network'))   reason = 'network_error';

    logger.error(`[Config] Google OAuth callback error (${reason}): ${msg}`);
    logger.error(`[Config] Stack: ${err.stack}`);
    logger.error(`[Config] redirect_uri usado: ${redirectUri}`);

    // Pasar mensaje de debug (primeros 120 chars) para diagnosticar desde frontend
    const debugMsg = msg.slice(0, 120).replace(/[^a-zA-Z0-9 :._\-\[\]]/g, '');
    res.redirect(`${process.env.FRONTEND_URL || ''}/config?calendar=error&reason=${encodeURIComponent(reason)}&redirect_uri=${encodeURIComponent(redirectUri)}&debug=${encodeURIComponent(debugMsg)}`);
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/config/google/check — diagnóstico de configuración OAuth
// ─────────────────────────────────────────────────────────────
router.get('/google/check', (req, res) => {
  const redirectUri = `${process.env.BACKEND_URL}/api/config/google/callback`;
  res.json({
    configurado:  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    backend_url:  process.env.BACKEND_URL || '(no configurado)',
    frontend_url: process.env.FRONTEND_URL || '(no configurado)',
    client_id_ok: !!process.env.GOOGLE_CLIENT_ID,
    client_secret_ok: !!process.env.GOOGLE_CLIENT_SECRET,
  });
});

// ─────────────────────────────────────────────────────────────
//  Helper: notificar al bot activo que recargue config en caliente
// ─────────────────────────────────────────────────────────────
function _notificarRecargarConfig(userId) {
  try {
    const botManager    = require('../services/bot.manager');
    const workerHandler = require('../services/worker.handler');
    if (!botManager.recargarConfig(userId) && workerHandler.isWorkerAvailable()) {
      workerHandler.sendToWorker('worker:config-reload', { userId: String(userId) });
    }
  } catch (e) { logger.warn('[Config] recargarConfig: ' + e.message); }
}

// ─────────────────────────────────────────────────────────────
//  Todas las rutas siguientes requieren auth
// ─────────────────────────────────────────────────────────────
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
//  DELETE /api/config/google/disconnect — desconectar Calendar
// ─────────────────────────────────────────────────────────────
router.delete('/google/disconnect', async (req, res) => {
  try {
    const config = await Config.findOne({ userId: req.user._id });
    if (config) {
      config.setKey('googleCalendarTokens', null);
      config.googleEmail = '';
      await config.save();
    }
    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: 'Google Calendar desconectado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/config — obtener config del usuario (sin keys)
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let config = await Config.findOne({ userId: req.user._id });
    if (!config) {
      config = await Config.create({ userId: req.user._id });
    }
    res.json({
      config: config.toJSON(),
      keys:   config.resumenKeys(), // solo indica qué keys están cargadas
    });
  } catch (err) {
    logger.error('[Config] GET error:', err.message);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/negocio — actualizar datos del negocio
// ─────────────────────────────────────────────────────────────
router.put('/negocio', [
  body('miNombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('negocio').trim().notEmpty().withMessage('El nombre del negocio es obligatorio'),
  body('servicios').trim().optional(),
  body('precioTurno').isFloat({ min: 0 }).withMessage('El precio debe ser un número positivo'),
  body('horasCancelacion').isInt({ min: 0 }).withMessage('Las horas deben ser un número positivo'),
  body('promptPersonalizado').optional().isLength({ max: 2000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { miNombre, negocio, servicios, precioTurno, horasCancelacion, promptPersonalizado, dominioNgrok, mpWebhookUrl, aliasTransferencia, cbuTransferencia, bancoTransferencia, serviciosList, tipoNegocio, checkInHora, checkOutHora, minimaEstadia, unidadesAlojamiento, direccionPropiedad, linkUbicacion } = req.body;

    const config = await Config.findOneAndUpdate(
      { userId: req.user._id },
      {
        miNombre:    miNombre.trim(),
        negocio:     negocio.trim(),
        servicios:   servicios?.trim() || 'turnos y reservas',
        precioTurno: parseFloat(precioTurno),
        horasCancelacion: parseInt(horasCancelacion),
        promptPersonalizado: (promptPersonalizado || '').trim(),
        dominioNgrok: (dominioNgrok || '').trim(),
        mpWebhookUrl: (mpWebhookUrl || '').trim(),
        aliasTransferencia: (aliasTransferencia || '').trim(),
        cbuTransferencia:   (cbuTransferencia   || '').trim(),
        bancoTransferencia: (bancoTransferencia  || '').trim(),
        ...(serviciosList           !== undefined ? { serviciosList }  : {}),
        ...(tipoNegocio             ? { tipoNegocio }    : {}),
        ...(checkInHora             ? { checkInHora }    : {}),
        ...(checkOutHora            ? { checkOutHora }   : {}),
        ...(minimaEstadia           !== undefined ? { minimaEstadia: parseInt(minimaEstadia) } : {}),
        ...(unidadesAlojamiento !== undefined ? {
          unidadesAlojamiento: Array.isArray(unidadesAlojamiento)
            ? unidadesAlojamiento.map(u => ({
                nombre:         String(u.nombre || '').trim(),
                descripcion:    String(u.descripcion || '').trim(),
                capacidad:      Math.max(1, parseInt(u.capacidad)  || 1),
                precioPorNoche: Math.max(0, parseFloat(u.precioPorNoche) || 0),
                amenidades:     String(u.amenidades || '').trim(),
              }))
            : [],
        } : {}),
        ...(direccionPropiedad      !== undefined ? { direccionPropiedad: (direccionPropiedad || '').trim() } : {}),
        ...(linkUbicacion           !== undefined ? { linkUbicacion: (linkUbicacion || '').trim() } : {}),
        configurado: true,
      },
      { upsert: true, new: true }
    );

    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: 'Datos del negocio actualizados' });
    _notificarRecargarConfig(req.user._id);
    res.json({ config: config.toJSON(), keys: config.resumenKeys() });

  } catch (err) {
    logger.error('[Config] PUT negocio error:', err.message);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/horarios — horarios de atención + notificaciones
// ─────────────────────────────────────────────────────────────
router.put('/horarios', async (req, res) => {
  try {
    const { horariosAtencion, celularNotificaciones } = req.body;
    const update = {};
    if (horariosAtencion)           update.horariosAtencion      = horariosAtencion;
    if (celularNotificaciones !== undefined) update.celularNotificaciones = (celularNotificaciones || '').trim();

    const config = await Config.findOneAndUpdate(
      { userId: req.user._id },
      update,
      { upsert: true, new: true }
    );
    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: 'Horarios de atención actualizados' });
    _notificarRecargarConfig(req.user._id);
    res.json({ config: config.toJSON(), keys: config.resumenKeys() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/pausa — activar/desactivar modo pausa
// ─────────────────────────────────────────────────────────────
router.put('/pausa', async (req, res) => {
  try {
    const { modoPausa } = req.body;
    const config = await Config.findOneAndUpdate(
      { userId: req.user._id },
      { modoPausa: !!modoPausa },
      { upsert: true, new: true }
    );
    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Modo pausa ${modoPausa ? 'activado' : 'desactivado'}` });
    _notificarRecargarConfig(req.user._id);
    res.json({ modoPausa: config.modoPausa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/chats-ignorados — agregar o quitar número ignorado
// ─────────────────────────────────────────────────────────────
router.put('/chats-ignorados', async (req, res) => {
  try {
    const { numero, accion } = req.body; // accion: 'agregar' | 'quitar'
    if (!numero || !/^\d{6,15}$/.test(numero.trim())) {
      return res.status(400).json({ error: 'Número inválido (solo dígitos, entre 6 y 15)' });
    }
    const num = numero.trim();
    const update = accion === 'quitar'
      ? { $pull:     { chatsIgnorados: num } }
      : { $addToSet: { chatsIgnorados: num } };

    const config = await Config.findOneAndUpdate({ userId: req.user._id }, update, { upsert: true, new: true });
    _notificarRecargarConfig(req.user._id);
    res.json({ chatsIgnorados: config.chatsIgnorados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/dias-bloqueados — agregar o quitar un día bloqueado
// ─────────────────────────────────────────────────────────────
router.put('/dias-bloqueados', async (req, res) => {
  try {
    const { fecha, accion } = req.body; // accion: 'agregar' | 'quitar'
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ error: 'Fecha inválida (formato YYYY-MM-DD)' });
    }
    const update = accion === 'quitar'
      ? { $pull:     { diasBloqueados: fecha } }
      : { $addToSet: { diasBloqueados: fecha } };

    const config = await Config.findOneAndUpdate({ userId: req.user._id }, update, { upsert: true, new: true });
    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Día ${accion === 'quitar' ? 'desbloqueado' : 'bloqueado'}: ${fecha}` });
    _notificarRecargarConfig(req.user._id);
    res.json({ diasBloqueados: config.diasBloqueados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/keys — actualizar API Keys (cifradas)
// ─────────────────────────────────────────────────────────────
router.put('/keys', [
  body('campo').isIn(['keyGroq','keyMP','idCalendar','keyRime','keyNgrok','credentialsGoogleB64'])
    .withMessage('Campo inválido'),
  body('valor').notEmpty().withMessage('El valor no puede estar vacío'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { campo, valor } = req.body;

    let config = await Config.findOne({ userId: req.user._id });
    if (!config) config = new Config({ userId: req.user._id });

    // Cifrar y guardar
    config.setKey(campo, valor.trim());
    await config.save();

    await Log.registrar({
      userId: req.user._id,
      tipo: 'config_update',
      mensaje: `Key '${campo}' actualizada`,
    });

    logger.info(`[Config] Key '${campo}' actualizada para user ${req.user._id}`);
    res.json({ ok: true, keys: config.resumenKeys() });

  } catch (err) {
    logger.error('[Config] PUT keys error:', err.message);
    res.status(500).json({ error: 'Error al guardar la key' });
  }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/config/keys/:campo — eliminar una key
// ─────────────────────────────────────────────────────────────
router.delete('/keys/:campo', async (req, res) => {
  const campos = ['keyGroq','keyMP','idCalendar','keyRime','keyNgrok','credentialsGoogleB64'];
  if (!campos.includes(req.params.campo)) {
    return res.status(400).json({ error: 'Campo inválido' });
  }

  try {
    const config = await Config.findOne({ userId: req.user._id });
    if (!config) return res.status(404).json({ error: 'Configuración no encontrada' });

    config.setKey(req.params.campo, null);
    await config.save();

    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Key '${req.params.campo}' eliminada` });
    res.json({ ok: true, keys: config.resumenKeys() });

  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar la key' });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/config/catalogo — guardar catálogo completo
// ─────────────────────────────────────────────────────────────
router.put('/catalogo', async (req, res) => {
  try {
    const { catalogo } = req.body;
    if (!Array.isArray(catalogo)) return res.status(400).json({ error: 'catalogo debe ser un array' });

    const catalogoSanitizado = catalogo.map(p => ({
      waProductId:  String(p.waProductId  || '').trim(),
      nombre:       String(p.nombre       || '').trim(),
      descripcion:  String(p.descripcion  || '').trim(),
      precio:       Math.max(0, parseFloat(p.precio) || 0),
      moneda:       String(p.moneda       || 'ARS').trim(),
      categoria:    String(p.categoria    || '').trim(),
      stock:        parseInt(p.stock)     >= 0 ? parseInt(p.stock) : -1,
      imagen:       String(p.imagen       || '').trim(),
      disponible:   p.disponible !== false,
      fuente:       ['manual', 'wa_catalog', 'status'].includes(p.fuente) ? p.fuente : 'manual',
    })).filter(p => p.nombre);

    const config = await Config.findOneAndUpdate(
      { userId: req.user._id },
      { catalogo: catalogoSanitizado },
      { upsert: true, new: true }
    );
    await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Catálogo actualizado: ${catalogoSanitizado.length} producto(s)` });
    res.json({ ok: true, catalogo: config.catalogo, keys: config.resumenKeys() });
  } catch (err) {
    logger.error('[Config] PUT catalogo error:', err.message);
    res.status(500).json({ error: 'Error al guardar catálogo' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/config/catalogo/sync — disparar sync desde WA Business
// ─────────────────────────────────────────────────────────────
router.post('/catalogo/sync', async (req, res) => {
  try {
    const botManager = require('../services/bot.manager');
    let ok = botManager.triggerCatalogSync(req.user._id);

    // Bot no en memoria pero tiene sesión guardada → intentar reconectar
    if (!ok && req.user.botConectado) {
      const started = await botManager.startBot(req.user._id.toString());
      if (started.ok) {
        // Esperar brevemente a que el bot cargue la sesión y luego disparar sync
        await new Promise(r => setTimeout(r, 4000));
        ok = botManager.triggerCatalogSync(req.user._id);
      }
    }

    if (!ok) {
      const msg = req.user.botConectado
        ? 'El bot está reconectando. Esperá unos segundos e intentá de nuevo.'
        : 'El bot no está activo. Inicialo desde el Dashboard primero.';
      return res.status(400).json({ error: msg, botConectado: req.user.botConectado });
    }

    res.json({ ok: true, msg: 'Sincronizando catálogo desde WhatsApp Business...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/config/catalogo/producto/:idx — eliminar por índice
// ─────────────────────────────────────────────────────────────
router.delete('/catalogo/producto/:idx', async (req, res) => {
  try {
    const idx = parseInt(req.params.idx);
    const config = await Config.findOne({ userId: req.user._id });
    if (!config) return res.status(404).json({ error: 'Configuración no encontrada' });
    if (isNaN(idx) || idx < 0 || idx >= config.catalogo.length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }
    config.catalogo.splice(idx, 1);
    await config.save();
    res.json({ ok: true, catalogo: config.catalogo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
