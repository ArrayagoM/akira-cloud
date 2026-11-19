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
const { mutarComandos } = require('../lib/comandos-guardar');
const productosCel = require('../lib/productos-celular');
const { buscarCodigo } = require('../lib/codigo-lookup');
const { analizarFoto, sinClaves } = require('../lib/ia-foto-producto');
const { consumirTodos } = require('../lib/limite');
const ProductoPendiente = require('../models/ProductoPendiente');
const push = require('../services/push.service');
const logger = require('../config/logger');
const mirando = require('../lib/mirando');

const MAX_CELULARES = 5;
const misPCs = (userId) => Device.find({ userId, activo: true, revocado: false });

// GET /api/mobile/web-push/clave — clave pública (VAPID) para que la app web pueda pedir avisos. Sin sesión.
router.get('/web-push/clave', (_req, res) => {
  if (!push.webPushDisponible()) return res.status(503).json({ disponible: false });
  res.json({ disponible: true, clave: process.env.VAPID_PUBLIC_KEY });
});

// GET /api/mobile/android — última versión de la app de Android (sin sesión: la app lo consulta antes de entrar).
// La app compara su versionCode con este y, si hay una más nueva, ofrece actualizarse (ver mobile/src/actualizar.js).
router.get('/android', async (_req, res) => {
  try {
    const v = await require('../lib/android-ultima').ultimaAndroid();
    const base = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
    res.set('Cache-Control', 'public, max-age=300');
    if (!v) return res.json({ disponible: false });
    res.json({ disponible: true, versionCode: v.versionCode, versionName: v.versionName, sizeMB: v.sizeMB, notas: v.notas, firmaEstable: v.firmaEstable, sha256: v.sha256, url: `${base}/api/desktop/download-android` });
  } catch (e) { logger.error('[Mobile] android: ' + e.message); res.json({ disponible: false }); }
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
    mirando.marcarMirando(Device, req.user._id, ahora); // avisa a la PC (en su próxima señal) que hay alguien mirando
    const pcs = (await misPCs(req.user._id)).map((d) => comandos.resumirEstado(d, ahora, { grupos: req.user.resumenVer }));
    res.json({ pcs, ahora: ahora.toISOString(), usuario: { nombre: req.user.nombre || '', email: req.user.email || '' } });
  } catch (e) { logger.error('[Mobile] estado: ' + e.message); res.status(500).json({ error: 'No se pudo leer el estado' }); }
});

// GET /api/mobile/datos?tipo=agenda|caja|clientes|catalogo → los datos del negocio que cada PC subió (solo si el usuario lo activó en la PC).
// Solo de la cuenta que pregunta; se descifran acá y no se guardan en ningún otro lado.
router.get('/datos', requireAuth, async (req, res) => {
  try {
    const DN = require('../lib/datos-negocio');
    const tipo = String(req.query.tipo || '');
    if (!DN.TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de dato inválido' });
    const ahora = new Date();
    mirando.marcarMirando(Device, req.user._id, ahora);
    const pcs = await misPCs(req.user._id);
    const docs = await require('../models/DatosNegocio').find({ userId: req.user._id, tipo }).select('+cifrado');
    const { decrypt } = require('../services/crypto.service');
    const salida = [];
    for (const pc of pcs) {
      const d = docs.find((x) => x.deviceId === pc.deviceId); if (!d) continue;
      let datos = null; try { datos = JSON.parse(decrypt(d.cifrado)); } catch { datos = null; }
      if (datos) salida.push({ deviceId: pc.deviceId, nombre: pc.nombre || 'Mi PC', actualizadoEn: new Date(d.actualizadoEn).toISOString(), datos });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ tipo, pcs: salida, ahora: ahora.toISOString() });
  } catch (e) { logger.error('[Mobile] datos: ' + e.message); res.status(500).json({ error: 'No se pudieron leer los datos' }); }
});

// POST /api/mobile/comandos { deviceId, tipo } — la PC lo retira en ~1 min (si el control remoto está activado)
router.post('/comandos', requireAuth, async (req, res) => {
  try {
    const { deviceId, tipo } = req.body || {};
    // Guardado por versión: si la PC consulta en este mismo instante, la orden no se pierde (lib/comandos-guardar.js).
    const g = await mutarComandos(Device, { userId: req.user._id, deviceId, activo: true, revocado: false }, (d) => ({ c: comandos.encolar(d, String(tipo)) }));
    if (!g.device) return res.status(404).json({ error: 'No encontré esa PC' });
    const c = g.resultado.c;
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

// ── Productos cargados con la cámara del celular ──────────────────────────────────────────────
// POST /api/mobile/productos { deviceId, producto:{nombre,precio,categoria,stock,descripcion,codigo}, foto? } — queda en la bandeja y la PC
// lo retira en ~1 min (si el control desde el celular está activado). La foto se borra de la nube apenas la PC confirma.
router.post('/productos', requireAuth, async (req, res) => {
  try {
    const { deviceId, producto, foto } = req.body || {};
    const d = await Device.findOne({ userId: req.user._id, deviceId: String(deviceId || ''), activo: true, revocado: false });
    if (!d) return res.status(404).json({ error: 'No encontré esa PC' });
    if (d.celularActivo !== true) return res.status(409).json({ error: 'Para enviar productos, activá “Controlar desde la app del celular” en Akira (PC) → Inicio.', codigo: 'CELULAR_DESACTIVADO' });
    const f = productosCel.validarFoto(foto); if (!f.ok) return res.status(400).json({ error: f.error });
    const p = productosCel.limpiarProducto(producto, { sinNombreOk: !f.vacia }); if (!p.ok) return res.status(400).json({ error: p.error });
    const r = await productosCel.encolar(ProductoPendiente, { userId: req.user._id, deviceId: d.deviceId, producto: p.producto, foto: f });
    res.status(201).json({ ok: true, ...r });
  } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo enviar el producto' }); }
});

// POST /api/mobile/productos/analizar { foto } — lee la foto con IA y devuelve nombre, categoría y descripción SUGERIDOS para que el dueño los
// revise antes de enviar. Nunca devuelve precio ni stock. Tope por usuario (la IA es de la plataforma): 6 por minuto y 60 por día.
// (Va bajo /productos para usar el mismo tope de tamaño de pedido que el envío con foto.)
router.post('/productos/analizar', requireAuth, async (req, res) => {
  try {
    const f = productosCel.validarFoto(req.body && req.body.foto);
    if (!f.ok) return res.status(400).json({ error: f.error });
    if (f.vacia) return res.status(400).json({ error: 'Sacá primero la foto del producto.' });
    const uid = String(req.user._id);
    const lim = await consumirTodos([[`iafoto:min:${uid}`, { max: 6, ventanaMs: 60e3 }], [`iafoto:dia:${uid}`, { max: 60, ventanaMs: 24 * 3600e3 }]]);
    if (!lim.ok) return res.status(429).json({ error: lim.clave.includes(':dia:') ? 'Llegaste al límite de lecturas con IA de hoy. Escribí el nombre a mano o probá mañana.' : 'Esperá un momento antes de leer otra foto.', codigo: 'LIMITE' });
    const r = await analizarFoto({ base64: f.base64, mime: f.mime, apiKey: process.env.GROQ_PLATFORM_API_KEY || process.env.GROQ_API_KEY });
    if (r.ok) return res.json({ ok: true, ...r.datos });
    if (r.codigo === 'SIN_CLAVE' || r.codigo === 'CLAVE') logger.warn('[Mobile] lectura de foto: la clave de Groq de la plataforma no está o no sirve');
    // Nunca es un error "grave" para el celular: el dueño puede escribir el nombre a mano.
    res.json({ ok: false, codigo: r.codigo, motivo: r.motivo });
  } catch (e) { logger.warn('[Mobile] lectura de foto: ' + sinClaves(e.message)); res.json({ ok: false, codigo: 'FALLO', motivo: 'No se pudo leer la foto. Escribí el nombre a mano.' }); }
});

// GET /api/mobile/productos?deviceId=... — los últimos productos enviados y si la PC ya los recibió
router.get('/productos', requireAuth, async (req, res) => {
  try {
    const d = await Device.findOne({ userId: req.user._id, deviceId: String(req.query.deviceId || ''), activo: true, revocado: false });
    if (!d) return res.status(404).json({ error: 'No encontré esa PC' });
    res.json({ productos: await productosCel.listar(ProductoPendiente, req.user._id, d.deviceId) });
  } catch { res.status(500).json({ error: 'No se pudo leer la lista' }); }
});

// GET /api/mobile/codigo/:codigo — nombre y marca sugeridos para un código de barras (base pública; solo se manda el código)
router.get('/codigo/:codigo', requireAuth, async (req, res) => {
  try { res.json(await buscarCodigo(String(req.params.codigo || '').slice(0, 20))); }
  catch { res.json({ encontrado: false }); }
});

// POST /api/mobile/prueba — manda una notificación de prueba a los celulares del usuario
router.post('/prueba', requireAuth, async (req, res) => {
  try {
    const r = await push.notificarUsuario(req.user._id, { titulo: 'Akira', cuerpo: 'Las notificaciones funcionan: te avisaremos si tu bot se cae.', datos: { tipo: 'prueba' } });
    res.json({ ok: r.enviados > 0, enviados: r.enviados });
  } catch { res.status(500).json({ error: 'No se pudo enviar la prueba' }); }
});

module.exports = router;
