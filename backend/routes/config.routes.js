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
    scope: ['https://www.googleapis.com/auth/calendar'],
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

  if (error || !code || !userToken) {
    logger.warn(`[Config] Google OAuth callback — error o datos faltantes: ${error || 'sin code/state'}`);
    return res.redirect(`${frontendUrl}/config?calendar=error`);
  }

  try {
    const payload = jwt.verify(userToken, process.env.JWT_SECRET);
    const userId  = payload.id;

    const oauth2Client = crearOAuth2Client();
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

    await Log.registrar({ userId, tipo: 'config_update', mensaje: `Google Calendar conectado (${data.email})` });
    logger.info(`[Config] Google Calendar OAuth OK para user ${userId} — ${data.email}`);
    res.redirect(`${frontendUrl}/config?calendar=ok`);

  } catch (err) {
    logger.error('[Config] Google OAuth callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL || ''}/config?calendar=error`);
  }
});

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
    res.json({ modoPausa: config.modoPausa });
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

module.exports = router;
