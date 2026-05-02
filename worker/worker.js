// worker/worker.js — Akira Worker Local (refactor 2026-04-29)
// ===========================================================
// Nueva arquitectura: el worker SOLO mantiene la conexión a WhatsApp
// (Baileys + sesión filesystem). NO toca MongoDB, NO llama Groq, NO
// tiene lógica de negocio. Todo eso vive en Render.
//
//   Cliente WA → Worker (Baileys) → Backend Render (procesa) → Worker → Cliente WA
//
// Cuando el backend pide arrancar un bot, el worker abre un baileys-runner.
// Cada mensaje entrante se reenvía al backend. El backend responde con
// comandos (enviarTexto, enviarPresence, etc.) que el worker ejecuta.
'use strict';

require('dotenv').config({ path: __dirname + '/.env' });

const { io } = require('socket.io-client');
const path = require('path');
const fs = require('fs');
const https = require('https');

const { crearBaileysRunner } = require('./baileys-runner');

// ── Config ────────────────────────────────────────────────────
const RENDER_URL = process.env.BACKEND_URL || process.env.RENDER_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const SESSIONS_PATH =
  process.env.WA_SESSIONS_PATH || path.resolve(__dirname, '../sessions');

if (!RENDER_URL || !WORKER_SECRET) {
  console.error('[Worker] ❌ Faltan variables: BACKEND_URL, WORKER_SECRET');
  process.exit(1);
}

console.log('[Worker] 🚀 Akira Worker — modo proxy Baileys (sin MongoDB)');
console.log(`[Worker] Backend: ${RENDER_URL}`);
console.log(`[Worker] Sesiones: ${SESSIONS_PATH}`);

// ── Estado ────────────────────────────────────────────────────
const runners = new Map(); // userId → baileys-runner
const arranqueEnCurso = new Set();

// ── DETECCIÓN GLOBAL DE BAD MAC / SESIÓN CORRUPTA ────────────
// libsignal escribe sus errores DIRECTO a stderr/stdout (no pasa por el
// logger de Baileys). Interceptamos console.error para detectarlos.
// Si vemos N "Bad MAC" en M segundos → la sesión está muerta y hay que
// limpiarla + pedir QR nuevo.
const badMacWindow = []; // timestamps de Bad MAC recientes
const BAD_MAC_THRESHOLD = 5;       // 5 errores
const BAD_MAC_WINDOW_MS = 10_000;  // en 10 segundos
let badMacResetEnCurso = false;

const _origConsoleError = console.error.bind(console);
console.error = function (...args) {
  _origConsoleError(...args);
  try {
    const text = args.map(a =>
      typeof a === 'string' ? a : (a?.message || '')
    ).join(' ').toLowerCase();
    if (text.includes('bad mac')) {
      badMacWindow.push(Date.now());
      // Limpiar viejos (> ventana)
      const cutoff = Date.now() - BAD_MAC_WINDOW_MS;
      while (badMacWindow.length && badMacWindow[0] < cutoff) badMacWindow.shift();
      if (badMacWindow.length >= BAD_MAC_THRESHOLD && !badMacResetEnCurso) {
        badMacResetEnCurso = true;
        badMacWindow.length = 0;
        const uids = Array.from(runners.keys());
        _origConsoleError(`[Worker] 🚨 Bad MAC ×${BAD_MAC_THRESHOLD} en ${BAD_MAC_WINDOW_MS / 1000}s — sesión corrupta detectada. Limpiando ${uids.length} bot(s) y pidiendo QR nuevo...`);
        Promise.all(uids.map(async (uid) => {
          try {
            const runner = runners.get(uid);
            if (!runner) return;
            // Borrar carpeta de sesión + detener runner
            const dir = path.join(SESSIONS_PATH, uid);
            try {
              if (fs.existsSync(dir)) {
                for (const f of fs.readdirSync(dir)) {
                  try { fs.unlinkSync(path.join(dir, f)); } catch {}
                }
              }
            } catch {}
            await runner.detener().catch(() => {});
            runners.delete(uid);
            socket.emit('worker:bot-disconnected', {
              userId: uid,
              reason: 'sesión corrupta (Bad MAC) — escaneá un QR nuevo',
              sessionCleared: true,
            });
            socket.emit('worker:bot-log', {
              userId: uid,
              msg: '🚨 Sesión corrupta detectada (Bad MAC). Limpiada automáticamente. Iniciá el bot de nuevo desde el panel para escanear un QR nuevo.',
              ts: new Date().toLocaleTimeString('es-AR'),
            });
          } catch (e) {
            _origConsoleError(`[Worker] Error limpiando ${uid}: ${e.message}`);
          }
        })).finally(() => {
          // Cooldown 30s antes de permitir otra detección
          setTimeout(() => { badMacResetEnCurso = false; }, 30_000);
        });
      }
    }
  } catch {}
};

// ── Keep-alive Backend ────────────────────────────────────────
const PING_INTERVAL_MS = 5 * 60 * 1000;

function pingBackend() {
  try {
    const url = new URL(RENDER_URL);
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
  } catch {}
}

pingBackend();
setInterval(pingBackend, PING_INTERVAL_MS);

// ── Socket.io → Backend ───────────────────────────────────────
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
  console.log(`[Worker] ✅ Conectado a backend (id: ${socket.id})`);
  socket.emit('worker:ready', {
    workerId: 'local-pc',
    bots: runners.size,
    botIds: Array.from(runners.keys()),
    platform: process.platform,
    nodeVersion: process.version,
    mode: 'proxy', // Indicar al backend que es el nuevo modo
  });
  // Auto-restaurar bots con sesión guardada en disco
  setTimeout(() => autoRestaurar(), 1500);
});

socket.on('connect_error', (e) => console.error('[Worker] ❌ connect_error:', e.message));
socket.on('disconnect', (reason) => console.warn('[Worker] ⚠️ Desconectado:', reason));

// ────────────────────────────────────────────────────────────
//  ARRANCAR / DETENER bots
// ────────────────────────────────────────────────────────────
async function iniciarBot(uid) {
  if (runners.has(uid)) {
    console.log(`[Worker] Bot ${uid.slice(-6)} ya está activo`);
    socket.emit('worker:bot-started', { userId: uid });
    return;
  }
  if (arranqueEnCurso.has(uid)) {
    console.log(`[Worker] Bot ${uid.slice(-6)} ya arrancando`);
    return;
  }
  arranqueEnCurso.add(uid);
  try {
    const sessionDir = path.join(SESSIONS_PATH, uid);
    const tag = uid.slice(-6);
    const log = (msg) => {
      console.log(`[Bot:${tag}] ${msg}`);
      socket.emit('worker:bot-log', {
        userId: uid,
        msg,
        ts: new Date().toLocaleTimeString('es-AR'),
      });
    };

    const runner = crearBaileysRunner({
      sessionDir,
      log,
      callbacks: {
        onQR: (qr) => socket.emit('worker:bot-qr', { userId: uid, qr }),
        onReady: () => socket.emit('worker:bot-ready', { userId: uid }),
        onDisconnect: (reason, sessionCleared) => {
          socket.emit('worker:bot-disconnected', {
            userId: uid,
            reason,
            sessionCleared: !!sessionCleared,
          });
        },
        onStopped: ({ sessionCleared }) => {
          runners.delete(uid);
          socket.emit('worker:bot-stopped', { userId: uid, sessionCleared: !!sessionCleared });
        },
        onMessage: (msg) => {
          // Reenviar el mensaje completo al backend para procesar
          socket.emit('worker:msg-incoming', { userId: uid, msg });
        },
        onContactsUpsert: (contacts) => {
          socket.emit('worker:contacts-upsert', { userId: uid, contacts });
        },
        onChatsSet: (chats) => {
          socket.emit('worker:chats-set', { userId: uid, chats });
        },
        onChatsUpsert: (chats) => {
          socket.emit('worker:chats-upsert', { userId: uid, chats });
        },
      },
    });

    runners.set(uid, runner);
    await runner.conectar();
    socket.emit('worker:bot-started', { userId: uid });
    console.log(`[Worker] ✅ Bot ${tag} iniciado`);
  } catch (err) {
    console.error(`[Worker] ❌ Error iniciando ${uid.slice(-6)}: ${err.message}`);
    runners.delete(uid);
    socket.emit('worker:bot-error', { userId: uid, msg: err.message });
  } finally {
    arranqueEnCurso.delete(uid);
  }
}

async function detenerBot(uid) {
  const runner = runners.get(uid);
  if (!runner) {
    console.log(`[Worker] Bot ${uid.slice(-6)} ya detenido`);
    return;
  }
  try {
    await runner.detener();
  } catch (e) {
    console.warn(`[Worker] Error deteniendo ${uid.slice(-6)}: ${e.message}`);
  }
  runners.delete(uid);
}

// ────────────────────────────────────────────────────────────
//  COMANDOS DEL BACKEND
// ────────────────────────────────────────────────────────────

// Backend pide arrancar el bot (ya no manda credenciales — backend procesa todo)
socket.on('worker:start-bot', async ({ userId }) => {
  const uid = String(userId);
  console.log(`[Worker] → start-bot ${uid.slice(-6)}`);
  await iniciarBot(uid);
});

socket.on('worker:stop-bot', async ({ userId }) => {
  const uid = String(userId);
  console.log(`[Worker] → stop-bot ${uid.slice(-6)}`);
  await detenerBot(uid);
});

socket.on('worker:panic-stop', async ({ userId }) => {
  const uid = String(userId);
  await detenerBot(uid);
});

// ── Comandos para EJECUTAR Baileys (vienen del backend) ─────
// Patrón request/response: cada uno tiene un `reqId`. El backend usa
// socket.emit con callback para recibir el resultado.
socket.on('worker:exec-send-text', async ({ userId, jid, texto, reqId }, ack) => {
  const runner = runners.get(String(userId));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return socket.emit('worker:exec-result', { reqId, ok: false, error: 'bot_no_activo' });
  }
  const r = await runner.enviarTexto(jid, texto);
  if (typeof ack === 'function') ack(r);
  socket.emit('worker:exec-result', { reqId, ...r });
});

socket.on('worker:exec-send-audio', async ({ userId, jid, bufferBase64, reqId }, ack) => {
  const runner = runners.get(String(userId));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return socket.emit('worker:exec-result', { reqId, ok: false, error: 'bot_no_activo' });
  }
  const r = await runner.enviarAudio(jid, bufferBase64);
  if (typeof ack === 'function') ack(r);
  socket.emit('worker:exec-result', { reqId, ...r });
});

socket.on('worker:exec-presence', async ({ userId, estado, jid, reqId }, ack) => {
  const runner = runners.get(String(userId));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return;
  }
  const r = await runner.enviarPresence(estado, jid);
  if (typeof ack === 'function') ack(r);
});

socket.on('worker:exec-get-catalog', async ({ userId, opts, reqId }, ack) => {
  const runner = runners.get(String(userId));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return socket.emit('worker:exec-result', { reqId, ok: false, error: 'bot_no_activo' });
  }
  const r = await runner.getCatalog(opts || {});
  if (typeof ack === 'function') ack(r);
  socket.emit('worker:exec-result', { reqId, ...r });
});

socket.on('worker:exec-download-media', async ({ userId, msg, reqId }, ack) => {
  const runner = runners.get(String(userId));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return socket.emit('worker:exec-result', { reqId, ok: false, error: 'bot_no_activo' });
  }
  const r = await runner.descargarMedia(msg);
  if (typeof ack === 'function') ack(r);
  socket.emit('worker:exec-result', { reqId, ...r });
});

// ────────────────────────────────────────────────────────────
//  AUTO-RESTAURAR
// ────────────────────────────────────────────────────────────
async function autoRestaurar() {
  let dirs = [];
  try {
    dirs = await fs.promises.readdir(SESSIONS_PATH, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('[Worker] No existe carpeta de sesiones, nada para restaurar.');
      return;
    }
    console.error('[Worker] Error leyendo sesiones:', e.message);
    return;
  }

  const uids = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const credsPath = path.join(SESSIONS_PATH, d.name, 'creds.json');
    try {
      await fs.promises.access(credsPath, fs.constants.R_OK);
      uids.push(d.name);
    } catch {}
  }
  if (uids.length === 0) {
    console.log('[Worker] No hay bots con sesión guardada.');
    return;
  }
  console.log(`[Worker] 🔄 Auto-restaurando ${uids.length} bot(s)...`);
  for (let i = 0; i < uids.length; i++) {
    const uid = uids[i];
    if (runners.has(uid) || arranqueEnCurso.has(uid)) continue;
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    console.log(`[Worker] ▶ ${i + 1}/${uids.length} ${uid.slice(-6)}`);
    try {
      await iniciarBot(uid);
    } catch (e) {
      console.error(`[Worker] ❌ Auto-iniciando ${uid.slice(-6)}: ${e.message}`);
    }
  }
}

// ── Graceful shutdown ─────────────────────────────────────────
async function shutdown() {
  console.log('\n[Worker] Apagando — deteniendo bots...');
  for (const [uid, runner] of runners.entries()) {
    try { await runner.detener(); } catch {}
  }
  runners.clear();
  socket.disconnect();
  console.log('[Worker] ✅ Apagado limpio.');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
