// services/worker.handler.js
// Maneja la conexión del Worker Local (PC del usuario) via Socket.io.
//
// Refactor 2026-04-29: el worker ahora es un proxy Baileys puro. Toda la
// lógica de negocio corre en este backend. El worker nos manda mensajes
// crudos de WhatsApp y nosotros le devolvemos comandos de Baileys.
//
// Flujo:
//   Cliente WA → Worker (Baileys) → 'worker:msg-incoming' → este handler →
//   bot.engine.procesa(msg) → 'worker:exec-send-text' → Worker → Cliente WA
'use strict';

const User   = require('../models/User');
const Log    = require('../models/Log');
const logger = require('../config/logger');

const WORKER_SECRET = process.env.WORKER_SECRET;

// ── Estado del worker ────────────────────────────────────────
let workerSocket   = null; // único worker por ahora (1 PC)
let workerInfo     = {};

// proxies[userId] = { sock, inyectarEvento, cerrar } del baileys.proxy.js
const proxies = new Map();

// Buffer para eventos chats.set / contacts.upsert que llegan ANTES de que
// el proxy esté registrado (race condition: Baileys dispara chats.set al
// conectar, pero el backend crea el proxy 2 segundos después).
// Se vacía automáticamente cuando registrarProxy() es llamado.
const pendingChatsSet     = new Map(); // userId -> chats[]
const pendingContactsUpsert = new Map(); // userId -> contacts[]

// Listeners externos: bot.manager se suscribe acá para reaccionar
// cuando el worker (re)conecta y para arrancar/detener bots.
const externalListeners = {
  onWorkerConnected: null,       // (info) => void
  onWorkerDisconnected: null,    // () => void
  onBotReadyWithoutProxy: null,  // (userId) => void — bot-ready llegó pero no hay proxy aún
};

// ────────────────────────────────────────────────────────────
//  Inicializar namespace de Socket.io para el worker
// ────────────────────────────────────────────────────────────
function inicializarWorkerHandler(io) {
  if (!WORKER_SECRET) {
    logger.warn('[WorkerHandler] WORKER_SECRET no configurado — namespace /worker desactivado');
    return;
  }

  const workerNS = io.of('/worker');

  workerNS.use((socket, next) => {
    const { secret, role } = socket.handshake.auth || {};
    if (secret !== WORKER_SECRET || role !== 'worker') {
      logger.warn(`[WorkerHandler] Intento de conexión rechazado (id: ${socket.id})`);
      return next(new Error('No autorizado'));
    }
    next();
  });

  workerNS.on('connection', (socket) => {
    logger.info(`[WorkerHandler] ✅ Worker conectado (id: ${socket.id})`);
    workerSocket = socket;

    socket.on('worker:ready', async (info) => {
      workerInfo = { ...info, connectedAt: new Date().toISOString() };
      logger.info(
        `[WorkerHandler] Worker listo — modo=${info.mode || 'legacy'} bots=${info.bots || 0}`
      );
      externalListeners.onWorkerConnected?.(info);

      // Sincronizar estado: si el backend tiene usuarios marcados como
      // botActivo:true / botConectado:true pero el worker dice que NO
      // tiene esa sesión, el panel queda mostrando "Conectado" cuando en
      // realidad está caído. Marcamos como inactivos los que no estén.
      try {
        const botIdsActivos = new Set((info.botIds || []).map(String));
        const stale = await User.find({
          $or: [{ botActivo: true }, { botConectado: true }],
        }).select('_id botActivo botConectado').lean();

        let marcados = 0;
        for (const u of stale) {
          const uid = String(u._id);
          if (botIdsActivos.has(uid)) continue;
          await User.findByIdAndUpdate(uid, {
            botActivo: false,
            botConectado: false,
          }).catch(() => {});
          // Notificar al panel del usuario para que actualice la UI
          _emitirAlUsuario(io, uid, 'bot:disconnected', {
            reason: 'Sin sesión activa en el worker — escaneá un QR nuevo',
          });
          // Limpiar proxy si quedó stale
          if (proxies.has(uid)) {
            const p = proxies.get(uid);
            try { p.cerrar(); } catch {}
            proxies.delete(uid);
          }
          marcados++;
        }
        if (marcados > 0) {
          logger.info(
            `[WorkerHandler] Sincronización: ${marcados} bot(s) marcados inactivos (worker no los tiene)`
          );
        }
      } catch (e) {
        logger.warn(`[WorkerHandler] Error sincronizando estado al ready: ${e.message}`);
      }
    });

    // ── Eventos info → reenviar al frontend (compatible con UI actual) ──
    socket.on('worker:bot-log', ({ userId, msg, ts }) => {
      _emitirAlUsuario(io, userId, 'bot:log', { msg, ts });
    });

    socket.on('worker:bot-qr', ({ userId, qr }) => {
      logger.info(`[WorkerHandler] QR para user ${userId}`);
      _emitirAlUsuario(io, userId, 'bot:qr', { qr });
      Log.registrar({ userId, tipo: 'bot_qr', mensaje: 'QR generado — esperando escaneo' }).catch(() => {});
    });

    socket.on('worker:bot-ready', async ({ userId }) => {
      logger.info(`[WorkerHandler] Bot listo para user ${userId}`);
      await User.findByIdAndUpdate(userId, { botActivo: true, botConectado: true }).catch(() => {});
      _emitirAlUsuario(io, userId, 'bot:ready', {});
      Log.registrar({ userId, tipo: 'bot_connected', mensaje: 'WhatsApp conectado y listo (worker)' }).catch(() => {});
      // Inyectar evento al proxy si existe
      const p = proxies.get(String(userId));
      if (p) {
        p.inyectarEvento('connection.update', { connection: 'open' });
      } else {
        // Race condition: el worker auto-restauró un bot DESPUÉS de enviar worker:ready
        // (cuando botIds estaba vacío). El proxy aún no existe — delegar a bot.manager
        // para que cree el proxy ahora con el socket actual del worker.
        logger.warn(`[WorkerHandler] bot-ready para ${String(userId).slice(-6)} sin proxy — delegando arranque a bot.manager`);
        externalListeners.onBotReadyWithoutProxy?.(String(userId));
      }
    });

    socket.on('worker:bot-started', async ({ userId }) => {
      await User.findByIdAndUpdate(userId, { botActivo: true }).catch(() => {});
    });

    socket.on('worker:bot-disconnected', async ({ userId, reason, sessionCleared }) => {
      logger.warn(`[WorkerHandler] Bot ${userId} desconectado: ${reason}`);
      await User.findByIdAndUpdate(userId, { botConectado: false }).catch(() => {});
      _emitirAlUsuario(io, userId, 'bot:disconnected', { reason });
      Log.registrar({ userId, tipo: 'bot_disconnected', nivel: 'warn', mensaje: `Desconectado: ${reason}` }).catch(() => {});
      const p = proxies.get(String(userId));
      if (p) {
        p.inyectarEvento('connection.update', {
          connection: 'close',
          lastDisconnect: { error: { output: { statusCode: sessionCleared ? 401 : null } } },
        });
        if (sessionCleared) {
          p.cerrar();
          proxies.delete(String(userId));
        }
      }
    });

    socket.on('worker:bot-stopped', async ({ userId, sessionCleared }) => {
      logger.info(`[WorkerHandler] Bot ${userId} detenido${sessionCleared ? ' — sesión limpiada' : ''}`);
      await User.findByIdAndUpdate(userId, { botActivo: false, botConectado: false }).catch(() => {});
      _emitirAlUsuario(io, userId, 'bot:stopped', { sessionCleared: !!sessionCleared });
      const msg = sessionCleared
        ? 'Sesión de WhatsApp expirada — iniciá el bot de nuevo para escanear el QR'
        : 'Bot detenido (worker)';
      Log.registrar({ userId, tipo: 'bot_stop', mensaje: msg }).catch(() => {});
      const p = proxies.get(String(userId));
      if (p) {
        p.cerrar();
        proxies.delete(String(userId));
      }
    });

    socket.on('worker:bot-error', async ({ userId, msg }) => {
      logger.error(`[WorkerHandler] Error en bot ${userId}: ${msg}`);
      await User.findByIdAndUpdate(userId, { botActivo: false, botConectado: false }).catch(() => {});
      _emitirAlUsuario(io, userId, 'bot:error', { msg });
      Log.registrar({ userId, tipo: 'error', nivel: 'error', mensaje: msg }).catch(() => {});
    });

    // ── NUEVOS EVENTOS — flujo de mensajes via worker proxy ─────
    socket.on('worker:msg-incoming', ({ userId, msg }) => {
      const p = proxies.get(String(userId));
      if (!p) {
        logger.warn(`[WorkerHandler] msg-incoming para ${userId} sin proxy registrado`);
        return;
      }
      p.inyectarEvento('messages.upsert', { messages: [msg], type: 'notify' });
    });

    socket.on('worker:contacts-upsert', ({ userId, contacts }) => {
      const uid = String(userId);
      const p = proxies.get(uid);
      if (p) {
        p.inyectarEvento('contacts.upsert', contacts);
      } else {
        // Bufferear: el proxy aún no existe, llegará cuando el bot termine de inicializar
        const existing = pendingContactsUpsert.get(uid) || [];
        pendingContactsUpsert.set(uid, [...existing, ...contacts]);
      }
    });

    socket.on('worker:chats-set', ({ userId, chats }) => {
      const uid = String(userId);
      const p = proxies.get(uid);
      if (p) {
        p.inyectarEvento('chats.set', { chats });
      } else {
        // Bufferear: chats.set llega al conectar Baileys, antes de que el proxy exista
        logger.info(`[WorkerHandler] chats-set buffereado para ${uid.slice(-6)} (${chats?.length || 0} chats) — proxy no listo aún`);
        pendingChatsSet.set(uid, chats);
      }
    });

    socket.on('worker:chats-upsert', ({ userId, chats }) => {
      const p = proxies.get(String(userId));
      if (p) p.inyectarEvento('chats.upsert', chats);
    });

    // ── Catálogo (push) ──
    socket.on('worker:catalog-synced', ({ userId, count, total }) => {
      _emitirAlUsuario(io, userId, 'catalog:synced', { count, total });
    });

    socket.on('worker:catalog-new-product', ({ userId, product }) => {
      _emitirAlUsuario(io, userId, 'catalog:new-product', product);
    });

    // ── Desconexión del worker ─────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.warn(`[WorkerHandler] ⚠️ Worker desconectado: ${reason}`);
      if (workerSocket?.id === socket.id) {
        const botIds = Array.from(proxies.keys());
        workerSocket = null;
        workerInfo   = {};

        // Cerrar todos los proxies y notificar a los bot.engines
        for (const uid of botIds) {
          try {
            const p = proxies.get(uid);
            if (p) {
              p.inyectarEvento('connection.update', {
                connection: 'close',
                lastDisconnect: { error: new Error('worker_disconnected') },
              });
            }
            await User.findByIdAndUpdate(uid, { botConectado: false });
            _emitirAlUsuario(io, uid, 'bot:disconnected', { reason: 'Worker desconectado — tu PC se desconectó del servidor' });
            _emitirAlUsuario(io, uid, 'bot:log', {
              msg: '⚠️ Tu PC perdió conexión con el servidor. El bot se reconectará automáticamente cuando tu PC vuelva a estar online.',
              ts: new Date().toLocaleTimeString('es-AR'),
            });
            Log.registrar({ userId: uid, tipo: 'worker_disconnected', nivel: 'warn', mensaje: `Worker desconectado: ${reason}` }).catch(() => {});
          } catch (e) {
            logger.error(`[WorkerHandler] Error al cerrar bot ${uid}: ${e.message}`);
          }
        }
        // No los borramos del map — cuando el worker reconecta, los bot.engines
        // van a re-registrar sus proxies o el manager los va a recrear.
        // Limpiar buffers pendientes — datos del worker desconectado ya no sirven
        pendingChatsSet.clear();
        pendingContactsUpsert.clear();
        externalListeners.onWorkerDisconnected?.();
      }
    });
  });

  logger.info('[WorkerHandler] Namespace /worker registrado');
}

// ────────────────────────────────────────────────────────────
//  API para bot.manager.js
// ────────────────────────────────────────────────────────────

function isWorkerAvailable() {
  return workerSocket !== null && workerSocket.connected;
}

/** Devuelve el socket del worker (para crear baileysProxy). */
function getWorkerSocket() {
  return isWorkerAvailable() ? workerSocket : null;
}

/** Registrar/desregistrar un proxy de bot (usado por bot.manager). */
function registrarProxy(userId, proxy) {
  const uid = String(userId);
  proxies.set(uid, proxy);

  // Vaciar eventos buffereados que llegaron antes de que el proxy existiera.
  // Usamos un pequeño delay para que el bot-engine termine de inicializarse
  // y sus handlers de 'chats.set' / 'contacts.upsert' estén activos.
  const chats    = pendingChatsSet.get(uid);
  const contacts = pendingContactsUpsert.get(uid);
  if (chats || contacts) {
    setTimeout(() => {
      if (contacts?.length) {
        logger.info(`[WorkerHandler] Flushing contacts buffer para ${uid.slice(-6)}: ${contacts.length} contacto(s)`);
        proxy.inyectarEvento('contacts.upsert', contacts);
        pendingContactsUpsert.delete(uid);
      }
      if (chats?.length) {
        logger.info(`[WorkerHandler] Flushing chats-set buffer para ${uid.slice(-6)}: ${chats.length} chat(s)`);
        proxy.inyectarEvento('chats.set', { chats });
        pendingChatsSet.delete(uid);
      }
    }, 8000); // 8s — tiempo suficiente para que bot.iniciar() complete (MongoDB + config load)
  }
}

function desregistrarProxy(userId) {
  const p = proxies.get(String(userId));
  if (p) {
    try { p.cerrar(); } catch {}
  }
  proxies.delete(String(userId));
}

function tieneProxy(userId) {
  return proxies.has(String(userId));
}

/** Enviar comando al worker (start/stop/panic). */
function sendToWorker(evento, datos) {
  if (!isWorkerAvailable()) {
    throw new Error('Worker no disponible — asegurate de que la PC esté encendida y conectada');
  }
  workerSocket.emit(evento, datos);
}

function getWorkerInfo() {
  return isWorkerAvailable()
    ? { conectado: true, ...workerInfo }
    : { conectado: false };
}

/** Suscribir listeners externos para reaccionar a cambios del worker. */
function onWorkerConnected(cb) { externalListeners.onWorkerConnected = cb; }
function onWorkerDisconnected(cb) { externalListeners.onWorkerDisconnected = cb; }
/** Llamado cuando bot-ready llega pero no hay proxy (race condition de auto-restore). */
function onBotReadyWithoutProxy(cb) { externalListeners.onBotReadyWithoutProxy = cb; }

// ────────────────────────────────────────────────────────────
function _emitirAlUsuario(io, userId, evento, datos) {
  io.to(`user:${userId}`).emit(evento, datos);
}

module.exports = {
  inicializarWorkerHandler,
  isWorkerAvailable,
  getWorkerSocket,
  sendToWorker,
  getWorkerInfo,
  registrarProxy,
  desregistrarProxy,
  tieneProxy,
  onWorkerConnected,
  onWorkerDisconnected,
  onBotReadyWithoutProxy,
};
