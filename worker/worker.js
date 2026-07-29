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
const { instKey, sessionDirName, parseSessionDirName } = require('./lib/instkey');

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
// Todos estos Maps se indexan por instKey = "userId:slot" (ver lib/instkey.js),
// NO por userId solo. Un mismo usuario puede tener varias cuentas de WhatsApp
// activas en paralelo (plan Agencia, slot 0-4) y cada una necesita su propia
// entrada — de lo contrario la segunda pisa a la primera y solo responde una.
const runners = new Map(); // instKey → baileys-runner
const arranqueEnCurso = new Set(); // instKey

// Cache de último chats.set y contacts.upsert por instKey.
// Permite re-enviar al backend cuando reconecta sin que Baileys vuelva a disparar el evento.
const lastChatsSet      = new Map(); // instKey → chats[]
const lastContactsUpsert = new Map(); // instKey → contacts[]

// Nota: NO interceptamos console.error para Bad MAC. Esos errores son
// frecuentes y NORMALES en Signal Protocol (cada vez que un contacto
// nuevo manda mensaje, la primera tentativa de descifrado puede fallar y
// después Baileys renegocia las claves). Solo si la sesión está realmente
// muerta los reintentos se acumulan, y eso lo maneja el handler interno
// de Baileys (loggedOut/badSession en connection.update).
// Si querés limpiar manualmente: pm2 stop worker && rm -rf sessions/<uid>/ && pm2 start worker

// ── Keep-alive Backend (ping cada 4min para que Render no duerma) ──
// Render free-tier duerme tras 15min sin tráfico. Con 4min tenemos margen.
const PING_INTERVAL_MS = 4 * 60 * 1000;
let _backendOkConsecutivos = 0;

function pingBackend() {
  try {
    const url = new URL(RENDER_URL);
    const mod = url.protocol === 'https:' ? https : require('http');
    const options = {
      hostname: url.hostname,
      path: '/api/health',
      method: 'GET',
      headers: { 'User-Agent': 'AkiraWorker/keepalive', Connection: 'close' },
      timeout: 12000,
    };
    const req = mod.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) {
          _backendOkConsecutivos++;
          // Solo loguear cada 10 pings exitosos (cada ~40min) para no llenar logs
          if (_backendOkConsecutivos % 10 === 0)
            console.log(`[Worker] 💓 Backend OK (×${_backendOkConsecutivos})`);
        } else {
          _backendOkConsecutivos = 0;
          console.warn(`[Worker] ⚠️ Backend health: ${res.statusCode}`);
        }
      });
    });
    req.on('error', () => { _backendOkConsecutivos = 0; });
    req.setTimeout(12000, () => req.destroy());
    req.end();
  } catch {}
}

pingBackend();
setInterval(pingBackend, PING_INTERVAL_MS);

// ── Socket.io → Backend ───────────────────────────────────────
// reconnectionDelayMax: 45000 — Render puede tardar hasta 30-40s en despertar
// del sleep. Con 45s de espera máxima nos aseguramos de no desconectarnos
// permanentemente cuando el backend reinicia.
const socketUrl = RENDER_URL.replace(/\/$/, '');
const socket = io(`${socketUrl}/worker`, {
  path: '/socket.io',
  auth: { secret: WORKER_SECRET, role: 'worker' },
  reconnection: true,
  reconnectionDelay: 3000,
  reconnectionDelayMax: 45000,   // era 10s — Render puede tardar 30-40s en despertar
  reconnectionAttempts: Infinity, // nunca dejar de intentar
  transports: ['websocket'],
});

// Estado para detectar reconexión real (no primer connect)
let _conectadoAlgezVez = false;

socket.on('connect', () => {
  const esReconexion = _conectadoAlgezVez;
  _conectadoAlgezVez = true;
  console.log(`[Worker] ✅ ${esReconexion ? 'Re' : 'C'}onectado a backend (id: ${socket.id})`);
  socket.emit('worker:ready', {
    workerId: 'local-pc',
    bots: runners.size,
    botIds: Array.from(runners.keys()),
    platform: process.platform,
    nodeVersion: process.version,
    mode: 'proxy',
  });
  // En reconexión: si ya tenemos bots corriendo, no re-arrancar (siguen activos).
  // Si no hay bots activos (p.ej. el worker también se reinició), auto-restaurar.
  const delay = esReconexion ? 3000 : 1500;
  setTimeout(() => {
    if (runners.size === 0) autoRestaurar();
    else console.log(`[Worker] 🔄 Reconectado con ${runners.size} bot(s) ya activos — no hace falta restaurar`);
  }, delay);
});

socket.on('connect_error', (e) => console.error('[Worker] ❌ connect_error:', e.message));
socket.on('disconnect', (reason) => {
  console.warn(`[Worker] ⚠️ Desconectado: ${reason}`);
  // Los bots WA siguen corriendo aunque perdamos conexión con el backend.
  // Los mensajes entrantes se acumularán brevemente en Baileys y se reenviarán
  // cuando se reestablezca el socket.
  if (runners.size > 0)
    console.log(`[Worker] ℹ️ ${runners.size} bot(s) WA siguen activos mientras se reconecta`);
});

// ────────────────────────────────────────────────────────────
//  ARRANCAR / DETENER bots
// ────────────────────────────────────────────────────────────
async function iniciarBot(uid, slot = 0) {
  const k = instKey(uid, slot);
  const tagBase = `${uid.slice(-6)}${slot ? `:${slot}` : ''}`;

  if (runners.has(k)) {
    console.log(`[Worker] Bot ${tagBase} ya está activo`);
    // Emitir bot-started Y bot-ready: el backend puede estar reconectando y necesita
    // ambos eventos para que el proxy registre el estado "conectado" y empiece a
    // procesar mensajes. Sin bot-ready, connection.update:open nunca llega al motor
    // del bot y los mensajes entrantes se ignoran silenciosamente.
    socket.emit('worker:bot-started', { userId: uid, slot });
    socket.emit('worker:bot-ready', { userId: uid, slot });

    // Re-enviar chats y contacts cacheados: el backend puede haberse reiniciado
    // y perdió el chats.set original (Baileys solo lo dispara una vez al conectar).
    // Sin esto, el panel de Chats queda vacío hasta la próxima reconexión de WhatsApp.
    const cachedChats    = lastChatsSet.get(k);
    const cachedContacts = lastContactsUpsert.get(k);
    if (cachedContacts?.length || cachedChats?.length) {
      setTimeout(() => {
        if (cachedContacts?.length) {
          console.log(`[Worker] Bot ${tagBase} — re-enviando ${cachedContacts.length} contactos al backend (reconexión)`);
          socket.emit('worker:contacts-upsert', { userId: uid, slot, contacts: cachedContacts });
        }
        if (cachedChats?.length) {
          console.log(`[Worker] Bot ${tagBase} — re-enviando ${cachedChats.length} chats al backend (reconexión)`);
          socket.emit('worker:chats-set', { userId: uid, slot, chats: cachedChats });
        }
      }, 3000); // 3s delay — dar tiempo al backend para crear y registrar el proxy
    }
    return;
  }
  if (arranqueEnCurso.has(k)) {
    console.log(`[Worker] Bot ${tagBase} ya arrancando`);
    return;
  }
  arranqueEnCurso.add(k);
  try {
    const sessionDir = path.join(SESSIONS_PATH, sessionDirName(uid, slot));
    const tag = tagBase;
    const log = (msg) => {
      console.log(`[Bot:${tag}] ${msg}`);
      socket.emit('worker:bot-log', {
        userId: uid,
        slot,
        msg,
        ts: new Date().toLocaleTimeString('es-AR'),
      });
    };

    const runner = crearBaileysRunner({
      sessionDir,
      log,
      callbacks: {
        onQR: (qr) => socket.emit('worker:bot-qr', { userId: uid, slot, qr }),
        onReady: () => socket.emit('worker:bot-ready', { userId: uid, slot }),
        onDisconnect: (reason, sessionCleared) => {
          socket.emit('worker:bot-disconnected', {
            userId: uid,
            slot,
            reason,
            sessionCleared: !!sessionCleared,
          });
        },
        onStopped: ({ sessionCleared }) => {
          runners.delete(k);
          socket.emit('worker:bot-stopped', { userId: uid, slot, sessionCleared: !!sessionCleared });
        },
        onMessage: (msg) => {
          // Reenviar el mensaje completo al backend para procesar
          socket.emit('worker:msg-incoming', { userId: uid, slot, msg });
        },
        onContactsUpsert: (contacts) => {
          // Guardar en cache para re-enviar si el backend reconecta
          if (contacts?.length) lastContactsUpsert.set(k, contacts);
          socket.emit('worker:contacts-upsert', { userId: uid, slot, contacts });
        },
        onChatsSet: (chats) => {
          // Guardar en cache para re-enviar si el backend reconecta
          if (chats?.length) lastChatsSet.set(k, chats);
          socket.emit('worker:chats-set', { userId: uid, slot, chats });
        },
        onChatsUpsert: (chats) => {
          socket.emit('worker:chats-upsert', { userId: uid, slot, chats });
        },
      },
    });

    runners.set(k, runner);
    await runner.conectar();
    socket.emit('worker:bot-started', { userId: uid, slot });
    console.log(`[Worker] ✅ Bot ${tag} iniciado`);
  } catch (err) {
    console.error(`[Worker] ❌ Error iniciando ${tagBase}: ${err.message}`);
    runners.delete(k);
    socket.emit('worker:bot-error', { userId: uid, slot, msg: err.message });
  } finally {
    arranqueEnCurso.delete(k);
  }
}

async function detenerBot(uid, slot = 0) {
  const k = instKey(uid, slot);
  const runner = runners.get(k);
  if (!runner) {
    console.log(`[Worker] Bot ${uid.slice(-6)}${slot ? `:${slot}` : ''} ya detenido`);
    return;
  }
  try {
    await runner.detener();
  } catch (e) {
    console.warn(`[Worker] Error deteniendo ${uid.slice(-6)}${slot ? `:${slot}` : ''}: ${e.message}`);
  }
  runners.delete(k);
}

// ────────────────────────────────────────────────────────────
//  COMANDOS DEL BACKEND
// ────────────────────────────────────────────────────────────

// Backend pide arrancar el bot (ya no manda credenciales — backend procesa todo)
socket.on('worker:start-bot', async ({ userId, slot }) => {
  const uid = String(userId);
  const s = parseInt(slot, 10) || 0;
  console.log(`[Worker] → start-bot ${uid.slice(-6)}${s ? `:${s}` : ''}`);
  await iniciarBot(uid, s);
});

socket.on('worker:stop-bot', async ({ userId, slot }) => {
  const uid = String(userId);
  const s = parseInt(slot, 10) || 0;
  console.log(`[Worker] → stop-bot ${uid.slice(-6)}${s ? `:${s}` : ''}`);
  await detenerBot(uid, s);
});

// Pánico: detiene TODOS los slots de este usuario, no solo uno — el botón de
// pánico bloquea la cuenta entera, no una sola cuenta de WhatsApp.
socket.on('worker:panic-stop', async ({ userId }) => {
  const uid = String(userId);
  const keys = Array.from(runners.keys()).filter((k) => k.startsWith(`${uid}:`));
  for (const k of keys) {
    const idx = k.lastIndexOf(':');
    const s = idx === -1 ? 0 : parseInt(k.slice(idx + 1), 10) || 0;
    await detenerBot(uid, s);
  }
});

// ── Comandos para EJECUTAR Baileys (vienen del backend) ─────
// Patrón request/response: cada uno tiene un `reqId`. El backend usa
// socket.emit con callback para recibir el resultado.
socket.on('worker:exec-send-text', async ({ userId, slot, jid, texto, reqId }, ack) => {
  const runner = runners.get(instKey(userId, slot));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return socket.emit('worker:exec-result', { reqId, ok: false, error: 'bot_no_activo' });
  }
  const r = await runner.enviarTexto(jid, texto);
  if (typeof ack === 'function') ack(r);
  socket.emit('worker:exec-result', { reqId, ...r });
});

socket.on('worker:exec-send-audio', async ({ userId, slot, jid, bufferBase64, reqId }, ack) => {
  const runner = runners.get(instKey(userId, slot));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return socket.emit('worker:exec-result', { reqId, ok: false, error: 'bot_no_activo' });
  }
  const r = await runner.enviarAudio(jid, bufferBase64);
  if (typeof ack === 'function') ack(r);
  socket.emit('worker:exec-result', { reqId, ...r });
});

socket.on('worker:exec-presence', async ({ userId, slot, estado, jid, reqId }, ack) => {
  const runner = runners.get(instKey(userId, slot));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return;
  }
  const r = await runner.enviarPresence(estado, jid);
  if (typeof ack === 'function') ack(r);
});

socket.on('worker:exec-get-catalog', async ({ userId, slot, opts, reqId }, ack) => {
  const runner = runners.get(instKey(userId, slot));
  if (!runner) {
    if (typeof ack === 'function') ack({ ok: false, error: 'bot_no_activo' });
    return socket.emit('worker:exec-result', { reqId, ok: false, error: 'bot_no_activo' });
  }
  const r = await runner.getCatalog(opts || {});
  if (typeof ack === 'function') ack(r);
  socket.emit('worker:exec-result', { reqId, ...r });
});

socket.on('worker:exec-download-media', async ({ userId, slot, msg, reqId }, ack) => {
  const runner = runners.get(instKey(userId, slot));
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

  // Cada carpeta de sesión es "uid" (slot 0) o "uid_slotN" (slot N) — parseamos
  // el nombre para reconstruir (uid, slot) y así restaurar TODAS las cuentas de
  // WhatsApp guardadas, no solo la principal.
  const entries = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const credsPath = path.join(SESSIONS_PATH, d.name, 'creds.json');
    try {
      await fs.promises.access(credsPath, fs.constants.R_OK);
      entries.push(parseSessionDirName(d.name));
    } catch {}
  }
  if (entries.length === 0) {
    console.log('[Worker] No hay bots con sesión guardada.');
    return;
  }
  console.log(`[Worker] 🔄 Auto-restaurando ${entries.length} bot(s)...`);
  for (let i = 0; i < entries.length; i++) {
    const { uid, slot } = entries[i];
    const k = instKey(uid, slot);
    if (runners.has(k) || arranqueEnCurso.has(k)) continue;
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));
    console.log(`[Worker] ▶ ${i + 1}/${entries.length} ${uid.slice(-6)}${slot ? `:${slot}` : ''}`);
    try {
      await iniciarBot(uid, slot);
    } catch (e) {
      console.error(`[Worker] ❌ Auto-iniciando ${uid.slice(-6)}${slot ? `:${slot}` : ''}: ${e.message}`);
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
