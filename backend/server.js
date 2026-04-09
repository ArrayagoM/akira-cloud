// server.js — Akira Cloud Backend
'use strict';

// Node 20+: process.noDeprecation es read-only, se suprime con --no-deprecation en npm start

require('dotenv').config();

// Validar variables de entorno antes de cualquier otra cosa
require('./config/env.validator')();

// ── Manejo global de errores no capturados ───────────────────
// Evita que un error inesperado tire abajo todo el proceso
// PM2 se encarga de reiniciarlo si igual muere
process.on('uncaughtException', (err) => {
  // Intentar loggear antes de morir
  try {
    const logger = require('./config/logger');
    logger.error(`[FATAL] uncaughtException: ${err.message}\n${err.stack}`);
  } catch (_) {
    console.error('[FATAL] uncaughtException:', err);
  }
  try {
    const { enviarAlertaError } = require('./services/email.service');
    enviarAlertaError(`uncaughtException: ${err.message}\n\n${err.stack}`).catch(() => {});
  } catch (_) {}
  // Dar 1 segundo para que el logger escriba, luego salir
  // PM2 reinicia el proceso automáticamente
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  try {
    const logger = require('./config/logger');
    logger.error(`[FATAL] unhandledRejection: ${reason?.message || reason}`);
  } catch (_) {
    console.error('[FATAL] unhandledRejection:', reason);
  }
  // NO salir en rechazo de promesa — solo loggear
  // Salir causaría que un error de red tire el servidor entero
});

const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const compression  = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp          = require('hpp');
const rateLimit    = require('express-rate-limit');
const passport     = require('passport');
const { Server }   = require('socket.io');

const connectDB      = require('./config/db');
const logger         = require('./config/logger');
const botManager     = require('./services/bot.manager');
const workerHandler  = require('./services/worker.handler');

// ── Importar rutas ──────────────────────────────────────────
const authRoutes         = require('./routes/auth.routes');
const adminRoutes        = require('./routes/admin.routes');
const configRoutes       = require('./routes/config.routes');
const botRoutes          = require('./routes/bot.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const turnosRoutes       = require('./routes/turnos.routes');
const supportRoutes      = require('./routes/support.routes');
const suggestionsRoutes  = require('./routes/suggestions.routes');

// ── Passport config ─────────────────────────────────────────
require('./config/passport')(passport);

// ── Crear app ───────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ── Socket.io ───────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Exponer io globalmente para que BotManager pueda emitir eventos
global.io = io;

// ── Namespace /worker para el proceso local del usuario ─────
workerHandler.inicializarWorkerHandler(io);

// ── Socket.io: autenticación por JWT ────────────────────────
const jwt = require('jsonwebtoken');

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Socket: token requerido'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = String(payload.id);
    next();
  } catch {
    next(new Error('Socket: token inválido'));
  }
});

io.on('connection', (socket) => {
  // Unir automáticamente a la sala del usuario autenticado — sin confiar en el cliente
  socket.join(`user:${socket.userId}`);
  logger.info(`[Socket] ${socket.id} → sala user:${socket.userId}`);

  socket.on('disconnect', () => {
    logger.info(`[Socket] Desconectado: ${socket.id}`);
  });

  // Mantener compatibilidad: si el cliente envía join-room, verificar que sea su propio userId
  socket.on('join-room', (userId) => {
    if (String(userId) !== socket.userId) {
      logger.warn(`[Socket] ⚠️ join-room rechazado: ${socket.id} intentó unirse a user:${userId} (es user:${socket.userId})`);
      return;
    }
    // Ya está en la sala, no hacer nada extra
  });
});

// ── Trust proxy (Render usa proxy reverso) ──────────────────
// Necesario para que express-rate-limit identifique IPs reales
app.set('trust proxy', 1);

// ── Middlewares de seguridad ────────────────────────────────
app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());
app.use(compression());

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes. Intentá en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Rate limiting estricto para auth (no aplica a OAuth redirects)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login. Intentá en 15 minutos.' },
  skip: (req) => /\/(google|facebook)/.test(req.path),
});

// CORS — acepta Vercel en prod y localhost en dev
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman / server-to-server
    const ok = allowedOrigins.some(o => origin === o || origin.startsWith(o));
    if (ok) return cb(null, true);
    logger.warn(`[CORS] Origen bloqueado: ${origin}`);
    cb(new Error('CORS: origen no permitido'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use(passport.initialize());

// ── Rutas ───────────────────────────────────────────────────
app.use('/api/auth',         authLimiter, authRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/config',       configRoutes);
app.use('/api/bot',          botRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/turnos',       turnosRoutes);
app.use('/api/support',      supportRoutes);
app.use('/api/suggestions',  suggestionsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    bots:   botManager.getActiveCount(),
    worker: botManager.getWorkerInfo(),
    ts:     new Date().toISOString(),
  });
});

// Trigger manual del healthcheck (solo en production — acceso interno)
app.post('/api/health/check', async (_req, res) => {
  await botManager.ejecutarHealthcheck().catch(() => {});
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── 404 ─────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Error handler global ────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error(`[Error] ${err.message}`, { stack: err.stack });
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
});

// ── Iniciar ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  server.listen(PORT, () => {
    logger.info(`\x1b[32m🚀 Akira Cloud corriendo en puerto ${PORT}\x1b[0m`);
    logger.info(`\x1b[36m📡 WebSocket listo\x1b[0m`);
  });

  // ── Arquitectura híbrida ────────────────────────────────
  // Los bots corren en el worker local (PC del usuario).
  // El servidor solo gestiona API, auth y base de datos.
  // El worker se conecta automáticamente via /worker namespace.
  if (process.env.WORKER_SECRET) {
    logger.info('[Server] 🔌 Modo híbrido activo — esperando conexión del worker local');
    logger.info('[Server]    Iniciá el worker en tu PC: cd worker && npm start');
    // En modo híbrido los bots corren en el worker (que sigue vivo entre deploys).
    // Igual lanzamos restoreActiveBots con delay para cubrir el caso de restart del worker.
    setTimeout(() => botManager.restoreActiveBots().catch(() => {}), 15_000);
  } else {
    logger.warn('[Server] WORKER_SECRET no configurado — los bots correrán en el servidor');
    logger.warn('[Server] Para arquitectura híbrida: agregá WORKER_SECRET al .env');
    // Restaurar todos los bots cuya sesión WA está guardada en MongoDB.
    // No necesita await — arranca en paralelo mientras el servidor ya atiende requests.
    botManager.restoreActiveBots().catch(e => logger.error('[Server] restoreActiveBots:', e.message));
  }
}).catch(err => {
  logger.error('Error conectando a MongoDB:', err);
  process.exit(1);
});

// ── Graceful shutdown (SIGTERM = PM2 stop/reload, SIGINT = Ctrl+C dev) ──
async function gracefulShutdown(signal) {
  logger.info(`[Server] ${signal} recibido — apagando gracefully...`);
  try {
    // shutdownGracioso: cierra los sockets de Baileys SIN tocar botActivo en DB.
    // Así el próximo arranque puede restaurar todos los bots automáticamente.
    await botManager.shutdownGracioso();
  } catch (e) {
    logger.warn('[Server] Error deteniendo bots:', e.message);
  }
  server.close(() => {
    logger.info('[Server] HTTP server cerrado');
    process.exit(0);
  });
  // Forzar cierre si tarda más de 10s
  setTimeout(() => {
    logger.warn('[Server] Forzando cierre después de 10s');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ── Keep-alive: evitar que Render entre en reposo ─────────────
if (process.env.NODE_ENV === 'production') {
  const PING_URL = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/health`;
  setInterval(async () => {
    try {
      const https = require('https');
      const http  = require('http');
      const mod   = PING_URL.startsWith('https') ? https : http;
      const req   = mod.get(PING_URL, (r) => {
        r.resume(); // consume response body para liberar memoria
        logger.info(`[Keep-alive] ping → ${r.statusCode}`);
      });
      req.setTimeout(10000, () => {
        req.destroy();
        logger.warn('[Keep-alive] timeout — conexión destruida');
      });
      req.on('error', (e) => {
        logger.warn(`[Keep-alive] error: ${e.message}`);
      });
    } catch (e) {
      logger.warn('[Keep-alive] ping failed:', e.message);
    }
  }, 14 * 60 * 1000); // cada 14 minutos
  logger.info('[Keep-alive] ✅ Auto-ping habilitado (cada 14 min)');
}

module.exports = { app, server, io };
