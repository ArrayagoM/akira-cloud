// worker/worker.js — Akira Worker Local
// Corre en tu PC (que siempre está encendida).
// Se conecta al servidor en Render via Socket.io y ejecuta todos los bots ahí.
'use strict';

require('dotenv').config({ path: __dirname + '/.env' });

const { io } = require('socket.io-client');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const https = require('https');

// 🔥 LA SOLUCIÓN AL CONGELAMIENTO 24/7 (Desactiva la cola de espera de Mongoose globalmente)
mongoose.set('bufferCommands', false);
// 15s: más generoso para Atlas free tier desde Argentina (latencia ~200-400ms + cold start)
// Con 3s fallaba la inicialización y dejaba la cache RAM vacía → bot silencioso
mongoose.set('bufferTimeoutMS', 15000);

// ── Config ────────────────────────────────────────────────────
// BACKEND_URL: en Railway es http://localhost:5000 (mismo contenedor)
//              en PC local es la URL de Render o el backend local
const RENDER_URL = process.env.BACKEND_URL || process.env.RENDER_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const SESSIONS_PATH = process.env.WA_SESSIONS_PATH || path.resolve(__dirname, '../sessions');

if (!RENDER_URL || !WORKER_SECRET || !MONGO_URI) {
  console.error('[Worker] ❌ Faltan variables: RENDER_URL, WORKER_SECRET, MONGO_URI');
  process.exit(1);
}

if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 16) {
  console.error('[Worker] ❌ Falta ENCRYPTION_KEY en el .env (min 16 caracteres)');
  process.exit(1);
}

// ── Modelos ────────────────────────────────────────────────────
const User = require('../backend/models/User');
const Config = require('../backend/models/Config');
const Log = require('../backend/models/Log');
const WAAuth = require('../backend/models/WAAuth');

// ── Keep-alive Backend ─────────────────────────────────────────
// En Railway el backend NO se duerme, pero el ping sirve para detectar
// desconexiones tempranas y loguear uptime del sistema.
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

function pingBackend() {
  try {
    const url = new URL(RENDER_URL); // sigue leyendo RENDER_URL — renombralo a BACKEND_URL en Railway
    const mod = url.protocol === 'https:' ? https : require('http');
    const options = {
      hostname: url.hostname,
      path: '/api/health',
      method: 'GET',
      headers: { 'User-Agent': 'AkiraWorker/keepalive', Connection: 'close' },
      timeout: 8000,
    };
    const req = mod.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode !== 200)
          console.warn(`[Worker] ⚠️ Backend health: ${res.statusCode}`);
      });
    });
    req.on('error', () => {});
    req.setTimeout(8000, () => req.destroy());
    req.end();
  } catch (e) {
    // silencioso — el socket.io maneja la reconexión
  }
}

pingBackend();
setInterval(pingBackend, PING_INTERVAL_MS);

const crearAkiraBot = require('../backend/services/akira.bot');

// ── Estado ────────────────────────────────────────────────────
const instancias = new Map(); // userId → bot
const arranqueEnCurso = new Set();
let isRestoring = false; // Candado para evitar bucles de reconexión

// ── MongoDB ───────────────────────────────────────────────────
// Opciones compartidas entre el connect inicial y las reconexiones forzadas.
const MONGO_OPTS = {
  maxPoolSize: 20,
  minPoolSize: 2,
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
  family: 4,
};

mongoose
  .connect(MONGO_URI, MONGO_OPTS)
  .then(() => {
    console.log('[Worker] ✅ MongoDB conectado');
  })
  .catch((e) => {
    console.error('[Worker] ⚠️ MongoDB no conectó al arranque:', e.message);
    console.warn('[Worker] El worker continuará igual — usará cache local para los bots.');
    // NO exit: queremos que el worker arranque los bots aunque Mongo esté caído
  });

// Auto-restaurar bots desde filesystem INMEDIATAMENTE, sin esperar a Mongo.
// Damos 2 segundos para que Mongo tenga chance de conectar (si va a conectar),
// para que el primer arranque use datos frescos si puede.
setTimeout(() => {
  if (instancias.size === 0) {
    autoRestaurarConRetry();
  }
}, 2000);

// Monitorear reconexiones de MongoDB para detectar problemas temprano
mongoose.connection.on('disconnected', () => {
  console.warn('[Worker] ⚠️ MongoDB desconectado — esperando reconexión automática...');
});
mongoose.connection.on('reconnected', () => {
  console.log('[Worker] ✅ MongoDB reconectado');
});
mongoose.connection.on('error', (err) => {
  console.error('[Worker] ❌ MongoDB error:', err.message);
});

// ── Forzar reconexión completa de MongoDB ─────────────────────
// Se usa cuando las queries fallan con "buffering timed out" a pesar
// de que readyState reporta conectado (conexión TCP stale/zombie).
let reconexionEnCurso = false;
async function forzarReconexionMongo() {
  if (reconexionEnCurso) {
    // Ya hay una reconexión en curso — esperar a que termine
    while (reconexionEnCurso) {
      await new Promise((r) => setTimeout(r, 500));
    }
    return;
  }
  reconexionEnCurso = true;
  try {
    console.warn('[Worker] 🔄 Forzando reconexión completa a MongoDB...');
    try {
      await mongoose.disconnect();
    } catch (e) {
      console.warn('[Worker] ⚠️ Error en disconnect (ignorado):', e.message);
    }
    await mongoose.connect(MONGO_URI, MONGO_OPTS);
    console.log('[Worker] ✅ MongoDB reconectado exitosamente (forzado)');
  } finally {
    reconexionEnCurso = false;
  }
}

// ── Verificar que MongoDB responda a queries REALES de Mongoose ──
// No basta con ping() del driver: Mongoose puede seguir buffering aunque
// el driver responda. Hacemos una query real y si falla, forzamos reconexión.
// Usamos estimatedDocumentCount() porque pasa por el pipeline de Mongoose
// (detecta buffering) pero no tiene problemas de casteo como findOne({_id:'...'}).
async function esperarMongo(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let ultimoError = null;

  while (Date.now() < deadline) {
    try {
      if (mongoose.connection.readyState === 1) {
        // Timeout más generoso (10s en vez de 4s) para Atlas con latencia alta
        await User.estimatedDocumentCount().maxTimeMS(10000).exec();
        return; // éxito: Mongoose responde
      } else {
        ultimoError = new Error(`readyState=${mongoose.connection.readyState}`);
      }
    } catch (err) {
      ultimoError = err;
      const msg = String(err?.message || '').toLowerCase();
      const esBuffering = msg.includes('buffering') || msg.includes('timed out');

      console.warn(`[Worker] ⚠️ Healthcheck MongoDB falló: ${err.message}`);
      if (esBuffering) {
        try {
          await forzarReconexionMongo();
        } catch (e) {
          console.error('[Worker] ❌ Error forzando reconexión:', e.message);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `MongoDB no responde después de ${timeoutMs / 1000}s` +
      (ultimoError ? ` (último error: ${ultimoError.message})` : '')
  );
}

// ── Keep-alive MongoDB ────────────────────────────────────────
// Estrategia: usar admin.ping() (driver-level, ~1ms en vez de ~segundos)
// para no falsear timeouts en Atlas free tier desde Argentina.
// Solo forzamos reconexión después de 5 fallos consecutivos (~25 min) y
// solo si la query real (estimatedDocumentCount) confirma el problema.
const MONGO_KEEPALIVE_MS = 5 * 60 * 1000;
let mongoKeepAliveFailCount = 0;
setInterval(async () => {
  try {
    const rs = mongoose.connection.readyState;
    if (rs === 0) {
      // readyState=0 = completamente desconectado.
      // Mongoose 6+ NO reconecta solo después de un fallo inicial — hay que forzarlo.
      if (!reconexionEnCurso) {
        console.warn('[Worker] 🔄 MongoDB readyState=0 — forzando reconexión...');
        forzarReconexionMongo().catch(() => {});
      }
      return;
    }
    if (rs !== 1) {
      // readyState=2 (connecting) o 3 (disconnecting) — esperar
      return;
    }
    // 1) Ping ligero al admin (driver-level, microsegundos)
    await mongoose.connection.db.admin().ping();
    mongoKeepAliveFailCount = 0; // éxito → reset
  } catch (e) {
    mongoKeepAliveFailCount++;
    // Tras varios fallos consecutivos, confirmar con una query real antes de reconectar
    if (mongoKeepAliveFailCount >= 5) {
      console.warn(
        `[Worker] ⚠️ Keep-alive: ${mongoKeepAliveFailCount} pings fallidos consecutivos — verificando con query real`,
      );
      try {
        await User.estimatedDocumentCount().maxTimeMS(10000).exec();
        // Query real funcionó → falsa alarma del ping
        console.log('[Worker] ✅ Query real OK — falsa alarma, no reconecto');
        mongoKeepAliveFailCount = 0;
      } catch (qErr) {
        const msg = String(qErr?.message || '').toLowerCase();
        if (msg.includes('buffering') || msg.includes('timed out') || msg.includes('disconnect')) {
          console.warn(
            `[Worker] ⚠️ Query real también falla (${qErr.message}) — forzando reconexión`,
          );
          mongoKeepAliveFailCount = 0;
          forzarReconexionMongo().catch(() => {});
        } else {
          // Otro tipo de error — log pero no reconectar
          console.warn(`[Worker] ⚠️ Error inesperado en query real: ${qErr.message}`);
        }
      }
    }
  }
}, MONGO_KEEPALIVE_MS);

// ── Socket.io → Render ───────────────────────────────────────
const socketUrl = RENDER_URL.replace(/\/$/, '');
const socket = io(`${socketUrl}/worker`, {
  path: '/socket.io',
  auth: { secret: WORKER_SECRET, role: 'worker' },
  reconnection: true,
  reconnectionDelay: 3000,
  reconnectionDelayMax: 10000,
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log(`[Worker] ✅ Conectado a ${RENDER_URL} (id: ${socket.id})`);
  socket.emit('worker:ready', {
    workerId: 'local-pc',
    bots: instancias.size,
    botIds: Array.from(instancias.keys()),
    platform: process.platform,
    nodeVersion: process.version,
  });
});

socket.on('connect_error', (e) => console.error('[Worker] ❌ Error de conexión:', e.message));
socket.on('disconnect', (reason) => console.warn('[Worker] ⚠️ Desconectado del servidor:', reason));

// ────────────────────────────────────────────────────────────
//  INICIAR BOT LOCAL
// ────────────────────────────────────────────────────────────
// El worker NO toca MongoDB para arrancar bots. Las credenciales vienen
// pre-cargadas desde el backend en Render (que tiene Mongo estable) a través
// del evento 'worker:start-bot', o desde el cache local en disco si el
// backend no las mandó (ej. auto-restauración al arranque).
async function iniciarBotLocal(uid, credencialesRemotas = null) {
  if (instancias.has(uid)) return;
  if (arranqueEnCurso.has(uid)) return;

  arranqueEnCurso.add(uid);
  try {
    // Directorios SIEMPRE — antes de tocar nada
    const sessionDir = path.resolve(SESSIONS_PATH, uid);
    const dataDir = path.resolve(SESSIONS_PATH, uid, 'data');
    await fs.promises.mkdir(sessionDir, { recursive: true });
    await fs.promises.mkdir(dataDir, { recursive: true });

    const cachePath = path.join(sessionDir, '_credentials.cache.json');

    let credenciales = null;
    let fuenteDatos = null;

    // ── Fuente 1: credenciales pre-cargadas desde el backend ────
    if (credencialesRemotas && typeof credencialesRemotas === 'object') {
      credenciales = { ...credencialesRemotas };
      fuenteDatos = 'backend (socket.io)';

      // Escribir credentials.json de Google si vino en el payload
      if (credenciales._GOOGLE_CREDENTIALS_JSON) {
        try {
          JSON.parse(credenciales._GOOGLE_CREDENTIALS_JSON);
          await fs.promises.writeFile(
            path.join(dataDir, 'credentials.json'),
            credenciales._GOOGLE_CREDENTIALS_JSON,
            'utf8'
          );
        } catch (e) {
          console.warn(`[Worker] Credenciales Google inválidas para ${uid}: ${e.message}`);
        }
        delete credenciales._GOOGLE_CREDENTIALS_JSON;
      }

      // Guardar cache para auto-restauración futura
      try {
        await fs.promises.writeFile(
          cachePath,
          JSON.stringify({ credenciales, savedAt: new Date().toISOString() }, null, 2),
          'utf8'
        );
      } catch (e) {
        console.warn(`[Worker] ⚠️ No se pudo guardar cache: ${e.message}`);
      }
    } else {
      // ── Fuente 2: cache local en disco ────────────────────────
      // Usado en auto-restauración al arrancar el worker, cuando no hay
      // backend emitiendo start-bot (los bots se levantan desde disco).
      try {
        const raw = await fs.promises.readFile(cachePath, 'utf8');
        const parsed = JSON.parse(raw);
        credenciales = parsed.credenciales || parsed;
        fuenteDatos = `cache local (${parsed.savedAt || 'desconocido'})`;
      } catch (cacheErr) {
        throw new Error(
          `Sin credenciales para ${uid}: no vinieron en el payload y no hay cache local. ` +
            `Iniciá el bot desde el dashboard (eso dispara start-bot con credenciales).`
        );
      }
    }

    if (!credenciales) throw new Error('No se pudieron cargar credenciales');
    if (!credenciales.GROQ_API_KEY) throw new Error('GROQ API Key no configurada');

    // El puerto se reasigna siempre, no se cachea
    credenciales.PORT = String(asignarPuerto(uid));

    console.log(`[Worker] 📦 Credenciales cargadas para ${uid} desde: ${fuenteDatos}`);

    const bot = crearAkiraBot(credenciales, dataDir, sessionDir, uid);
    instancias.set(uid, bot);

    // ── Eventos del bot → servidor ────────────────────────────
    bot.on('log', (msg) => {
      // También loguear localmente → visible en `pm2 logs worker`
      console.log(`[Bot:${uid.slice(-6)}] ${msg}`);
      socket.emit('worker:bot-log', {
        userId: uid,
        msg,
        ts: new Date().toLocaleTimeString('es-AR'),
      });
    },
    );
    bot.on('qr', (qr) => socket.emit('worker:bot-qr', { userId: uid, qr }));
    bot.on('ready', () => socket.emit('worker:bot-ready', { userId: uid }));
    bot.on('disconnected', (reason) =>
      socket.emit('worker:bot-disconnected', { userId: uid, reason }),
    );
    bot.on('error', (err) => socket.emit('worker:bot-error', { userId: uid, msg: err.message }));
    bot.on('stopped', async (data) => {
      instancias.delete(uid);
      liberarPuerto(uid);
      socket.emit('worker:bot-stopped', { userId: uid, sessionCleared: !!data?.sessionCleared });
      await User.findByIdAndUpdate(uid, { botActivo: false, botConectado: false }).catch(() => {});
    });

    // ── Catálogo ──────────────────────────────────────────────
    bot.on('catalog:update', async (catalogo) => {
      try {
        const waProds = catalogo.filter((p) => p.fuente === 'wa_catalog');
        const cfg = await Config.findOne({ userId: uid });
        const manuales = (cfg?.catalogo || []).filter((p) => p.fuente !== 'wa_catalog');
        const merged = [...waProds, ...manuales];
        await Config.findOneAndUpdate(
          { userId: uid },
          { $set: { catalogo: merged } },
          { upsert: true },
        );
        socket.emit('worker:catalog-synced', {
          userId: uid,
          count: waProds.length,
          total: merged.length,
        });
      } catch (e) {
        console.warn(`[Worker] Error guardando catálogo ${uid}:`, e.message);
      }
    });

    bot.on('catalog:candidate', async (producto) => {
      try {
        await Config.findOneAndUpdate(
          { userId: uid },
          { $push: { catalogo: { ...producto, disponible: true, fuente: 'status' } } },
        );
        socket.emit('worker:catalog-new-product', { userId: uid, product: producto });
      } catch (e) {
        console.warn(`[Worker] Error guardando candidato catálogo ${uid}:`, e.message);
      }
    });

    await bot.iniciar();
    // Actualizar estado en background — NO bloquear el bot si Mongo tarda
    User.findByIdAndUpdate(uid, { botActivo: true }).catch((e) =>
      console.warn(`[Worker] ⚠️ No se pudo marcar botActivo en DB (no bloqueante): ${e.message}`)
    );
    Log.registrar({
      userId: uid,
      tipo: 'bot_start',
      mensaje: 'Bot iniciado (worker local)',
    }).catch(() => {});
    socket.emit('worker:bot-started', { userId: uid });
    console.log(`[Worker] ✅ Bot iniciado exitosamente: ${uid}`);
  } catch (err) {
    console.error(`[Worker] ❌ Error iniciando ${uid}:`, err.message);
    instancias.delete(uid);
    liberarPuerto(uid);
    socket.emit('worker:bot-error', { userId: uid, msg: err.message });
    await User.findByIdAndUpdate(uid, { botActivo: false, botConectado: false }).catch(() => {});
  } finally {
    arranqueEnCurso.delete(uid);
  }
}

// ────────────────────────────────────────────────────────────
//  AUTO-RESTAURAR BOTS
// ────────────────────────────────────────────────────────────
async function autoRestaurarConRetry(intento = 0) {
  if (isRestoring) return;
  isRestoring = true;

  const MAX_INTENTOS = 3;
  const DELAY_RETRY = [5000, 10000, 20000];
  try {
    await autoRestaurarBots();
    isRestoring = false;
  } catch (e) {
    console.error(
      `[Worker] ❌ Error auto-restaurando (intento ${intento + 1}/${MAX_INTENTOS}): ${e.message}`,
    );
    if (intento < MAX_INTENTOS - 1) {
      setTimeout(() => {
        isRestoring = false;
        autoRestaurarConRetry(intento + 1);
      }, DELAY_RETRY[intento]);
    } else {
      isRestoring = false;
    }
  }
}

async function autoRestaurarBots() {
  // Escaneamos el filesystem local para encontrar qué bots tienen sesión guardada.
  // Antes consultábamos MongoDB (wa_auth collection), pero ahora las sesiones
  // viven en disco, así que este método es infinitamente más confiable y no
  // depende de que MongoDB esté vivo.
  let dirs = [];
  try {
    dirs = await fs.promises.readdir(SESSIONS_PATH, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('[Worker] No existe carpeta de sesiones aún, nada para restaurar.');
      return;
    }
    throw e;
  }

  const aRestaurar = [];
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const uid = dirent.name;
    // Un session dir es válido si tiene creds.json (el archivo que escribe Baileys)
    const credsPath = path.join(SESSIONS_PATH, uid, 'creds.json');
    try {
      await fs.promises.access(credsPath, fs.constants.R_OK);
      aRestaurar.push(uid);
    } catch {
      // no tiene creds.json → bot sin vincular → saltar
    }
  }

  if (!aRestaurar.length) {
    return console.log('[Worker] No hay bots con sesión guardada en disco.');
  }

  console.log(
    `[Worker] 🔄 Auto-restaurando ${aRestaurar.length} bot(s) con sesión guardada en disco...`
  );

  for (let i = 0; i < aRestaurar.length; i++) {
    const uid = aRestaurar[i];
    if (instancias.has(uid) || arranqueEnCurso.has(uid)) continue;

    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    console.log(`[Worker] ▶ Auto-iniciando bot ${uid} (${i + 1}/${aRestaurar.length})`);
    try {
      await iniciarBotLocal(uid);
    } catch (err) {
      console.error(`[Worker] ❌ Error auto-iniciando ${uid}: ${err.message}`);
      // NO propagar: si un bot falla, seguimos con el resto
    }
  }

  console.log(`[Worker] ✅ Auto-restauración completada.`);
}

// ── Comandos desde el servidor ────────────────────────────────
socket.on('worker:start-bot', async ({ userId, credenciales }) => {
  const uid = String(userId);
  console.log(
    `[Worker] → Arrancar bot ${uid}${credenciales ? ' (con credenciales del backend)' : ' (sin payload)'}`
  );
  try {
    await iniciarBotLocal(uid, credenciales || null);
  } catch (err) {
    console.error(`[Worker] ❌ Error iniciando ${uid}: ${err.message}`);
    socket.emit('worker:bot-error', { userId: uid, msg: err.message });
  }
});

socket.on('worker:stop-bot', async ({ userId }) => {
  const uid = String(userId);
  console.log(`[Worker] → Detener bot ${uid}`);
  const bot = instancias.get(uid);
  if (!bot) return socket.emit('worker:bot-error', { userId: uid, msg: 'Bot no activo' });
  try {
    await bot.detener();
    instancias.delete(uid);
    liberarPuerto(uid);
    await User.findByIdAndUpdate(uid, { botActivo: false, botConectado: false });
    await Log.registrar({
      userId: uid,
      tipo: 'bot_stop',
      mensaje: 'Bot detenido (worker local)',
    }).catch(() => {});
  } catch (err) {
    console.error(`[Worker] ❌ Error deteniendo ${uid}:`, err.message);
    instancias.delete(uid);
    liberarPuerto(uid);
  }
});

socket.on('worker:panic-stop', async ({ userId, motivo }) => {
  const uid = String(userId);
  const bot = instancias.get(uid);
  if (bot)
    try {
      await bot.detener();
    } catch {}
  instancias.delete(uid);
  liberarPuerto(uid);
  await User.findByIdAndUpdate(uid, {
    status: 'bloqueado',
    botActivo: false,
    botConectado: false,
    bloqueadoPor: motivo,
  }).catch(() => {});
});

socket.on('worker:catalog-sync', ({ userId }) => {
  const bot = instancias.get(String(userId));
  if (bot) bot.emit('catalog:sync');
});

socket.on('worker:config-reload', ({ userId }) => {
  const bot = instancias.get(String(userId));
  if (bot) bot.emit('config:reload');
});

socket.on('worker:set-pausa', ({ userId, modoPausa }) => {
  const uid = String(userId);
  const bot = instancias.get(uid);
  if (bot) {
    bot.emit('config:patch', { modoPausa: !!modoPausa });
    console.log(`[Worker:${uid.slice(-6)}] modoPausa → ${!!modoPausa}`);
  }
});

socket.on('worker:calendar-reload', ({ userId }) => {
  const bot = instancias.get(String(userId));
  if (bot) bot.emit('calendar:reload');
});

// ── Puerto determinístico ─────────────────────────────────────
const PUERTO_BASE = 3100;
const puertosEnUso = new Set();
const puertosAsignados = new Map();

function asignarPuerto(uid) {
  if (puertosAsignados.has(uid)) return puertosAsignados.get(uid);
  let p = PUERTO_BASE;
  while (puertosEnUso.has(p)) p++;
  puertosEnUso.add(p);
  puertosAsignados.set(uid, p);
  return p;
}

function liberarPuerto(uid) {
  const p = puertosAsignados.get(uid);
  if (p !== undefined) {
    puertosEnUso.delete(p);
    puertosAsignados.delete(uid);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────
async function shutdown() {
  console.log('\n[Worker] Apagando — deteniendo bots...');
  const uids = Array.from(instancias.keys());
  for (const uid of uids) {
    try {
      await instancias.get(uid)?.detener();
    } catch {}
    await User.findByIdAndUpdate(uid, { botActivo: false, botConectado: false }).catch(() => {});
  }
  socket.disconnect();
  await mongoose.disconnect();
  console.log('[Worker] ✅ Apagado limpio.');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);