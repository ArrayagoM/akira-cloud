// app.js — Akira Cloud, backend de escritorio (licencias + auth + suscripción)
// Express app pura (sin listen/server.js) para poder envolverla tanto en
// api/index.js (Vercel, serverless-http) como en local-dev.js (desarrollo
// local con `npm run dev`).
'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const passport = require('passport');

const connectMongo = require('./lib/mongo');
const logger = require('./config/logger');

require('./config/passport')(passport);

const authRoutes = require('./routes/auth.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const licensesRoutes = require('./routes/licenses.routes');
const botGateRoutes = require('./routes/bot-gate.routes');
const syncRoutes = require('./routes/sync.routes');
const desktopRoutes = require('./routes/desktop.routes');
const adminRoutes = require('./routes/admin.routes');
const supportRoutes = require('./routes/support.routes');
const suggestionsRoutes = require('./routes/suggestions.routes');
const demoRoutes = require('./routes/demo.routes');
const googleRoutes = require('./routes/google.routes');

const app = express();

app.set('trust proxy', 1);

// Detrás de serverless-http no hay socket real, así que req.ip de Express
// queda undefined y express-rate-limit tira ERR_ERL_UNDEFINED_IP_ADDRESS
// (y la petición se cuelga). Vercel pone la IP real del cliente en
// x-vercel-forwarded-for (la fija la plataforma, el cliente no puede
// falsificarla) — se usa esa, con x-forwarded-for como respaldo.
app.use((req, _res, next) => {
  const h = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '';
  const ip = String(h).split(',')[0].trim() || 'desconocida';
  Object.defineProperty(req, 'ip', { value: ip, configurable: true });
  next();
});

app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// Nota: express-rate-limit usa un store en memoria por instancia — en
// serverless cada cold start arranca en cero. Es una degradación aceptada
// para el MVP (ver Fase 1 del plan); si hace falta rate-limit estricto entre
// invocaciones, migrar a un store externo (ej. Upstash Redis, gratis en
// tier chico) más adelante.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'Demasiadas solicitudes. Intentá en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login. Intentá en 15 minutos.' },
  skip: (req) => /\/(google|facebook)/.test(req.path),
  validate: { trustProxy: false, xForwardedForHeader: false },
});

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://akiracloud.lat',
  'https://www.akiracloud.lat',
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // apps de escritorio / curl / Postman no mandan Origin
      const ok = allowedOrigins.some((o) => origin === o || origin.startsWith(o));
      if (ok) return cb(null, true);
      logger.warn(`[CORS] Origen bloqueado: ${origin}`);
      cb(new Error('CORS: origen no permitido'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  }),
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(passport.initialize());

// ── Conexión a Mongo antes de cualquier ruta ─────────────────
// En serverless no hay un "arranque" previo como en server.js — cada
// invocación (fría o no) necesita garantizar la conexión antes de tocar
// un modelo. connectMongo() cachea la conexión real entre invocaciones
// calientes (ver lib/mongo.js).
app.use(async (_req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (err) {
    logger.error('[Mongo] Error de conexión: ' + err.message);
    res.status(503).json({ error: 'Servicio temporalmente no disponible' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/licenses', licensesRoutes);
app.use('/api/bot', botGateRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/desktop', desktopRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/google', googleRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'akira-backend-desktop', ts: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  logger.error(`[Error] ${err.message}`);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
});

module.exports = app;
