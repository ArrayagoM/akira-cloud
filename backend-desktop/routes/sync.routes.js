// routes/sync.routes.js
// Exportación de los datos del usuario hacia su instalación de escritorio
// (config + API keys descifradas, clientes, turnos, lista de espera). Es la
// única ruta de este servidor que devuelve secretos en claro, así que:
//   - exige sesión válida (JWT) Y un dispositivo activado y no revocado de
//     ESE usuario (header x-device-id) — un token robado solo no alcanza;
//   - solo devuelve datos del usuario autenticado (nunca de otro);
//   - deja registro en Log cada vez que se descargan las keys.
// Las keys viajan por HTTPS y la app las vuelve a cifrar con safeStorage del
// sistema operativo apenas las recibe (ver desktop/main/local-api/routes/sync).
'use strict';

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const Device = require('../models/Device');
const Config = require('../models/Config');
const BotCliente = require('../models/BotCliente');
const Turno = require('../models/Turno');
const WaitlistEntry = require('../models/WaitlistEntry');
const Log = require('../models/Log');
const MpEvento = require('../models/MpEvento');
const logger = require('../config/logger');

router.use(requireAuth);

async function requireDevice(req, res, next) {
  const deviceId = String(req.headers['x-device-id'] || '');
  if (!deviceId) return res.status(400).json({ error: 'Falta x-device-id' });
  const device = await Device.findOne({ userId: req.user._id, deviceId, activo: true, revocado: false }).lean();
  if (!device) return res.status(403).json({ error: 'Dispositivo no activado para esta cuenta' });
  next();
}
router.use(requireDevice);

const CAMPOS_CIFRADOS = ['keyGroq', 'keyMP', 'idCalendar', 'keyRime', 'keyNgrok', 'credentialsGoogleB64', 'googleCalendarTokens'];

// GET /api/sync/config
router.get('/config', async (req, res) => {
  try {
    const cfg = await Config.findOne({ userId: req.user._id });
    if (!cfg) return res.json({ config: null, secrets: {} });

    const plano = cfg.toObject();
    for (const c of CAMPOS_CIFRADOS) delete plano[c];
    delete plano.__v;

    const secrets = {};
    for (const c of CAMPOS_CIFRADOS) {
      const v = cfg.getKey(c);
      if (v) secrets[c] = v;
    }

    await Log.registrar({
      userId: req.user._id, tipo: 'config_update', nivel: 'warn',
      mensaje: `Configuración y ${Object.keys(secrets).length} key(s) descargadas a una instalación de escritorio`,
      ip: req.ip,
    });
    logger.info(`[Sync] config exportada para ${req.user._id} (${Object.keys(secrets).length} keys)`);
    res.json({ config: plano, secrets });
  } catch (err) {
    logger.error('[Sync] config error: ' + err.message);
    res.status(500).json({ error: 'Error al exportar la configuración' });
  }
});

// GET /api/sync/mp-eventos — notificaciones de pago pendientes de este usuario
router.get('/mp-eventos', async (req, res) => {
  const eventos = await MpEvento.find({ userId: req.user._id }).sort({ _id: 1 }).limit(50).lean();
  res.json({ eventos: eventos.map((e) => ({ id: String(e._id), payload: e.payload })) });
});

// POST /api/sync/mp-eventos/ack { ids } — la app ya los procesó
router.post('/mp-eventos/ack', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((i) => /^[a-f0-9]{24}$/i.test(i)) : [];
  const r = await MpEvento.deleteMany({ _id: { $in: ids }, userId: req.user._id });
  res.json({ ok: true, borrados: r.deletedCount });
});

const COLECCIONES = { clientes: BotCliente, turnos: Turno, waitlist: WaitlistEntry };

// GET /api/sync/:coleccion?cursor=<_id>&limit=100 — paginado por _id
router.get('/:coleccion', async (req, res) => {
  const Modelo = COLECCIONES[req.params.coleccion];
  if (!Modelo) return res.status(404).json({ error: 'Colección desconocida' });
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const filtro = { userId: req.user._id };
    if (req.query.cursor) filtro._id = { $gt: String(req.query.cursor) };

    const items = await Modelo.find(filtro).sort({ _id: 1 }).limit(limit + 1).lean();
    const hayMas = items.length > limit;
    if (hayMas) items.pop();

    res.json({
      items,
      nextCursor: hayMas ? String(items[items.length - 1]._id) : null,
    });
  } catch (err) {
    logger.error(`[Sync] ${req.params.coleccion} error: ${err.message}`);
    res.status(500).json({ error: 'Error al exportar datos' });
  }
});

module.exports = router;
