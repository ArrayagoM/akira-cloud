// local-api/server.js
// Servidor HTTP local (solo loopback) que da a la app de escritorio la MISMA
// interfaz y las MISMAS rutas que la plataforma: sirve el frontend de React,
// atiende /api/config, /api/bot y /api/turnos contra la base local y el bot
// que corre en este proceso, emite los mismos eventos de socket.io (bot:qr,
// bot:ready, …) y reenvía a la nube solo lo que sigue viviendo allá (login,
// OAuth, suscripciones). Así el frontend no necesita saber que es escritorio.
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const { crearSesion } = require('./session');
const { reenviar } = require('./proxy');
const { importarTodo } = require('./importador');
const { obtenerDeviceId } = require('../device');
const licenseClient = require('../license/license-client');
const guardian = require('../license/guardian');

const PUERTO_PREFERIDO = 47321; // fijo: el origen (y con él el login guardado en localStorage) no cambia entre aperturas

async function iniciar({ userDataDir, serverUrl, frontendDir, nombreEquipo, botService, alCodigoOAuth, alCambiarEstado, appHooks = {} }) {
  const app = express();
  const server = http.createServer(app);
  let puerto = null;
  const origenesValidos = () => new Set([`http://127.0.0.1:${puerto}`, `http://localhost:${puerto}`]);

  const io = new Server(server, { serveClient: false });

  const emitirAlUsuario = (userId, evento, datos) => io.to(`user:${userId}`).emit(evento, datos);
  botService.init({ userDataDir, emitirAlUsuario, alCambiarEstado });

  // ── Importación desde la nube ──────────────────────────────────
  const estadoImp = { corriendo: false, ultimo: null, error: null };
  const marcaImport = (uid) => path.join(userDataDir, `import-${uid}.done`);

  async function ejecutarImport(userId) {
    estadoImp.corriendo = true;
    estadoImp.error = null;
    emitirAlUsuario(userId, 'sync:estado', { ...estadoImp });
    try {
      const resumen = await importarTodo({
        userId: String(userId),
        deviceId: obtenerDeviceId(userDataDir),
        onProgreso: (coleccion, n) => emitirAlUsuario(userId, 'sync:progreso', { coleccion, n }),
      });
      estadoImp.ultimo = resumen;
      fs.writeFileSync(marcaImport(userId), new Date().toISOString());
      botService.recargarConfig(0);
      return resumen;
    } catch (err) {
      estadoImp.error = err.message;
      throw err;
    } finally {
      estadoImp.corriendo = false;
      emitirAlUsuario(userId, 'sync:estado', { ...estadoImp });
    }
  }

  // ── Sesión (JWT validado por la nube + licencia del equipo) ────
  let mpTimer = null;
  const sesion = crearSesion({
    userDataDir,
    nombreEquipo,
    alActivar: (s) => {
      const uid = String(s.user._id);
      (async () => {
        if (!fs.existsSync(marcaImport(uid))) {
          try { await ejecutarImport(uid); } catch (e) { console.warn('[Import] falló:', e.message); }
        }
        await botService.restaurarActivos(uid);
      })();
      if (!mpTimer) mpTimer = setInterval(() => sondearPagos().catch(() => {}), 20_000);
    },
  });

  // MercadoPago avisa a la nube (única URL pública); acá se retiran los
  // avisos y se procesan — el bot re-verifica cada pago contra la API de MP.
  async function sondearPagos() {
    if (!sesion.estado().activada) return;
    const headers = { 'x-device-id': obtenerDeviceId(userDataDir) };
    const { eventos } = await licenseClient.request('/api/sync/mp-eventos', 'GET', null, headers);
    if (!eventos?.length) return;
    for (const e of eventos) await botService.procesarWebhookMP(e.payload);
    await licenseClient.request('/api/sync/mp-eventos/ack', 'POST', { ids: eventos.map((e) => e.id) }, headers);
  }

  // ── Guardas: solo esta app puede hablarle a la API local ───────
  app.use((req, res, next) => {
    const host = req.headers.host;
    if (host !== `127.0.0.1:${puerto}` && host !== `localhost:${puerto}`) return res.status(403).end();
    const origen = req.headers.origin;
    if (origen && !origenesValidos().has(origen)) return res.status(403).json({ error: 'Origen no permitido' });
    next();
  });

  // /gestion/analizar recibe archivos (base64) y trae su propio límite mayor
  const jsonGeneral = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path === '/api/gestion/analizar' ? next() : jsonGeneral(req, res, next)));

  // ── Login social: el navegador del sistema vuelve acá (loopback) ─
  for (const proveedor of ['google', 'facebook']) {
    app.get(`/api/auth/${proveedor}`, (_req, res) => {
      res.redirect(`${serverUrl}/api/auth/${proveedor}?desktop_port=${puerto}`);
    });
  }
  app.get('/callback', (req, res) => {
    // El navegador del sistema termina acá. Se le pasa el código a la
    // ventana de la app (que canjea el token en /oauth-callback) y esta
    // pestaña solo confirma — el token nunca queda en el navegador.
    const code = String(req.query.code || '');
    if (code) alCodigoOAuth?.(code);
    res.type('html').send('<!doctype html><meta charset="utf-8"><title>Akira</title><body style="font-family:system-ui;background:#0f1115;color:#eee;text-align:center;padding-top:20vh"><h2>Listo — ya podés volver a Akira</h2><p>Podés cerrar esta pestaña.</p></body>');
  });

  // ── Lo que sigue viviendo en la nube ─────────────────────────────
  const aNube = reenviar(serverUrl);
  app.use('/api/auth', aNube);
  app.use('/api/subscriptions', aNube);
  app.use('/api/admin', aNube); // panel de administración: vive en la nube (solo rol admin)

  // ── Lo que corre local ─────────────────────────────────────────
  const deps = { botService, requerirSesion: sesion.requerirSesion, userDataDir, appHooks, servicioRespaldo: appHooks.servicioRespaldo, servicioResumenDiario: appHooks.servicioResumenDiario, estadoImport: () => estadoImp, ejecutarImport };
  app.use('/api/config', require('./routes/config.routes')(deps));
  app.use('/api/bot', require('./routes/bot.routes')(deps));
  app.use('/api/turnos', require('./routes/turnos.routes')(deps));
  app.use('/api/gestion', require('./routes/gestion.routes')(deps));
  app.use('/api/caja', require('./routes/caja.routes')(deps));
  app.use('/api/deudores', require('./routes/deudores.routes')(deps));
  app.use('/api/proveedores', require('./routes/proveedores.routes')(deps));
  app.use('/api/app/avisos', require('./routes/avisos.routes')(deps));
  if (appHooks.servicioRespaldo) app.use('/api/app/respaldo', require('./routes/respaldo.routes')(deps));
  // ── "Ver mi negocio desde la web" (opcional, apagado por defecto) ──
  app.get('/api/app/resumen-web', sesion.requerirSesion, (_req, res) => res.json({ activo: require('../resumen-web').activo(userDataDir) }));
  app.put('/api/app/resumen-web', sesion.requerirSesion, async (req, res) => {
    const resumenWeb = require('../resumen-web');
    resumenWeb.guardar(userDataDir, req.body?.activo === true);
    // Se aplica enseguida: al activar se envía el primer resumen; al desactivar, el servidor borra lo que tenía.
    require('../license/guardian')._tick().catch(() => {});
    res.json({ activo: resumenWeb.activo(userDataDir) });
  });

  // ── Actualizaciones de la app (solo con sesión iniciada) ──
  const versionInstalada = require('electron').app?.getVersion?.() || '';
  app.get('/api/app/actualizacion', sesion.requerirSesion, (_req, res) => {
    res.json(appHooks.actualizador ? appHooks.actualizador.estado() : { versionActual: versionInstalada, disponible: null, descargada: null, descargando: false, progreso: 0, soloEnInstalada: true });
  });
  app.post('/api/app/buscar-actualizacion', sesion.requerirSesion, async (_req, res) => {
    if (!appHooks.actualizador) return res.json({ resultado: 'no-disponible', versionActual: versionInstalada });
    res.json(await appHooks.actualizador.buscarManual());
  });
  app.post('/api/app/actualizar', sesion.requerirSesion, (_req, res) => {
    const ok = !!appHooks.actualizador?.instalarAhora();
    res.status(ok ? 200 : 409).json({ ok, error: ok ? undefined : 'No hay ninguna actualización lista para instalar.' });
  });
  app.use('/api/sync', require('./routes/sync.routes')(deps));
  app.get('/api/license/estado', (_req, res) => res.json({ ...guardian.estado(), activacion: sesion.estado().errorActivacion }));
  // "Usar este equipo": desactiva el otro y activa este (el usuario ya confirmó en pantalla).
  app.post('/api/license/reemplazar', (req, res) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'No auth token' });
    sesion.validar(m[1], { reemplazar: true })
      .then(() => res.json({ ok: true }))
      .catch((err) => res.status(err.status || 500).json({ error: err.message }));
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', modo: 'escritorio', ts: new Date().toISOString() }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No disponible en la versión de escritorio' }));

  // ── Frontend ─────────────────────────────────────────────────────
  app.use(express.static(frontendDir));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

  // ── Socket.io: mismo contrato que la plataforma (sala user:<id>) ──
  io.use(async (socket, next) => {
    try {
      const o = socket.handshake.headers.origin;
      if (o && !origenesValidos().has(o)) return next(new Error('Origen no permitido'));
      const s = await sesion.validar(socket.handshake.auth?.token || '');
      socket.userId = String(s.user._id);
      next();
    } catch { next(new Error('Socket: token inválido')); }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    socket.on('join-room', () => {});
  });

  // ── Arranque (puerto fijo; si está ocupado, uno libre) ───────────
  await new Promise((resolve, reject) => {
    const escuchar = (p) => {
      server.once('error', (e) => { if (e.code === 'EADDRINUSE' && p !== 0) escuchar(0); else reject(e); });
      server.listen(p, '127.0.0.1', () => { puerto = server.address().port; resolve(); });
    };
    escuchar(PUERTO_PREFERIDO);
  });

  return {
    puerto,
    emitirAlUsuario,
    emitirATodos: (evento, datos) => io.emit(evento, datos),
    url: `http://127.0.0.1:${puerto}`,
    cerrar: () => { if (mpTimer) clearInterval(mpTimer); io.close(); server.close(); },
  };
}

module.exports = { iniciar };
