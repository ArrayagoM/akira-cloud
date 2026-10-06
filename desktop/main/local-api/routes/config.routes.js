// local-api/routes/config.routes.js
// Mismas rutas y respuestas que backend/routes/config.routes.js, contra la
// base local. Cambia solo: no hay worker/Render que notificar (el bot corre
// acá mismo, se le avisa directo), y la conexión de Google Calendar por
// OAuth todavía no está disponible en escritorio (las credenciales ya
// conectadas en la plataforma llegan con la importación).
'use strict';

const { body, validationResult } = require('express-validator');
const Config = require('../../bot-engine/models/Config');
const Log = require('../../bot-engine/models/Log');

module.exports = function crearRouter({ botService, requerirSesion }) {
  const router = require('express').Router();

  async function asegurarConfig(userId) {
    const existente = await Config.findOne({ userId });
    if (existente) return existente;
    return Config.create({ userId, ...Config.DEFAULTS });
  }
  const recargar = () => botService.recargarConfig(0);

  router.get('/google/connect', (_req, res) => {
    res.status(200).send(
      '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0f1115;color:#eee;padding:48px"><h2>Conectar Google Calendar</h2><p>Si ya lo tenías conectado en Akira Cloud, se importó automáticamente con tu configuración.</p><p>La conexión nueva desde la app de escritorio todavía no está disponible.</p><p><a style="color:#4ade80" href="/config">Volver a Configuración</a></p></body>',
    );
  });

  router.use(requerirSesion);

  router.delete('/google/disconnect', async (req, res) => {
    try {
      const config = await Config.findOne({ userId: req.user._id });
      if (config) { config.setKey('googleCalendarTokens', null); config.googleEmail = ''; await config.save(); }
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: 'Google Calendar desconectado' });
      botService.recargarCalendar(0);
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Error al desconectar' }); }
  });

  router.get('/', async (req, res) => {
    try {
      const config = await asegurarConfig(req.user._id);
      res.json({ config: config.toJSON(), keys: config.resumenKeys() });
    } catch { res.status(500).json({ error: 'Error al obtener configuración' }); }
  });

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
      await asegurarConfig(req.user._id);
      const { miNombre, negocio, servicios, precioTurno, horasCancelacion, promptPersonalizado, dominioNgrok, mpWebhookUrl, aliasTransferencia, cbuTransferencia, bancoTransferencia, serviciosList, tipoNegocio, checkInHora, checkOutHora, minimaEstadia, unidadesAlojamiento, direccionPropiedad, linkUbicacion } = req.body;
      const config = await Config.findOneAndUpdate(
        { userId: req.user._id },
        {
          miNombre: miNombre.trim(),
          negocio: negocio.trim(),
          servicios: servicios?.trim() || 'turnos y reservas',
          precioTurno: parseFloat(precioTurno),
          horasCancelacion: parseInt(horasCancelacion),
          promptPersonalizado: (promptPersonalizado || '').trim(),
          dominioNgrok: (dominioNgrok || '').trim(),
          mpWebhookUrl: (mpWebhookUrl || '').trim(),
          aliasTransferencia: (aliasTransferencia || '').trim(),
          cbuTransferencia: (cbuTransferencia || '').trim(),
          bancoTransferencia: (bancoTransferencia || '').trim(),
          ...(serviciosList !== undefined ? { serviciosList } : {}),
          ...(tipoNegocio ? { tipoNegocio } : {}),
          ...(checkInHora ? { checkInHora } : {}),
          ...(checkOutHora ? { checkOutHora } : {}),
          ...(minimaEstadia !== undefined ? { minimaEstadia: parseInt(minimaEstadia) } : {}),
          ...(unidadesAlojamiento !== undefined ? {
            unidadesAlojamiento: Array.isArray(unidadesAlojamiento)
              ? unidadesAlojamiento.map((u) => ({
                nombre: String(u.nombre || '').trim(),
                descripcion: String(u.descripcion || '').trim(),
                capacidad: Math.max(1, parseInt(u.capacidad) || 1),
                precioPorNoche: Math.max(0, parseFloat(u.precioPorNoche) || 0),
                amenidades: String(u.amenidades || '').trim(),
              }))
              : [],
          } : {}),
          ...(direccionPropiedad !== undefined ? { direccionPropiedad: (direccionPropiedad || '').trim() } : {}),
          ...(linkUbicacion !== undefined ? { linkUbicacion: (linkUbicacion || '').trim() } : {}),
          configurado: true,
        },
        { upsert: true, new: true },
      );
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: 'Datos del negocio actualizados' });
      recargar();
      res.json({ config: config.toJSON(), keys: config.resumenKeys() });
    } catch { res.status(500).json({ error: 'Error al guardar configuración' }); }
  });

  router.put('/horarios', async (req, res) => {
    try {
      await asegurarConfig(req.user._id);
      const { horariosAtencion, celularNotificaciones } = req.body;
      const update = {};
      if (horariosAtencion) update.horariosAtencion = horariosAtencion;
      if (celularNotificaciones !== undefined) update.celularNotificaciones = (celularNotificaciones || '').trim();
      const config = await Config.findOneAndUpdate({ userId: req.user._id }, update, { upsert: true, new: true });
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: 'Horarios de atención actualizados' });
      recargar();
      res.json({ config: config.toJSON(), keys: config.resumenKeys() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/pausa', async (req, res) => {
    try {
      await asegurarConfig(req.user._id);
      const { modoPausa } = req.body;
      const config = await Config.findOneAndUpdate({ userId: req.user._id }, { modoPausa: !!modoPausa }, { upsert: true, new: true });
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Modo pausa ${modoPausa ? 'activado' : 'desactivado'}` });
      recargar();
      res.json({ modoPausa: config.modoPausa });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/chats-ignorados', async (req, res) => {
    try {
      const { numero, accion } = req.body;
      if (!numero || !/^\d{6,15}$/.test(numero.trim())) return res.status(400).json({ error: 'Número inválido (solo dígitos, entre 6 y 15)' });
      await asegurarConfig(req.user._id);
      const num = numero.trim();
      const update = accion === 'quitar' ? { $pull: { chatsIgnorados: num } } : { $addToSet: { chatsIgnorados: num } };
      const config = await Config.findOneAndUpdate({ userId: req.user._id }, update, { new: true });
      recargar();
      res.json({ chatsIgnorados: config.chatsIgnorados });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/dias-bloqueados', async (req, res) => {
    try {
      const { fecha, accion } = req.body;
      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha inválida (formato YYYY-MM-DD)' });
      await asegurarConfig(req.user._id);
      const update = accion === 'quitar' ? { $pull: { diasBloqueados: fecha } } : { $addToSet: { diasBloqueados: fecha } };
      const config = await Config.findOneAndUpdate({ userId: req.user._id }, update, { new: true });
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Día ${accion === 'quitar' ? 'desbloqueado' : 'bloqueado'}: ${fecha}` });
      recargar();
      res.json({ diasBloqueados: config.diasBloqueados });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const CAMPOS_KEYS = ['keyGroq', 'keyMP', 'idCalendar', 'keyRime', 'keyNgrok', 'credentialsGoogleB64'];

  router.put('/keys', [
    body('campo').isIn(CAMPOS_KEYS).withMessage('Campo inválido'),
    body('valor').notEmpty().withMessage('El valor no puede estar vacío'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const config = await asegurarConfig(req.user._id);
      config.setKey(req.body.campo, req.body.valor.trim()); // cifrado con safeStorage (credentials-store)
      await config.save();
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Key '${req.body.campo}' actualizada` });
      res.json({ ok: true, keys: config.resumenKeys() });
    } catch { res.status(500).json({ error: 'Error al guardar la key' }); }
  });

  router.delete('/keys/:campo', async (req, res) => {
    if (!CAMPOS_KEYS.includes(req.params.campo)) return res.status(400).json({ error: 'Campo inválido' });
    try {
      const config = await Config.findOne({ userId: req.user._id });
      if (!config) return res.status(404).json({ error: 'Configuración no encontrada' });
      config.setKey(req.params.campo, null);
      await config.save();
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Key '${req.params.campo}' eliminada` });
      res.json({ ok: true, keys: config.resumenKeys() });
    } catch { res.status(500).json({ error: 'Error al eliminar la key' }); }
  });

  router.put('/catalogo', async (req, res) => {
    try {
      const { catalogo } = req.body;
      if (!Array.isArray(catalogo)) return res.status(400).json({ error: 'catalogo debe ser un array' });
      const sanitizado = catalogo.map((p) => ({
        waProductId: String(p.waProductId || '').trim(),
        nombre: String(p.nombre || '').trim(),
        descripcion: String(p.descripcion || '').trim(),
        precio: Math.max(0, parseFloat(p.precio) || 0),
        moneda: String(p.moneda || 'ARS').trim(),
        categoria: String(p.categoria || '').trim(),
        stock: parseInt(p.stock) >= 0 ? parseInt(p.stock) : -1,
        imagen: String(p.imagen || '').trim(),
        disponible: p.disponible !== false,
        fuente: ['manual', 'wa_catalog', 'status'].includes(p.fuente) ? p.fuente : 'manual',
      })).filter((p) => p.nombre);
      await asegurarConfig(req.user._id);
      const config = await Config.findOneAndUpdate({ userId: req.user._id }, { catalogo: sanitizado }, { upsert: true, new: true });
      await Log.registrar({ userId: req.user._id, tipo: 'config_update', mensaje: `Catálogo actualizado: ${sanitizado.length} producto(s)` });
      res.json({ ok: true, catalogo: config.catalogo, keys: config.resumenKeys() });
    } catch { res.status(500).json({ error: 'Error al guardar catálogo' }); }
  });

  router.post('/catalogo/sync', async (req, res) => {
    const ok = botService.triggerCatalogSync(0);
    if (!ok) return res.status(400).json({ error: 'El bot no está activo. Inicialo desde el Dashboard primero.', botConectado: false });
    res.json({ ok: true, msg: 'Sincronizando catálogo desde WhatsApp Business...' });
  });

  router.delete('/catalogo/producto/:idx', async (req, res) => {
    try {
      const idx = parseInt(req.params.idx);
      const config = await Config.findOne({ userId: req.user._id });
      if (!config) return res.status(404).json({ error: 'Configuración no encontrada' });
      if (isNaN(idx) || idx < 0 || idx >= config.catalogo.length) return res.status(400).json({ error: 'Índice inválido' });
      config.catalogo.splice(idx, 1);
      await config.save();
      res.json({ ok: true, catalogo: config.catalogo });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
