// server.js — Akira Cloud Backend
'use strict';

// Suprimir warning de punycode (viene de dependencias internas de Node 18+)
process.noDeprecation = process.env.NODE_ENV === 'production';

require('dotenv').config();

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

const connectDB    = require('./config/db');
const logger       = require('./config/logger');
const botManager   = require('./services/bot.manager');

// ── Importar rutas ──────────────────────────────────────────
const authRoutes   = require('./routes/auth.routes');
const adminRoutes  = require('./routes/admin.routes');
const configRoutes = require('./routes/config.routes');
const botRoutes          = require('./routes/bot.routes');
const subscriptionRoutes = require('./routes/subscription.routes');

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

io.on('connection', (socket) => {
  logger.info(`[Socket] Cliente conectado: ${socket.id}`);

  socket.on('join-room', (userId) => {
    socket.join(`user:${userId}`);
    logger.info(`[Socket] ${socket.id} unido a sala user:${userId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`[Socket] Cliente desconectado: ${socket.id}`);
  });
});

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

// Rate limiting estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login. Intentá en 15 minutos.' },
});

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
app.use(passport.initialize());

// ── Rutas ───────────────────────────────────────────────────
app.use('/api/auth',   authLimiter, authRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/config', configRoutes);
app.use('/api/bot',          botRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    bots: botManager.getActiveCount(),
    ts: new Date().toISOString(),
  });
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

  // Reiniciar bots de usuarios activos al iniciar
  await botManager.restoreActiveBots();
}).catch(err => {
  logger.error('Error conectando a MongoDB:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('[Server] SIGTERM recibido — apagando gracefully...');
  await botManager.stopAllBots();
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };
