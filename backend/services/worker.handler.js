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
//
// Fix 2026-07: todo el estado (proxies, buffers) se indexa por instKey =
// "userId:slot", NO por userId solo. Un mismo usuario puede tener varias
// cuentas de WhatsApp activas en paralelo (plan Agencia, slot 0-4) — indexar
// solo por userId hacía que la segunda cuenta pisara el proxy de la primera
// y solo una de las dos respondiera.
'use strict';

const User   = require('../models/User');
const Log    = require('../models/Log');
const logger = require('../config/logger');
const { instKey, parseInstKey } = require('./instkey.util');
const { updateBotStatus } = require('./bot.status.util');

const WORKER_SECRET = process.env.WORKER_SECRET;

// ── Estado del worker ────────────────────────────────────────
let workerSocket   = null; // único worker por ahora (1 PC — confirmado: así es la infra real)
let workerInfo     = {};

// proxies[instKey] = { sock, inyectarEvento, cerrar } del baileys.proxy.js
const proxies = new Map();

// Buffer para eventos chats.set / contacts.upsert que llegan ANTES de que
// el proxy esté registrado (race condition: Baileys dispara chats.set al
// conectar, pero el backend crea el proxy 2 segundos después).
// Se vacía automáticamente cuando registrarProxy() es llamado.
const pendingChatsSet     = new Map(); // instKey -> chats[]
const pendingContactsUpsert = new Map(); // instKey -> contacts[]

// Buffer de mensajes entrantes que llegan ANTES de que el proxy esté listo:
//  - durante el arranque del bot (bot.iniciar() tarda unos segundos en cargar
//    clientes/config y enchufar handlers a sock.ev),
//  - al reconectar el worker tras un restart del backend (Render redeploy),
//    donde los msg-incoming buffereados por socket.io pueden llegar antes que
//    reconectarProxiesBots() recree el proxy.
// Sin este buffer, esos mensajes se descartan y el cliente se queda sin
// respuesta. Limitado a MAX_PENDING_MSGS por usuario para no quedarse sin RAM.
const pendingMsgIncoming = new Map(); // instKey -> msg[]
const MAX_PENDING_MSGS = 200;

// Listeners externos: bot.manager se suscribe acá para reaccionar
// cuando el worker (re)conecta y para arrancar/detener bots.
const externalListeners = {
  onWorkerConnected: null,       // (info) => void
  onWorkerDisconnected: null,    // () => void
  onBotReadyWithoutProxy: null,  // (userId, slot) => void — bot-ready llegó pero no hay proxy aún
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
      // info.botIds son instKeys ("uid:slot") desde el fix de multi-slot.
      try {
        const activeKeys = new Set((info.botIds || []).map(String));
        const activeUids = new Set(Array.from(activeKeys).map((k) => parseInstKey(k).uid));

        const stale = await User.find({
          $or: [{ botActivo: true }, { botConectado: true }, { 'cuentasWA.activo': true }, { 'cuentasWA.conectado': true }],
        }).select('_id botActivo botConectado cuentasWA').lean();

        let marcados = 0;
        for (const u of stale) {
          const uid = String(u._id);

          // slot 0 (campos top-level)
          if ((u.botActivo || u.botConectado) && !activeKeys.has(instKey(uid, 0))) {
            await updateBotStatus(uid, 0, false, false);
            _emitirAlUsuario(io, uid, 'bot:disconnected', {
              slot: 0,
              reason: 'Sin sesión activa en el worker — escaneá un QR nuevo',
            });
            const p = proxies.get(instKey(uid, 0));
            if (p) { try { p.cerrar(); } catch {} proxies.delete(instKey(uid, 0)); }
            marcados++;
          }

          // slots > 0 (plan Agencia)
          for (const cuenta of (u.cuentasWA || [])) {
            if (cuenta.slot === 0) continue;
            if (!(cuenta.activo || cuenta.conectado)) continue;
            const k = instKey(uid, cuenta.slot);
            if (activeKeys.has(k)) continue;
            await updateBotStatus(uid, cuenta.slot, false, false);
            _emitirAlUsuario(io, uid, 'bot:disconnected', {
              slot: cuenta.slot,
              reason: 'Sin sesión activa en el worker — escaneá un QR nuevo',
            });
            const p = proxies.get(k);
            if (p) { try { p.cerrar(); } catch {} proxies.delete(k); }
            marcados++;
          }
        }
        if (marcados > 0) {
          logger.info(
            `[WorkerHandler] Sincronización: ${marcados} bot(s) marcados inactivos (worker no los tiene). Uids reportados activos: ${activeUids.size}`
          );
        }
      } catch (e) {
        logger.warn(`[WorkerHandler] Error sincronizando estado al ready: ${e.message}`);
      }
    });

    // ── Eventos info → reenviar al frontend (compatible con UI actual) ──
    socket.on('worker:bot-log', ({ userId, slot, msg, ts }) => {
      _emitirAlUsuario(io, userId, 'bot:log', { msg, ts, slot: parseInt(slot, 10) || 0 });
    });

    socket.on('worker:bot-qr', ({ userId, slot, qr }) => {
      const s = parseInt(slot, 10) || 0;
      logger.info(`[WorkerHandler] QR para user ${userId}${s ? `:${s}` : ''}`);
      _emitirAlUsuario(io, userId, 'bot:qr', { qr, slot: s });
      Log.registrar({ userId, tipo: 'bot_qr', mensaje: `Slot ${s}: QR generado — esperando escaneo` }).catch(() => {});
    });

    socket.on('worker:bot-ready', async ({ userId, slot }) => {
      const s = parseInt(slot, 10) || 0;
      logger.info(`[WorkerHandler] Bot listo para user ${userId}${s ? `:${s}` : ''}`);
      await updateBotStatus(String(userId), s, true, true);
      _emitirAlUsuario(io, userId, 'bot:ready', { slot: s });
      Log.registrar({ userId, tipo: 'bot_connected', mensaje: `Slot ${s}: WhatsApp conectado y listo (worker)` }).catch(() => {});
      // Inyectar evento al proxy si existe
      const p = proxies.get(instKey(userId, s));
      if (p) {
        p.inyectarEvento('connection.update', { connection: 'open' });
      } else {
        // Race condition: el worker auto-restauró un bot DESPUÉS de enviar worker:ready
        // (cuando botIds estaba vacío). El proxy aún no existe — delegar a bot.manager
        // para que cree el proxy ahora con el socket actual del worker.
        logger.warn(`[WorkerHandler] bot-ready para ${String(userId).slice(-6)}${s ? `:${s}` : ''} sin proxy — delegando arranque a bot.manager`);
        externalListeners.onBotReadyWithoutProxy?.(String(userId), s);
      }
    });

    socket.on('worker:bot-started', async ({ userId, slot }) => {
      const s = parseInt(slot, 10) || 0;
      if (s === 0) await User.findByIdAndUpdate(userId, { botActivo: true }).catch(() => {});
      else await User.findOneAndUpdate(
        { _id: userId, 'cuentasWA.slot': s },
        { $set: { 'cuentasWA.$.activo': true } }
      ).catch(() => {});
    });

    socket.on('worker:bot-disconnected', async ({ userId, slot, reason, sessionCleared }) => {
      const s = parseInt(slot, 10) || 0;
      logger.warn(`[WorkerHandler] Bot ${userId}${s ? `:${s}` : ''} desconectado: ${reason}`);
      await updateBotStatus(String(userId), s, !sessionCleared, false);
      _emitirAlUsuario(io, userId, 'bot:disconnected', { reason, slot: s });
      Log.registrar({ userId, tipo: 'bot_disconnected', nivel: 'warn', mensaje: `Slot ${s}: Desconectado: ${reason}` }).catch(() => {});
      const k = instKey(userId, s);
      const p = proxies.get(k);
      if (p) {
        p.inyectarEvento('connection.update', {
          connection: 'close',
          lastDisconnect: { error: { output: { statusCode: sessionCleared ? 401 : null } } },
        });
        if (sessionCleared) {
          p.cerrar();
          proxies.delete(k);
        }
      }
    });

    socket.on('worker:bot-stopped', async ({ userId, slot, sessionCleared }) => {
      const s = parseInt(slot, 10) || 0;
      logger.info(`[WorkerHandler] Bot ${userId}${s ? `:${s}` : ''} detenido${sessionCleared ? ' — sesión limpiada' : ''}`);
      await updateBotStatus(String(userId), s, false, false);
      _emitirAlUsuario(io, userId, 'bot:stopped', { sessionCleared: !!sessionCleared, slot: s });
      const msg = sessionCleared
        ? 'Sesión de WhatsApp expirada — iniciá el bot de nuevo para escanear el QR'
        : 'Bot detenido (worker)';
      Log.registrar({ userId, tipo: 'bot_stop', mensaje: `Slot ${s}: ${msg}` }).catch(() => {});
      const k = instKey(userId, s);
      const p = proxies.get(k);
      if (p) {
        p.cerrar();
        proxies.delete(k);
      }
    });

    socket.on('worker:bot-error', async ({ userId, slot, msg }) => {
      const s = parseInt(slot, 10) || 0;
      logger.error(`[WorkerHandler] Error en bot ${userId}${s ? `:${s}` : ''}: ${msg}`);
      await updateBotStatus(String(userId), s, false, false);
      _emitirAlUsuario(io, userId, 'bot:error', { msg, slot: s });
      Log.registrar({ userId, tipo: 'error', nivel: 'error', mensaje: `Slot ${s}: ${msg}` }).catch(() => {});
    });

    // ── NUEVOS EVENTOS — flujo de mensajes via worker proxy ─────
    socket.on('worker:msg-incoming', ({ userId, slot, msg }) => {
      const k = instKey(userId, slot);
      const p = proxies.get(k);
      if (p) {
        p.inyectarEvento('messages.upsert', { messages: [msg], type: 'notify' });
        return;
      }
      // No hay proxy todavía: bufferear hasta que se registre. Esto cubre
      // dos casos críticos:
      //  1) bot arrancando — registrarProxy() corre antes de que bot.iniciar()
      //     enchufe handlers a sock.ev.
      //  2) reconexión del worker — los msg-incoming que socket.io bufferea
      //     mientras backend reinicia llegan antes que reconectarProxiesBots().
      const queue = pendingMsgIncoming.get(k) || [];
      if (queue.length >= MAX_PENDING_MSGS) queue.shift(); // descartar el más viejo
      queue.push(msg);
      pendingMsgIncoming.set(k, queue);
      logger.info(`[WorkerHandler] msg-incoming buffereado para ${k} (${queue.length}/${MAX_PENDING_MSGS}) — proxy no listo aún`);
    });

    socket.on('worker:contacts-upsert', ({ userId, slot, contacts }) => {
      const k = instKey(userId, slot);
      const p = proxies.get(k);
      if (p) {
        p.inyectarEvento('contacts.upsert', contacts);
      } else {
        // Bufferear: el proxy aún no existe, llegará cuando el bot termine de inicializar
        const existing = pendingContactsUpsert.get(k) || [];
        pendingContactsUpsert.set(k, [...existing, ...contacts]);
      }
    });

    socket.on('worker:chats-set', ({ userId, slot, chats }) => {
      const k = instKey(userId, slot);
      const p = proxies.get(k);
      if (p) {
        p.inyectarEvento('chats.set', { chats });
      } else {
        // Bufferear: chats.set llega al conectar Baileys, antes de que el proxy exista
        logger.info(`[WorkerHandler] chats-set buffereado para ${k} (${chats?.length || 0} chats) — proxy no listo aún`);
        pendingChatsSet.set(k, chats);
      }
    });

    socket.on('worker:chats-upsert', ({ userId, slot, chats }) => {
      const p = proxies.get(instKey(userId, slot));
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
        const keys = Array.from(proxies.keys());
        workerSocket = null;
        workerInfo   = {};

        // Cerrar todos los proxies (de TODOS los usuarios y TODOS sus slots)
        // y notificar a los bot.engines.
        for (const k of keys) {
          const { uid, slot } = parseInstKey(k);
          try {
            const p = proxies.get(k);
            if (p) {
              p.inyectarEvento('connection.update', {
                connection: 'close',
                lastDisconnect: { error: new Error('worker_disconnected') },
              });
            }
            await updateBotStatus(uid, slot, true, false);
            _emitirAlUsuario(io, uid, 'bot:disconnected', { slot, reason: 'Worker desconectado — tu PC se desconectó del servidor' });
            _emitirAlUsuario(io, uid, 'bot:log', {
              slot,
              msg: '⚠️ Tu PC perdió conexión con el servidor. El bot se reconectará automáticamente cuando tu PC vuelva a estar online.',
              ts: new Date().toLocaleTimeString('es-AR'),
            });
            Log.registrar({ userId: uid, tipo: 'worker_disconnected', nivel: 'warn', mensaje: `Slot ${slot}: Worker desconectado: ${reason}` }).catch(() => {});
          } catch (e) {
            logger.error(`[WorkerHandler] Error al cerrar bot ${k}: ${e.message}`);
          }
        }
        // No los borramos del map — cuando el worker reconecta, los bot.engines
        // van a re-registrar sus proxies o el manager los va a recrear.
        // Limpiar buffers pendientes — datos del worker desconectado ya no sirven
        pendingChatsSet.clear();
        pendingContactsUpsert.clear();
        // Los msg-incoming pendientes SÍ los preservamos: socket.io del worker
        // bufferea sus emits durante la desconexión y los reenvía al reconectar.
        // Si limpiamos acá, perderíamos los mensajes que llegaron al WhatsApp
        // del usuario justo en el instante de la desconexión backend↔worker.
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
function registrarProxy(userId, slot, proxy) {
  const k = instKey(userId, slot);
  proxies.set(k, proxy);

  // Vaciar eventos buffereados que llegaron antes de que el proxy existiera.
  // Usamos un pequeño delay para que el bot-engine termine de inicializarse
  // y sus handlers de 'chats.set' / 'contacts.upsert' / 'messages.upsert'
  // estén activos.
  const chats    = pendingChatsSet.get(k);
  const contacts = pendingContactsUpsert.get(k);
  const msgs     = pendingMsgIncoming.get(k);
  if (chats || contacts || msgs?.length) {
    setTimeout(() => {
      if (contacts?.length) {
        logger.info(`[WorkerHandler] Flushing contacts buffer para ${k}: ${contacts.length} contacto(s)`);
        proxy.inyectarEvento('contacts.upsert', contacts);
        pendingContactsUpsert.delete(k);
      }
      if (chats?.length) {
        logger.info(`[WorkerHandler] Flushing chats-set buffer para ${k}: ${chats.length} chat(s)`);
        proxy.inyectarEvento('chats.set', { chats });
        pendingChatsSet.delete(k);
      }
      if (msgs?.length) {
        logger.info(`[WorkerHandler] Flushing ${msgs.length} mensaje(s) buffereado(s) para ${k} — el bot va a procesarlos ahora`);
        for (const m of msgs) {
          try {
            proxy.inyectarEvento('messages.upsert', { messages: [m], type: 'notify' });
          } catch (e) {
            logger.warn(`[WorkerHandler] Error inyectando msg buffereado: ${e.message}`);
          }
        }
        pendingMsgIncoming.delete(k);
      }
    }, 8000); // 8s — tiempo suficiente para que bot.iniciar() complete (MongoDB + config load)
  }
}

function desregistrarProxy(userId, slot) {
  const k = instKey(userId, slot);
  const p = proxies.get(k);
  if (p) {
    try { p.cerrar(); } catch {}
  }
  proxies.delete(k);
}

/**
 * Desregistrar un proxy SIN pedirle al worker que detenga Baileys.
 * Usar cuando estamos reciclando el proxy en el backend (reconexión de
 * worker, shutdown del backend en Render) y queremos mantener viva la
 * sesión WhatsApp activa en el worker.
 */
function desregistrarProxyLocal(userId, slot) {
  const k = instKey(userId, slot);
  const p = proxies.get(k);
  if (p) {
    try {
      if (typeof p.cerrarLocal === 'function') p.cerrarLocal();
      // Fallback silencioso si por alguna razón no expone cerrarLocal:
      // simplemente borramos la referencia sin propagar al worker.
    } catch {}
  }
  proxies.delete(k);
  // Limpiar también buffers pendientes del usuario para evitar que se
  // re-inyecten al proxy que vamos a recrear (los reenviará el worker).
  pendingChatsSet.delete(k);
  pendingContactsUpsert.delete(k);
}

function tieneProxy(userId, slot) {
  return proxies.has(instKey(userId, slot));
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
  desregistrarProxyLocal,
  tieneProxy,
  onWorkerConnected,
  onWorkerDisconnected,
  onBotReadyWithoutProxy,
};
