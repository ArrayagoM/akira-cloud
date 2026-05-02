// worker/baileys-runner.js
// Runner Baileys puro — solo conexión WhatsApp + sesión filesystem.
// CERO acceso a MongoDB. CERO Groq. CERO lógica de negocio.
// El backend en Render hace todo el procesamiento; este runner es solo
// el "WhatsApp adapter".
'use strict';

const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');

// ── Mini cache con TTL (sustituye node-cache para evitar dep extra) ──
// Solo provee la API que Baileys necesita: get(key), set(key, value).
function crearTTLCache(defaultTtlSec = 60) {
  const store = new Map(); // key → { value, expiresAt }
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlSec) {
      const ttl = (typeof ttlSec === 'number' ? ttlSec : defaultTtlSec) * 1000;
      store.set(key, { value, expiresAt: Date.now() + ttl });
      // Limpieza simple: si crece mucho, purgar expirados
      if (store.size > 5000) {
        const now = Date.now();
        for (const [k, e] of store.entries()) {
          if (now > e.expiresAt) store.delete(k);
        }
      }
      return true;
    },
    del(key) { return store.delete(key); },
    flushAll() { store.clear(); },
  };
}

/**
 * Crea un runner Baileys.
 * @param {object} opts
 * @param {string} opts.sessionDir - Directorio para guardar las credenciales de WA
 * @param {function} opts.log - Función de log
 * @param {object} opts.callbacks - Callbacks que dispara el runner
 *   - onQR(qr): cuando WA pide escanear un QR
 *   - onReady(): cuando la conexión queda abierta y lista
 *   - onDisconnect(reason): cuando se cierra (incluye sessionCleared boolean si la sesión se invalidó)
 *   - onMessage(msg): por cada mensaje entrante (objeto Baileys completo)
 *   - onContactsUpsert(contacts): contactos
 *   - onChatsSet(chats): lista inicial de chats al conectar
 *   - onChatsUpsert(chats): chats nuevos
 */
function crearBaileysRunner({ sessionDir, log, callbacks = {} }) {
  let sock = null;
  let reconectando = false;
  let reconectarIntentos = 0;
  let tsUltimaConexion = 0;
  let botDetenidoIntencional = false;
  let reconnectTimer = null;
  let watchdogTimer = null;
  let conectandoLock = false;
  let _macErrorCount = 0;
  let _sessionClearScheduled = false;
  let saveCredsRef = null;
  let clearAuthRef = null;

  const msgRetryCounterCache = crearTTLCache(60);
  // msgStore: cache de mensajes enviados para retry de Signal keys
  const msgStore = new Map();

  function emit(name, ...args) {
    try {
      const cb = callbacks[name];
      if (cb) cb(...args);
    } catch (e) {
      log?.(`❌ [BaileysRunner] Error en callback ${name}: ${e?.message}`);
    }
  }

  // ── Conexión ────────────────────────────────────────────────
  async function conectar() {
    if (conectandoLock) {
      log?.('⏸️ [BaileysRunner] conectar() ya en curso — descarto duplicado');
      return;
    }
    conectandoLock = true;
    try {
      await _conectarReal();
    } finally {
      conectandoLock = false;
    }
  }

  async function _conectarReal() {
    if (sock) {
      const prev = sock;
      sock = null;
      try { prev.end(); } catch {}
    }

    // Auth state filesystem
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    const fsAuth = await useMultiFileAuthState(sessionDir);
    const state = fsAuth.state;
    saveCredsRef = fsAuth.saveCreds;
    clearAuthRef = async () => {
      try {
        if (fs.existsSync(sessionDir)) {
          const files = fs.readdirSync(sessionDir);
          for (const f of files) {
            try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
          }
        }
      } catch (e) {
        log?.(`⚠️ [BaileysRunner] clearAuth: ${e.message}`);
      }
    };
    log?.(`📂 [BaileysRunner] Auth cargado: ${sessionDir}`);

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = [2, 3000, 0];
    }
    log?.(`[Baileys] Versión WA: ${version.join('.')}`);

    // Logger silencioso con detección de Bad MAC
    const noop = () => {};
    const baileysLogger = {
      level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, fatal: noop,
      error(obj, msgTxt) {
        const text = [
          typeof obj === 'string' ? obj : '',
          obj?.err?.message || obj?.error?.message || '',
          msgTxt || '',
        ].join(' ').toLowerCase();
        if (text.includes('bad mac') || text.includes('bad_mac')) {
          _macErrorCount++;
          if (_macErrorCount >= 2 && !_sessionClearScheduled && !botDetenidoIntencional) {
            _sessionClearScheduled = true;
            log?.(`⚠️ [Baileys] Sesión corrupta (Bad MAC ×${_macErrorCount}) — limpiando`);
            setTimeout(async () => {
              try {
                await clearAuthRef?.();
                emit('onDisconnect', 'sesión corrupta — QR requerido', true);
                await detener('session-cleared');
              } catch (e) {
                log?.(`❌ [BaileysRunner] clear bad mac: ${e.message}`);
              }
            }, 2000);
          }
        }
      },
      child() { return this; },
    };

    state.keys = makeCacheableSignalKeyStore(state.keys, baileysLogger);

    sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger,
      printQRInTerminal: false,
      browser: ['Akira Cloud', 'Chrome', '1.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      msgRetryCounterCache,
      maxMsgRetryCount: 5,
      getMessage: async (key) => {
        const stored = msgStore.get(key.id);
        return stored || { conversation: '' };
      },
    });

    // Eventos Baileys → callbacks
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        log?.('📱 QR generado — escaneá con WhatsApp');
        emit('onQR', qr);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const replaced = code === DisconnectReason.connectionReplaced;
        const badSession = code === DisconnectReason.badSession;
        log?.(`⚠️ Desconectado (código: ${code ?? 'undefined'})${loggedOut ? ' — sesión cerrada' : replaced ? ' — reemplazado' : badSession ? ' — sesión corrupta' : ''}`);

        if (loggedOut || replaced || badSession) {
          await clearAuthRef?.().catch(() => {});
          emit('onDisconnect', `código: ${code ?? 'undefined'}`, true);
          log?.('🗑️ Sesión eliminada — iniciá el bot de nuevo para escanear QR.');
          await detener('session-cleared');
          return;
        }

        reconectarIntentos++;
        const tiempoDesdeConexion = Date.now() - tsUltimaConexion;
        const esCicloRapido = tiempoDesdeConexion < 120_000;

        if (code === undefined && esCicloRapido && reconectarIntentos >= 3) {
          log?.(`🗑️ Sesión inválida (${reconectarIntentos} desconexiones rápidas) — limpiando`);
          await clearAuthRef?.().catch(() => {});
          reconectarIntentos = 0;
          emit('onDisconnect', 'sesión inválida — QR requerido', true);
          await detener('session-cleared');
          return;
        }

        if (reconectarIntentos >= 10) {
          log?.('❌ 10 intentos de reconexión fallidos — limpiando sesión');
          await clearAuthRef?.().catch(() => {});
          reconectarIntentos = 0;
          emit('onDisconnect', 'demasiados intentos — QR requerido', true);
          await detener('session-cleared');
          return;
        }

        reconectando = false;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

        if (sock !== null) {
          reconectando = true;
          const delay = Math.min(5000 * reconectarIntentos, 30_000);
          log?.(`🔄 Reconectando en ${delay / 1000}s... (intento ${reconectarIntentos})`);
          reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            reconectando = false;
            if (botDetenidoIntencional || sock === null) return;
            try { await conectar(); } catch (e) {
              log?.(`❌ Error al reconectar: ${e.message}`);
            }
          }, delay);
        }
      }
      if (connection === 'open') {
        reconectarIntentos = 0;
        _macErrorCount = 0;
        _sessionClearScheduled = false;
        tsUltimaConexion = Date.now();
        log?.('✅ WhatsApp conectado y listo');
        iniciarWatchdog();
        emit('onReady');
      }
    });

    sock.ev.on('creds.update', () => {
      saveCredsRef?.().catch((e) => log?.(`⚠️ creds.update: ${e?.message}`));
    });

    sock.ev.on('contacts.upsert', (contacts) => emit('onContactsUpsert', contacts));
    sock.ev.on('chats.set', ({ chats }) => emit('onChatsSet', chats));
    sock.ev.on('chats.upsert', (chats) => emit('onChatsUpsert', chats));

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      // Cachear TODOS los mensajes con contenido (entrantes y salientes).
      // Baileys los pide via getMessage() para reintento de Signal Protocol
      // cuando hay Bad MAC. Antes solo guardábamos los fromMe — guardar también
      // los entrantes ayuda a recuperar mensajes corruptos.
      if (type === 'append' || type === 'notify') {
        for (const m of messages) {
          if (m.key?.id && m.message) {
            msgStore.set(m.key.id, m.message);
            // Limpiar cache si crece mucho (FIFO simple)
            if (msgStore.size > 1000) {
              const keys = Array.from(msgStore.keys());
              for (let i = 0; i < 400; i++) msgStore.delete(keys[i]);
            }
          }
        }
      }
      if (type !== 'notify') return;
      for (const msg of messages) emit('onMessage', msg);
    });
  }

  // ── Watchdog: ping cada 2min, reconecta si falla 3 veces seguidas ─
  let watchdogPingFallos = 0;
  function iniciarWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogPingFallos = 0;
    watchdogTimer = setInterval(() => {
      try {
        if (!sock || botDetenidoIntencional) return;
        if (sock.ws && typeof sock.ws.ping === 'function') {
          try {
            sock.ws.ping();
            if (watchdogPingFallos > 0) {
              log?.(`✅ [Watchdog] Ping recuperado tras ${watchdogPingFallos} fallo(s)`);
            }
            watchdogPingFallos = 0;
          } catch (pingErr) {
            watchdogPingFallos++;
            log?.(`⚠️ [Watchdog] Ping falló x${watchdogPingFallos} (${pingErr.message})`);
            if (watchdogPingFallos >= 3) {
              log?.('⚠️ [Watchdog] 3 pings fallidos — forzando reconexión');
              watchdogPingFallos = 0;
              detenerWatchdog();
              if (!reconectando) {
                try { sock.end(new Error('watchdog_ping_fail')); } catch {}
              }
            }
          }
        }
      } catch (e) {
        log?.(`❌ [Watchdog] Error: ${e.message}`);
      }
    }, 2 * 60 * 1000);
  }

  function detenerWatchdog() {
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  }

  // ── API pública ────────────────────────────────────────────
  async function enviarTexto(jid, texto) {
    if (!sock) return { ok: false, error: 'sock_null' };
    try {
      const sent = await sock.sendMessage(jid, { text: String(texto) });
      if (sent?.key?.id && sent?.message) msgStore.set(sent.key.id, sent.message);
      return { ok: true, id: sent?.key?.id };
    } catch (e) {
      log?.(`⚠️ [BaileysRunner] enviarTexto a ${jid} (1er intento): ${e.message}`);
      // Reintento tras 1.2s
      await new Promise((r) => setTimeout(r, 1200));
      if (!sock) return { ok: false, error: 'sock_lost_on_retry' };
      try {
        const sent2 = await sock.sendMessage(jid, { text: String(texto) });
        if (sent2?.key?.id && sent2?.message) msgStore.set(sent2.key.id, sent2.message);
        return { ok: true, id: sent2?.key?.id, retried: true };
      } catch (e2) {
        log?.(`❌ [BaileysRunner] enviarTexto reintento falló: ${e2.message}`);
        return { ok: false, error: e2.message };
      }
    }
  }

  async function enviarAudio(jid, bufferBase64) {
    if (!sock) return { ok: false, error: 'sock_null' };
    try {
      const buffer = Buffer.from(bufferBase64, 'base64');
      const sent = await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
      return { ok: true, id: sent?.key?.id };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function enviarPresence(estado, jid) {
    if (!sock) return { ok: false };
    try {
      await sock.sendPresenceUpdate(estado, jid);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async function getCatalog(opts = {}) {
    if (!sock) return { ok: false, error: 'sock_null' };
    if (typeof sock.getCatalog !== 'function') {
      return { ok: false, error: 'getCatalog no disponible' };
    }
    try {
      const r = await sock.getCatalog({ limit: opts.limit || 100, ...(opts.cursor ? { cursor: opts.cursor } : {}) });
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function descargarMedia(msg) {
    if (!sock) return { ok: false, error: 'sock_null' };
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      // Devolvemos base64 para serializar via socket.io
      return { ok: true, base64: buffer.toString('base64') };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function detener(motivo = null) {
    botDetenidoIntencional = true;
    detenerWatchdog();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    const sessionCleared = motivo === 'session-cleared';
    if (sock) {
      const prev = sock;
      sock = null;
      try { prev.end(); } catch (e) { log?.(`sock.end: ${e.message}`); }
    }
    emit('onStopped', { sessionCleared });
  }

  return {
    conectar,
    enviarTexto,
    enviarAudio,
    enviarPresence,
    getCatalog,
    descargarMedia,
    detener,
    isConnected: () => !!sock,
  };
}

module.exports = { crearBaileysRunner };
