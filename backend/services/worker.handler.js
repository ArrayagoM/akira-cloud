// services/worker.handler.js
// Maneja la conexión del Worker Local (PC del usuario) via Socket.io.
// El worker corre los bots pesados localmente; este handler los coordina
// desde el servidor en Render y retransmite los eventos al frontend.
'use strict';

const User   = require('../models/User');
const Log    = require('../models/Log');
const logger = require('../config/logger');

const WORKER_SECRET = process.env.WORKER_SECRET;

// ── Estado del worker ────────────────────────────────────────
let workerSocket   = null; // único worker por ahora (1 PC)
let workerInfo     = {};

// ────────────────────────────────────────────────────────────
//  Inicializar namespace de Socket.io para el worker
// ────────────────────────────────────────────────────────────
function inicializarWorkerHandler(io) {
  if (!WORKER_SECRET) {
    logger.warn('[WorkerHandler] WORKER_SECRET no configurado — namespace /worker desactivado');
    return;
  }

  const workerNS = io.of('/worker');

  // ── Autenticación del worker ─────────────────────────────
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

    // ── worker:ready ───────────────────────────────────────
    socket.on('worker:ready', (info) => {
      workerInfo = { ...info, connectedAt: new Date().toISOString() };
      logger.info(`[WorkerHandler] Worker listo — bots activos: ${info.bots || 0}`);
    });

    // ── Eventos de bot → reenviar al frontend ──────────────

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
    });

    socket.on('worker:bot-started', async ({ userId }) => {
      logger.info(`[WorkerHandler] Bot iniciado para user ${userId}`);
      await User.findByIdAndUpdate(userId, { botActivo: true }).catch(() => {});
    });

    socket.on('worker:bot-disconnected', async ({ userId, reason }) => {
      logger.warn(`[WorkerHandler] Bot desconectado user ${userId}: ${reason}`);
      await User.findByIdAndUpdate(userId, { botConectado: false }).catch(() => {});
      _emitirAlUsuario(io, userId, 'bot:disconnected', { reason });
      Log.registrar({ userId, tipo: 'bot_disconnected', nivel: 'warn', mensaje: `Desconectado: ${reason}` }).catch(() => {});
    });

    socket.on('worker:bot-stopped', async ({ userId, sessionCleared }) => {
      logger.info(`[WorkerHandler] Bot detenido user ${userId}${sessionCleared ? ' — sesión limpiada' : ''}`);
      await User.findByIdAndUpdate(userId, { botActivo: false, botConectado: false }).catch(() => {});
      _emitirAlUsuario(io, userId, 'bot:stopped', { sessionCleared: !!sessionCleared });
      const msg = sessionCleared
        ? 'Sesión de WhatsApp expirada — iniciá el bot de nuevo para escanear el QR'
        : 'Bot detenido (worker)';
      Log.registrar({ userId, tipo: 'bot_stop', mensaje: msg }).catch(() => {});
    });

    socket.on('worker:bot-error', async ({ userId, msg }) => {
      logger.error(`[WorkerHandler] Error en bot user ${userId}: ${msg}`);
      await User.findByIdAndUpdate(userId, { botActivo: false, botConectado: false }).catch(() => {});
      _emitirAlUsuario(io, userId, 'bot:error', { msg });
      Log.registrar({ userId, tipo: 'error', nivel: 'error', mensaje: msg }).catch(() => {});
    });

    // ── Catálogo: resultado de sincronización WA Business ──
    socket.on('worker:catalog-synced', ({ userId, count, total }) => {
      logger.info(`[WorkerHandler] Catálogo sincronizado user ${userId}: ${count} prod(s)`);
      _emitirAlUsuario(io, userId, 'catalog:synced', { count, total });
    });

    socket.on('worker:catalog-new-product', ({ userId, product }) => {
      logger.info(`[WorkerHandler] Nuevo producto detectado user ${userId}: ${product?.nombre}`);
      _emitirAlUsuario(io, userId, 'catalog:new-product', product);
    });

    // ── Desconexión del worker ─────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.warn(`[WorkerHandler] ⚠️ Worker desconectado: ${reason}`);
      if (workerSocket?.id === socket.id) {
        workerSocket = null;
        workerInfo   = {};
      }
    });
  });

  logger.info('[WorkerHandler] Namespace /worker registrado');
}

// ────────────────────────────────────────────────────────────
//  API para bot.manager.js
// ────────────────────────────────────────────────────────────

/** ¿Hay un worker conectado y listo? */
function isWorkerAvailable() {
  return workerSocket !== null && workerSocket.connected;
}

/** Enviar un comando al worker (ej. start-bot, stop-bot, panic-stop). */
function sendToWorker(evento, datos) {
  if (!isWorkerAvailable()) {
    throw new Error('Worker no disponible — asegurate de que la PC esté encendida y conectada');
  }
  workerSocket.emit(evento, datos);
}

/** Info del worker (para panel de admin). */
function getWorkerInfo() {
  return isWorkerAvailable()
    ? { conectado: true, ...workerInfo }
    : { conectado: false };
}

// ────────────────────────────────────────────────────────────
//  Helper interno
// ────────────────────────────────────────────────────────────
function _emitirAlUsuario(io, userId, evento, datos) {
  io.to(`user:${userId}`).emit(evento, datos);
}

module.exports = {
  inicializarWorkerHandler,
  isWorkerAvailable,
  sendToWorker,
  getWorkerInfo,
};
