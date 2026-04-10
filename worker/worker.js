// worker/worker.js — Akira Worker Local
// Corre en tu PC (que siempre está encendida).
// Se conecta al servidor en Render via Socket.io y ejecuta todos los bots ahí.
// El servidor queda liviano; toda la carga pesada (WhatsApp, IA, Calendar) va acá.
'use strict';

require('dotenv').config({ path: __dirname + '/.env' });

const { io }      = require('socket.io-client');
const mongoose    = require('mongoose');
const path        = require('path');
const fs          = require('fs');
const https       = require('https');

// ── Config ────────────────────────────────────────────────────
const RENDER_URL    = process.env.RENDER_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const MONGO_URI     = process.env.MONGO_URI;
const SESSIONS_PATH = process.env.WA_SESSIONS_PATH || path.resolve(__dirname, '../sessions');

if (!RENDER_URL || !WORKER_SECRET || !MONGO_URI) {
  console.error('[Worker] ❌ Faltan variables: RENDER_URL, WORKER_SECRET, MONGO_URI');
  process.exit(1);
}

if (!process.env.ENCRYPTION_KEY) {
  console.error('[Worker] ❌ Falta ENCRYPTION_KEY en el .env — necesaria para descifrar API keys');
  process.exit(1);
}
if (process.env.ENCRYPTION_KEY.length < 16) {
  console.error('[Worker] ❌ ENCRYPTION_KEY debe tener al menos 16 caracteres');
  process.exit(1);
}

// ── Modelos ────────────────────────────────────────────────────
const User   = require('../backend/models/User');
const Config = require('../backend/models/Config');
const Log    = require('../backend/models/Log');
const WAAuth = require('../backend/models/WAAuth');

// ── Keep-alive Render: ping periódico para que no se duerma ──
// Render free tier suspende el servicio tras 15 min de inactividad.
const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutos

function pingRender() {
  try {
    const url     = new URL(RENDER_URL);
    const options = {
      hostname: url.hostname,
      path:     '/api/health',
      method:   'GET',
      headers:  { 'User-Agent': 'AkiraWorker/keepalive', Connection: 'close' },
    };
    const req = https.request(options, (res) => {
      console.log(`[Worker] 💓 Keep-alive Render → ${res.statusCode}`);
      res.resume();
    });
    req.on('error', () => {});
    req.end();
  } catch (e) {
    console.warn('[Worker] ⚠️ Keep-alive error:', e.message);
  }
}

// Ping inmediato al arrancar para despertar Render + periódico cada 14 min
pingRender();
setInterval(pingRender, PING_INTERVAL_MS);

const crearAkiraBot = require('../backend/services/akira.bot');

// ── Estado ────────────────────────────────────────────────────
const instancias       = new Map(); // userId → bot
const arranqueEnCurso  = new Set();

// ── MongoDB ───────────────────────────────────────────────────
// bufferTimeoutMS default es 10s — muy corto si Atlas/red es lenta
mongoose.set('bufferTimeoutMS', 30000);
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS:          45000,
  connectTimeoutMS:         30000,
}).then(() => console.log('[Worker] ✅ MongoDB conectado'))
  .catch(e => { console.error('[Worker] ❌ MongoDB:', e.message); process.exit(1); });

// Helper: esperar a que MongoDB esté REALMENTE listo (no solo readyState)
// Hace un ping real para verificar que la conexión funciona
async function esperarMongo(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  // Primero: esperar que Mongoose reporte connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connection.asPromise().catch(() => {});
  }
  // Segundo: verificar con un ping real que la DB responde
  while (Date.now() < deadline) {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
        return; // ✅ Conexión verificada con ping real
      }
    } catch (e) {
      // Ping falló — esperar y reintentar
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('MongoDB no responde después de ' + (timeoutMs / 1000) + 's');
}

// ── Socket.io → Render (namespace /worker) ───────────────────
// El namespace raíz / requiere JWT (para el frontend).
// El worker usa el namespace /worker que autentica con WORKER_SECRET.
const socketUrl = RENDER_URL.replace(/\/$/, '');
const socket = io(`${socketUrl}/worker`, {
  path:               '/socket.io',
  auth:               { secret: WORKER_SECRET, role: 'worker' },
  reconnection:       true,
  reconnectionDelay:  3000,
  reconnectionDelayMax: 10000,
  transports:         ['websocket'],
});

socket.on('connect', () => {
  console.log(`[Worker] ✅ Conectado a ${RENDER_URL} (id: ${socket.id})`);
  socket.emit('worker:ready', {
    workerId:   'local-pc',
    bots:       instancias.size,
    botIds:     Array.from(instancias.keys()),
    platform:   process.platform,
    nodeVersion: process.version,
  });

  // ── Auto-restaurar bots si no hay ninguno corriendo ─────────
  // El servidor pudo haber arrancado antes que el worker, dejando
  // los bots en Render (lento/limitado) o sin arrancar.
  // El worker toma control: consulta MongoDB y arranca directamente.
  if (instancias.size === 0) {
    autoRestaurarConRetry();
  }
});

socket.on('connect_error', (e) => {
  console.error('[Worker] ❌ Error de conexión:', e.message);
});

socket.on('disconnect', (reason) => {
  console.warn('[Worker] ⚠️ Desconectado del servidor:', reason);
});

// ────────────────────────────────────────────────────────────
//  INICIAR BOT LOCAL — lógica reutilizable
// ────────────────────────────────────────────────────────────
async function iniciarBotLocal(uid) {
  if (instancias.has(uid)) return;
  if (arranqueEnCurso.has(uid)) return;

  arranqueEnCurso.add(uid);
  try {
    const [user, config] = await Promise.all([
      User.findById(uid),
      Config.findOne({ userId: uid }),
    ]);

    if (!user)  throw new Error('Usuario no encontrado');
    if (user.status === 'bloqueado') throw new Error('Cuenta bloqueada');
    if (!config || !config.estaCompleta()) throw new Error('Configuración incompleta — cargá la Groq API Key primero');
    if (!user.planVigente()) throw new Error('Plan vencido — renovar suscripción');

    const credenciales = {
      GROQ_API_KEY:              config.getKey('keyGroq'),
      MP_ACCESS_TOKEN:           config.getKey('keyMP')      || '',
      CALENDAR_ID:               config.getKey('idCalendar') || '',
      RIME_API_KEY:              config.getKey('keyRime')    || '',
      NGROK_AUTH_TOKEN:          config.getKey('keyNgrok')   || '',
      NGROK_DOMAIN:              config.dominioNgrok         || '',
      MI_NOMBRE:                 config.miNombre,
      NEGOCIO:                   config.negocio,
      SERVICIOS:                 config.servicios,
      PRECIO_TURNO:              String(config.precioTurno),
      HORAS_MINIMAS_CANCELACION: String(config.horasCancelacion),
      PROMPT_PERSONALIZADO:      config.promptPersonalizado  || '',
      ALIAS_TRANSFERENCIA:       config.aliasTransferencia   || '',
      CBU_TRANSFERENCIA:         config.cbuTransferencia      || '',
      BANCO_TRANSFERENCIA:       config.bancoTransferencia    || '',
      SERVICIOS_LIST:            JSON.stringify(config.serviciosList        || []),
      HORARIOS_ATENCION:         JSON.stringify(config.horariosAtencion     || {}),
      DIAS_BLOQUEADOS:           JSON.stringify(config.diasBloqueados       || []),
      MODO_PAUSA:                String(config.modoPausa                    || false),
      CELULAR_NOTIFICACIONES:    config.celularNotificaciones               || '',
      TIPO_NEGOCIO:              config.tipoNegocio    || 'turnos',
      CHECK_IN_HORA:             config.checkInHora    || '14:00',
      CHECK_OUT_HORA:            config.checkOutHora   || '10:00',
      MINIMA_ESTADIA:            String(config.minimaEstadia  || 1),
      UNIDADES_ALOJAMIENTO:      JSON.stringify(config.unidadesAlojamiento  || []),
      DIRECCION_PROPIEDAD:       config.direccionPropiedad   || '',
      LINK_UBICACION:            config.linkUbicacion        || '',
      CATALOGO:                  JSON.stringify(config.catalogo             || []),
      PORT:                      String(asignarPuerto(uid)),
    };

    if (!credenciales.GROQ_API_KEY) throw new Error('GROQ API Key no configurada');

    // Directorios aislados por usuario
    const sessionDir = path.resolve(SESSIONS_PATH, uid);
    const dataDir    = path.resolve(SESSIONS_PATH, uid, 'data');
    [sessionDir, dataDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

    // Google Calendar — tokens OAuth (prioridad sobre service account)
    const hasStoredTokens = !!config.googleCalendarTokens?.encrypted;
    const googleTokens    = hasStoredTokens ? config.getKey('googleCalendarTokens') : null;
    console.log(`[Worker] Calendar tokens en DB: ${hasStoredTokens} | descifrados: ${!!googleTokens}`);
    if (googleTokens) {
      credenciales.GOOGLE_CALENDAR_TOKENS = googleTokens;
      credenciales.GOOGLE_EMAIL           = config.googleEmail || '';
    } else if (hasStoredTokens) {
      console.error('[Worker] ❌ ENCRYPTION_KEY del worker no coincide con la de Render — Google Calendar no funcionará. Copiá la misma ENCRYPTION_KEY de Render al worker/.env');
    }

    // Google Calendar — service account (fallback)
    const credGoogle = config.credentialsGoogleB64?.encrypted ? config.getKey('credentialsGoogleB64') : null;
    if (credGoogle) {
      try {
        JSON.parse(credGoogle);
        fs.writeFileSync(path.join(dataDir, 'credentials.json'), credGoogle, 'utf8');
      } catch (e) {
        console.warn(`[Worker] Credenciales Google inválidas para ${uid} — Calendar desactivado:`, e.message);
      }
    }

    const bot = crearAkiraBot(credenciales, dataDir, sessionDir, uid);
    instancias.set(uid, bot);

    // ── Eventos del bot → servidor ────────────────────────────
    bot.on('log',          msg    => socket.emit('worker:bot-log',          { userId: uid, msg, ts: new Date().toLocaleTimeString('es-AR') }));
    bot.on('qr',           qr     => socket.emit('worker:bot-qr',           { userId: uid, qr }));
    bot.on('ready',        ()     => socket.emit('worker:bot-ready',        { userId: uid }));
    bot.on('disconnected', reason => socket.emit('worker:bot-disconnected', { userId: uid, reason }));
    bot.on('error',        err    => socket.emit('worker:bot-error',        { userId: uid, msg: err.message }));
    bot.on('stopped', (data) => {
      instancias.delete(uid);
      liberarPuerto(uid);
      socket.emit('worker:bot-stopped', { userId: uid, sessionCleared: !!(data?.sessionCleared) });
    });

    // ── Catálogo: guardar en DB y notificar al frontend ───────
    bot.on('catalog:update', async (catalogo) => {
      try {
        const waProds  = catalogo.filter(p => p.fuente === 'wa_catalog');
        const cfg      = await Config.findOne({ userId: uid });
        const manuales = (cfg?.catalogo || []).filter(p => p.fuente !== 'wa_catalog');
        const merged   = [...waProds, ...manuales];
        await Config.findOneAndUpdate({ userId: uid }, { $set: { catalogo: merged } }, { upsert: true });
        socket.emit('worker:catalog-synced', { userId: uid, count: waProds.length, total: merged.length });
        console.log(`[Worker] ✅ Catálogo guardado para ${uid}: ${waProds.length} WA + ${manuales.length} manuales`);
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
    await User.findByIdAndUpdate(uid, { botActivo: true });
    await Log.registrar({ userId: uid, tipo: 'bot_start', mensaje: 'Bot iniciado (worker local)' });
    socket.emit('worker:bot-started', { userId: uid });
    console.log(`[Worker] ✅ Bot iniciado: ${uid}`);

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
//  AUTO-RESTAURAR BOTS AL CONECTARSE
//  Consulta MongoDB directamente — no depende de que el servidor
//  envíe comandos. El worker es autónomo.
// ────────────────────────────────────────────────────────────
async function autoRestaurarConRetry(intento = 0) {
  const MAX_INTENTOS = 3;
  const DELAY_RETRY  = [5000, 10000, 20000]; // 5s, 10s, 20s
  try {
    await autoRestaurarBots();
  } catch (e) {
    console.error(`[Worker] ❌ Error auto-restaurando (intento ${intento + 1}/${MAX_INTENTOS}): ${e.message}`);
    if (intento < MAX_INTENTOS - 1) {
      const delay = DELAY_RETRY[intento] || 20000;
      console.log(`[Worker] Reintentando en ${delay / 1000}s...`);
      setTimeout(() => autoRestaurarConRetry(intento + 1), delay);
    } else {
      console.error('[Worker] ❌ No se pudieron restaurar los bots después de ' + MAX_INTENTOS + ' intentos.');
      console.log('[Worker] Podés iniciar bots manualmente desde el dashboard.');
    }
  }
}

async function autoRestaurarBots() {
  // Esperar a que MongoDB esté verdaderamente conectado
  console.log('[Worker] Esperando conexión MongoDB...');
  await esperarMongo(30000);
  console.log('[Worker] MongoDB listo — consultando bots activos...');

  // Usar driver raw de MongoDB (bypass Mongoose buffering que causa timeouts)
  const db = mongoose.connection.db;
  const usuariosRaw = await db.collection('users')
    .find({ botActivo: true, status: 'activo' }, { projection: { _id: 1 } })
    .maxTimeMS(20000)
    .toArray();

  const usuarios = usuariosRaw.map(u => ({ _id: u._id }));
  if (!usuarios.length) {
    console.log('[Worker] No hay bots activos para restaurar.');
    return;
  }

  // Filtrar solo los que tienen sesión WA guardada en MongoDB
  const sesionesRaw = await db.collection('wa_auth').distinct('_id');
  const uidsConSesion = new Set(sesionesRaw.map(sid => String(sid).split(':')[0]));
  const aRestaurar = usuarios.filter(u => uidsConSesion.has(u._id.toString()));

  if (!aRestaurar.length) {
    console.log('[Worker] Hay bots activos pero ninguno tiene sesión WA guardada.');
    return;
  }

  console.log(`[Worker] 🔄 Auto-restaurando ${aRestaurar.length} bot(s) con sesión guardada...`);

  for (let i = 0; i < aRestaurar.length; i++) {
    const uid = aRestaurar[i]._id.toString();
    if (instancias.has(uid) || arranqueEnCurso.has(uid)) continue;

    // Stagger: 3s entre bots para no saturar WhatsApp ni MongoDB
    if (i > 0) await new Promise(r => setTimeout(r, 3000));

    console.log(`[Worker] ▶ Auto-iniciando bot ${uid} (${i + 1}/${aRestaurar.length})`);
    await iniciarBotLocal(uid);
  }

  console.log(`[Worker] ✅ Auto-restauración completada — ${instancias.size} bot(s) activo(s)`);
}

// ── Comandos desde el servidor ────────────────────────────────

socket.on('worker:start-bot', async ({ userId }) => {
  const uid = String(userId);
  console.log(`[Worker] → Arrancar bot ${uid} (comando del servidor)`);
  await iniciarBotLocal(uid);
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
    await Log.registrar({ userId: uid, tipo: 'bot_stop', mensaje: 'Bot detenido (worker local)' });
  } catch (err) {
    console.error(`[Worker] ❌ Error deteniendo ${uid}:`, err.message);
    instancias.delete(uid);
    liberarPuerto(uid);
  }
});

socket.on('worker:panic-stop', async ({ userId, motivo }) => {
  const uid = String(userId);
  console.warn(`[Worker] 🚨 PÁNICO para ${uid}: ${motivo}`);
  const bot = instancias.get(uid);
  if (bot) { try { await bot.detener(); } catch {} }
  instancias.delete(uid);
  liberarPuerto(uid);
  await User.findByIdAndUpdate(uid, { status: 'bloqueado', botActivo: false, botConectado: false, bloqueadoPor: motivo }).catch(() => {});
  await Log.registrar({ userId: uid, tipo: 'security_block', nivel: 'critical', mensaje: `Pánico desde worker: ${motivo}` }).catch(() => {});
});

socket.on('worker:catalog-sync', ({ userId }) => {
  const uid = String(userId);
  const bot = instancias.get(uid);
  if (!bot) {
    console.warn(`[Worker] catalog-sync: bot ${uid} no activo`);
    return;
  }
  console.log(`[Worker] 🔄 Sync catálogo solicitado para ${uid}`);
  bot.emit('catalog:sync');
});

socket.on('worker:calendar-reload', ({ userId }) => {
  const uid = String(userId);
  const bot = instancias.get(uid);
  if (bot) bot.emit('calendar:reload');
});

// ── Puerto determinístico (mismo lógica que bot.manager) ───────
const PUERTO_BASE      = 3100;
const puertosEnUso     = new Set();
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
  if (p !== undefined) { puertosEnUso.delete(p); puertosAsignados.delete(uid); }
}

// ── Graceful shutdown ─────────────────────────────────────────
async function shutdown() {
  console.log('\n[Worker] Apagando — deteniendo bots...');
  const uids = Array.from(instancias.keys());
  await Promise.allSettled(uids.map(async uid => {
    try { await instancias.get(uid)?.detener(); } catch {}
    await User.findByIdAndUpdate(uid, { botActivo: false, botConectado: false }).catch(() => {});
  }));
  socket.disconnect();
  await mongoose.disconnect();
  console.log('[Worker] ✅ Apagado limpio.');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
