// services/bot.manager.js
// Gestor de instancias de bots — multi-tenant
// Arquitectura híbrida: si hay un worker local conectado, le delega el bot.
// Si no hay worker, inicia el bot directamente en el servidor (Baileys).
'use strict';

const path    = require('path');
const fs      = require('fs');
const User    = require('../models/User');
const Config  = require('../models/Config');
const Log     = require('../models/Log');
const logger  = require('../config/logger');
const crearAkiraBot  = require('./akira.bot');
const workerHandler  = require('./worker.handler');

// ── Mapa de instancias activas ───────────────────────────────
// clave: "${userId}:${slot}" — slot 0 es la cuenta principal
const instancias = new Map();

// ── Locks para evitar arrancar dos veces el mismo bot ────────
const arranqueEnProceso = new Set();

// ── Auto-restart: timers de reconexión pendientes ────────────
// Permite cancelar el timer si el usuario reinicia manualmente antes
const autoRestartTimers = new Map();

// ── Clave de instancia ───────────────────────────────────────
const botKey = (uid, slot) => `${uid}:${slot}`;

// ── Helper: actualizar estado en DB ─────────────────────────
async function updateBotStatus(uid, slot, activo, conectado) {
  const topLevel = slot === 0 ? { botActivo: activo, botConectado: conectado } : {};
  // Actualizar elemento del array si existe
  await User.findOneAndUpdate(
    { _id: uid, 'cuentasWA.slot': slot },
    { $set: { ...topLevel, 'cuentasWA.$.activo': activo, 'cuentasWA.$.conectado': conectado } }
  ).catch(() => {});
  // Si no existe en cuentasWA, al menos actualizar campos top-level (slot 0)
  if (slot === 0) {
    await User.findByIdAndUpdate(uid, topLevel).catch(() => {});
  }
}

// ── Asignación de puertos sin colisiones ─────────────────────
const PUERTO_BASE  = 3100;
const puertosEnUso = new Set();
const puertosAsignados = new Map(); // botKey → puerto

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

const SESSIONS_PATH = process.env.WA_SESSIONS_PATH || './sessions';

// ────────────────────────────────────────────────────────────
//  ARRANCAR BOT
// ────────────────────────────────────────────────────────────
async function startBot(userId, slot = 0) {
  const uid  = String(userId);
  const key  = botKey(uid, slot);

  if (instancias.has(key)) {
    logger.warn(`[BotMgr] Bot ${key} ya está corriendo`);
    return { ok: false, msg: 'El bot ya está activo' };
  }

  if (arranqueEnProceso.has(key)) {
    return { ok: false, msg: 'El bot ya está iniciando' };
  }

  // Cancelar auto-restart pendiente si el usuario inicia manualmente antes de que dispare
  if (autoRestartTimers.has(key)) {
    clearTimeout(autoRestartTimers.get(key));
    autoRestartTimers.delete(key);
    logger.info(`[BotMgr] Auto-restart cancelado para ${key} — inicio manual`);
  }

  arranqueEnProceso.add(key);

  try {
    // ── Modo híbrido: delegar al worker si está conectado ──
    if (workerHandler.isWorkerAvailable()) {
      logger.info(`[BotMgr] Delegando bot ${key} al worker local`);
      workerHandler.sendToWorker('worker:start-bot', { userId: uid, slot });
      arranqueEnProceso.delete(key);
      return { ok: true, msg: 'Bot iniciando en worker local — esperá el QR' };
    }

    const [user, config] = await Promise.all([
      User.findById(uid),
      Config.findOne({ userId: uid }),
    ]);

    if (!user)  throw new Error('Usuario no encontrado');
    if (user.status === 'bloqueado') throw new Error('Cuenta bloqueada — bot no puede iniciarse');
    if (!config || !config.estaCompleta()) throw new Error('Configuración incompleta. Cargá tu Groq API Key primero.');
    if (!user.planVigente()) throw new Error('Plan vencido. Renová tu suscripción.');

    // Desencriptar credenciales
    const credenciales = {
      GROQ_API_KEY:            config.getKey('keyGroq'),
      MP_ACCESS_TOKEN:         config.getKey('keyMP')     || '',
      CALENDAR_ID:             config.getKey('idCalendar') || '',
      RIME_API_KEY:            config.getKey('keyRime')   || '',
      NGROK_AUTH_TOKEN:        config.getKey('keyNgrok')  || '',
      NGROK_DOMAIN:            config.dominioNgrok        || '',
      MI_NOMBRE:               config.miNombre,
      NEGOCIO:                 config.negocio,
      SERVICIOS:               config.servicios,
      PRECIO_TURNO:            String(config.precioTurno),
      HORAS_MINIMAS_CANCELACION: String(config.horasCancelacion),
      PROMPT_PERSONALIZADO:    config.promptPersonalizado || '',
      ALIAS_TRANSFERENCIA:     config.aliasTransferencia  || '',
      CBU_TRANSFERENCIA:       config.cbuTransferencia     || '',
      BANCO_TRANSFERENCIA:     config.bancoTransferencia   || '',
      SERVICIOS_LIST:            JSON.stringify(config.serviciosList || []),
      HORARIOS_ATENCION:         JSON.stringify(config.horariosAtencion || {}),
      DIAS_BLOQUEADOS:           JSON.stringify(config.diasBloqueados || []),
      MODO_PAUSA:                String(config.modoPausa || false),
      CELULAR_NOTIFICACIONES:    config.celularNotificaciones || '',
      TIPO_NEGOCIO:              config.tipoNegocio    || 'turnos',
      CHECK_IN_HORA:             config.checkInHora    || '14:00',
      CHECK_OUT_HORA:            config.checkOutHora   || '10:00',
      MINIMA_ESTADIA:            String(config.minimaEstadia  || 1),
      UNIDADES_ALOJAMIENTO:      JSON.stringify(config.unidadesAlojamiento || []),
      DIRECCION_PROPIEDAD:       config.direccionPropiedad || '',
      LINK_UBICACION:            config.linkUbicacion  || '',
      CATALOGO:                  JSON.stringify(config.catalogo || []),
      PORT:                    String(asignarPuerto(key)),
    };

    if (!credenciales.GROQ_API_KEY) throw new Error('GROQ API Key no configurada o inválida');

    // Directorio de sesión — slot 0 usa path legacy para backward compat
    const sessionDirName = slot === 0 ? uid : `${uid}_slot${slot}`;
    const sessionDir = path.resolve(SESSIONS_PATH, sessionDirName);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    // Directorio de memoria del bot
    const dataDir = path.resolve(SESSIONS_PATH, sessionDirName, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // Tokens Google Calendar OAuth (prioridad sobre service account)
    const googleCalendarTokens = config.googleCalendarTokens?.encrypted
      ? config.getKey('googleCalendarTokens')
      : null;

    if (googleCalendarTokens) {
      credenciales.GOOGLE_CALENDAR_TOKENS = googleCalendarTokens;
      credenciales.GOOGLE_EMAIL           = config.googleEmail || '';
    }

    // Credenciales de Google Calendar (service account — fallback)
    const credGoogleEncriptado = config.credentialsGoogleB64?.encrypted
      ? config.getKey('credentialsGoogleB64')
      : null;

    if (credGoogleEncriptado) {
      try {
        // Validar que sea JSON válido antes de escribir al disco
        JSON.parse(credGoogleEncriptado);
        const credPath = path.join(dataDir, 'credentials.json');
        fs.writeFileSync(credPath, credGoogleEncriptado, 'utf8');
      } catch (e) {
        logger.warn(`[BotMgr] Credenciales Google inválidas para user ${uid} — Calendar desactivado: ${e.message}`);
      }
    }

    // Crear instancia del bot
    const bot = crearAkiraBot(credenciales, dataDir, sessionDir, uid);
    instancias.set(key, bot);

    // ── Eventos del bot → Socket.io + DB ────────────────────
    bot.on('log', (msg) => {
      emitirAlUsuario(uid, 'bot:log', { msg, ts: new Date().toLocaleTimeString('es-AR'), slot });
    });

    bot.on('qr', async (qr) => {
      logger.info(`[BotMgr] QR generado para user ${uid} slot ${slot}`);
      emitirAlUsuario(uid, 'bot:qr', { qr, slot });
      await Log.registrar({ userId: uid, tipo: 'bot_qr', mensaje: `Slot ${slot}: QR generado — esperando escaneo` });
    });

    bot.on('ready', async () => {
      logger.info(`[BotMgr] Bot listo para user ${uid} slot ${slot}`);
      await updateBotStatus(uid, slot, true, true);
      emitirAlUsuario(uid, 'bot:ready', { slot });
      await Log.registrar({ userId: uid, tipo: 'bot_connected', mensaje: `Slot ${slot}: WhatsApp conectado y listo` });
    });

    bot.on('disconnected', async (reason) => {
      logger.warn(`[BotMgr] Bot desconectado para user ${uid} slot ${slot}: ${reason}`);
      await updateBotStatus(uid, slot, false, false);
      emitirAlUsuario(uid, 'bot:disconnected', { reason, slot });
      await Log.registrar({ userId: uid, tipo: 'bot_disconnected', nivel: 'warn', mensaje: `Slot ${slot}: Desconectado: ${reason}` });
      instancias.delete(key);
      liberarPuerto(key);

      // ── Auto-restart ────────────────────────────────────────
      // El bot cayó por motivo terminal (sesión expirada, reemplazada, etc.)
      // Lo reiniciamos automáticamente para que el usuario nunca quede sin bot.
      // Backoff: 15s primer intento, 30s segundo, 60s tercero, luego cada 5min.
      const MAX_INTENTOS  = 10;
      const DELAYS_MS     = [15_000, 30_000, 60_000, 120_000, 300_000]; // 15s, 30s, 1m, 2m, 5m
      let   intentoActual = 0;

      const intentarRestart = async () => {
        // Cancelar si ya está corriendo o si arrancó manualmente en el ínterin
        if (instancias.has(key) || arranqueEnProceso.has(key)) {
          autoRestartTimers.delete(key);
          return;
        }

        if (intentoActual >= MAX_INTENTOS) {
          logger.warn(`[BotMgr] Auto-restart: ${key} alcanzó ${MAX_INTENTOS} intentos sin éxito — deteniendo.`);
          emitirAlUsuario(uid, 'bot:log', { msg: `⚠️ Auto-restart pausado tras ${MAX_INTENTOS} intentos. Presioná Iniciar manualmente.`, ts: new Date().toLocaleTimeString('es-AR'), slot });
          try {
            const { enviarAlertaError } = require('./email.service');
            enviarAlertaError(`Bot caído permanentemente\nUsuario: ${uid} Slot: ${slot}\nSe agotaron ${MAX_INTENTOS} intentos de reconexión.`).catch(() => {});
          } catch (_) {}
          autoRestartTimers.delete(key);
          return;
        }

        try {
          // Verificar que el usuario siga activo y con plan vigente
          const user = await User.findById(uid).select('status planVigente planExpira planNombre').lean();
          if (!user || user.status !== 'activo') {
            autoRestartTimers.delete(key);
            return;
          }

          // Verificar plan vigente manualmente (lean() no tiene métodos)
          const ahora = new Date();
          const planOk = user.planNombre === 'admin' ||
            (user.planExpira && new Date(user.planExpira) > ahora);
          if (!planOk) {
            logger.info(`[BotMgr] Auto-restart: plan vencido para ${uid} — no se reinicia`);
            autoRestartTimers.delete(key);
            return;
          }

          intentoActual++;
          const delayIdx  = Math.min(intentoActual - 1, DELAYS_MS.length - 1);
          const nextDelay = DELAYS_MS[delayIdx];

          logger.info(`[BotMgr] Auto-restart: iniciando bot ${key} (intento ${intentoActual}/${MAX_INTENTOS})...`);
          emitirAlUsuario(uid, 'bot:log', { msg: `🔄 Auto-restart (intento ${intentoActual})...`, ts: new Date().toLocaleTimeString('es-AR'), slot });

          const result = await startBot(uid, slot);

          if (result.ok) {
            logger.info(`[BotMgr] Auto-restart: bot ${key} reiniciado exitosamente`);
            autoRestartTimers.delete(key);
          } else {
            logger.warn(`[BotMgr] Auto-restart: fallo en intento ${intentoActual} para ${key}: ${result.msg}`);
            emitirAlUsuario(uid, 'bot:log', { msg: `⚠️ Auto-restart intento ${intentoActual} falló: ${result.msg}`, ts: new Date().toLocaleTimeString('es-AR'), slot });
            const timer = setTimeout(intentarRestart, nextDelay);
            autoRestartTimers.set(key, timer);
          }
        } catch (e) {
          logger.error(`[BotMgr] Auto-restart: error inesperado en ${key}: ${e.message}`);
          if (intentoActual < MAX_INTENTOS) {
            const delayIdx  = Math.min(intentoActual, DELAYS_MS.length - 1);
            const nextDelay = DELAYS_MS[delayIdx];
            const timer = setTimeout(intentarRestart, nextDelay);
            autoRestartTimers.set(key, timer);
          }
        }
      };

      // Primer intento en 15 segundos
      const timer = setTimeout(intentarRestart, DELAYS_MS[0]);
      autoRestartTimers.set(key, timer);
    });

    bot.on('error', async (err) => {
      logger.error(`[BotMgr] Error en bot de user ${uid} slot ${slot}: ${err.message}`);
      emitirAlUsuario(uid, 'bot:error', { msg: err.message, slot });
      await Log.registrar({ userId: uid, tipo: 'error', nivel: 'error', mensaje: err.message });
    });

    // ── Catálogo: sincronización automática desde WA Business ──
    bot.on('catalog:update', async (catalogo) => {
      try {
        const cfg = await Config.findOne({ userId: uid });
        // Conservar productos manuales; reemplazar los de wa_catalog
        const manuales = (cfg?.catalogo || []).filter(p => p.fuente !== 'wa_catalog');
        const merged   = [...manuales, ...catalogo];
        await Config.findOneAndUpdate(
          { userId: uid },
          { catalogo: merged, catalogoSincronizadoEn: new Date() },
          { upsert: true }
        );
        emitirAlUsuario(uid, 'catalog:synced', { count: catalogo.length, total: merged.length });
        logger.info(`[BotMgr] Catálogo WA sincronizado para user ${uid}: ${catalogo.length} producto(s) de WA + ${manuales.length} manual(es) = ${merged.length} total`);
      } catch (e) {
        logger.warn(`[BotMgr] Error guardando catálogo para user ${uid}: ${e.message}`);
      }
    });

    // ── Catálogo: producto detectado desde un estado (status) ──
    bot.on('catalog:candidate', async (producto) => {
      try {
        await Config.findOneAndUpdate(
          { userId: uid },
          { $push: { catalogo: { ...producto, disponible: true, fuente: 'status' } } }
        );
        emitirAlUsuario(uid, 'catalog:new-product', producto);
        logger.info(`[BotMgr] Producto detectado en estado WA para user ${uid}: ${producto.nombre}`);
      } catch (e) {
        logger.warn(`[BotMgr] Error guardando candidato de catálogo para user ${uid}: ${e.message}`);
      }
    });

    // ── Iniciar ──────────────────────────────────────────────
    await bot.iniciar();
    await updateBotStatus(uid, slot, true, false); // activo pero aún no conectado
    await Log.registrar({ userId: uid, tipo: 'bot_start', mensaje: `Slot ${slot}: Bot iniciado` });

    logger.info(`[BotMgr] ✅ Bot iniciado para user ${uid} slot ${slot}`);
    return { ok: true, msg: 'Bot iniciando — esperá el QR' };

  } catch (err) {
    logger.error(`[BotMgr] Error iniciando bot ${uid} slot ${slot}: ${err.message}`);
    instancias.delete(key);
    liberarPuerto(key);
    await updateBotStatus(uid, slot, false, false).catch(() => {});
    await Log.registrar({ userId: uid, tipo: 'error', nivel: 'error', mensaje: `Error al iniciar slot ${slot}: ${err.message}` }).catch(() => {});
    return { ok: false, msg: err.message };
  } finally {
    arranqueEnProceso.delete(key);
  }
}

// ────────────────────────────────────────────────────────────
//  DETENER BOT
// ────────────────────────────────────────────────────────────
async function stopBot(userId, slot = 0) {
  const uid = String(userId);
  const key = botKey(uid, slot);

  // ── Modo híbrido: delegar al worker ───────────────────────
  if (workerHandler.isWorkerAvailable()) {
    try {
      workerHandler.sendToWorker('worker:stop-bot', { userId: uid, slot });
      return { ok: true, msg: 'Señal de parada enviada al worker' };
    } catch (err) {
      logger.warn(`[BotMgr] No se pudo enviar stop al worker: ${err.message}`);
    }
  }

  const bot = instancias.get(key);
  if (!bot) return { ok: false, msg: 'El bot no está activo' };

  try {
    // Cancelar auto-restart pendiente si lo hay
    if (autoRestartTimers.has(key)) {
      clearTimeout(autoRestartTimers.get(key));
      autoRestartTimers.delete(key);
    }
    await bot.detener();
    instancias.delete(key);
    liberarPuerto(key);
    await updateBotStatus(uid, slot, false, false);
    await Log.registrar({ userId: uid, tipo: 'bot_stop', mensaje: `Slot ${slot}: Bot detenido` });
    logger.info(`[BotMgr] Bot detenido para user ${uid} slot ${slot}`);
    emitirAlUsuario(uid, 'bot:stopped', { slot });
    return { ok: true, msg: 'Bot detenido' };
  } catch (err) {
    logger.error(`[BotMgr] Error deteniendo bot ${uid} slot ${slot}: ${err.message}`);
    instancias.delete(key);
    liberarPuerto(key);
    return { ok: false, msg: err.message };
  }
}

// ────────────────────────────────────────────────────────────
//  BOTÓN DE PÁNICO ADMIN — detener Y bloquear usuario
// ────────────────────────────────────────────────────────────
async function panicStop(userId, motivo = 'Bloqueado por administrador') {
  const uid = String(userId);

  // ── Notificar al worker también ───────────────────────────
  if (workerHandler.isWorkerAvailable()) {
    try { workerHandler.sendToWorker('worker:panic-stop', { userId: uid, motivo }); } catch {}
  }

  // Cancelar auto-restart pendiente y detener TODOS los slots del usuario
  for (const [k, timer] of autoRestartTimers.entries()) {
    if (k.startsWith(`${uid}:`)) { clearTimeout(timer); autoRestartTimers.delete(k); }
  }
  // Detener todos los slots activos (no solo slot 0)
  const slotsActivos = Array.from(instancias.keys()).filter(k => k.startsWith(`${uid}:`));
  await Promise.allSettled(slotsActivos.map(k => {
    const slot = parseInt(k.split(':')[1]) || 0;
    return stopBot(uid, slot);
  }));
  // Fallback por si no había instancias pero sí estado en DB
  if (!slotsActivos.length) await stopBot(uid).catch(() => {});

  await User.findByIdAndUpdate(uid, {
    status: 'bloqueado',
    botActivo: false,
    botConectado: false,
    bloqueadoPor: motivo,
  });

  // Forzar desconexión del socket del usuario
  if (global.io) {
    global.io.to(`user:${uid}`).emit('bot:blocked', { motivo });
    global.io.in(`user:${uid}`).disconnectSockets(true);
  }

  await Log.registrar({ userId: uid, tipo: 'security_block', nivel: 'critical', mensaje: `Pánico activado: ${motivo}` });
  logger.warn(`[BotMgr] 🚨 PÁNICO activado para user ${uid}: ${motivo}`);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
//  RESTAURAR BOTS AL REINICIAR SERVIDOR
// ────────────────────────────────────────────────────────────
async function restoreActiveBots() {
  try {
    const usuarios = await User.find({ botActivo: true, status: 'activo' }).select('_id cuentasWA');
    if (!usuarios.length) return;

    logger.info(`[BotMgr] Restaurando bots...`);
    for (const u of usuarios) {
      const uid = u._id.toString();
      // Slot 0 (principal)
      try { await startBot(uid, 0); } catch (e) { logger.error(`[BotMgr] Error restaurando bot ${uid} slot 0: ${e.message}`); }
      // Slots adicionales (Agencia)
      for (const cuenta of (u.cuentasWA || []).filter(c => c.slot > 0 && c.activo)) {
        try { await startBot(uid, cuenta.slot); } catch (e) { logger.error(`[BotMgr] Error restaurando bot ${uid} slot ${cuenta.slot}: ${e.message}`); }
      }
    }
  } catch (err) {
    logger.error('[BotMgr] Error en restoreActiveBots:', err.message);
  }
}

// ────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────
function getBotStatus(userId, slot = 0) {
  const uid = String(userId);
  const key = botKey(uid, slot);
  const bot = instancias.get(key);
  return {
    activo: !!bot,
    slot,
    instancias: instancias.size,
  };
}

function getActiveCount() {
  return instancias.size;
}

function getActiveUserIds() {
  // Devuelve pares únicos userId:slot
  return Array.from(instancias.keys());
}

async function stopAllBots() {
  const keys = Array.from(instancias.keys());
  logger.info(`[BotMgr] Deteniendo ${keys.length} bot(s)...`);
  await Promise.allSettled(keys.map(key => {
    const [uid, slot] = key.split(':');
    return stopBot(uid, parseInt(slot) || 0);
  }));
}

function emitirAlUsuario(userId, evento, datos) {
  if (global.io) {
    global.io.to(`user:${userId}`).emit(evento, datos);
  }
}

// ─── Disparar sincronización de catálogo WA en un bot activo ──
function triggerCatalogSync(userId, slot = 0) {
  const uid = String(userId);
  const key = botKey(uid, slot);

  // Modo local: bot corre en este proceso
  const bot = instancias.get(key);
  if (bot) {
    bot.emit('catalog:sync');
    return true;
  }

  // Modo híbrido: delegar al worker si está conectado
  if (workerHandler.isWorkerAvailable()) {
    try {
      workerHandler.sendToWorker('worker:catalog-sync', { userId: uid, slot });
      return true;
    } catch (e) {
      logger.warn(`[BotMgr] No se pudo enviar catalog:sync al worker: ${e.message}`);
      return false;
    }
  }

  return false;
}

// Notifica al bot que recargue su configuración de Calendar (tokens nuevos)
function recargarCalendar(userId, slot = 0) {
  const uid = String(userId);
  const key = botKey(uid, slot);
  const bot = instancias.get(key);
  if (bot) {
    bot.emit('calendar:reload');
    return true;
  }
  return false;
}

// Notifica al bot que recargue toda su config desde la DB en caliente
// (horarios, días bloqueados, modo pausa, prompt, etc.)
function recargarConfig(userId, slot = 0) {
  const uid = String(userId);
  const key = botKey(uid, slot);
  const bot = instancias.get(key);
  if (bot) {
    bot.emit('config:reload');
    return true;
  }
  return false;
}

// Envía un mensaje WhatsApp desde afuera del bot (usado por reengagement, analytics, etc.)
async function enviarMensajeExterno(userId, jid, texto) {
  const uid = String(userId);
  const key = botKey(uid, 0);
  const bot = instancias.get(key);
  if (bot && typeof bot.enviarMensaje === 'function') {
    await bot.enviarMensaje(jid, texto);
    return true;
  }
  // Modo híbrido: delegar al worker
  if (workerHandler.isWorkerAvailable()) {
    try {
      workerHandler.sendToWorker('worker:send-message', { userId: uid, jid, texto });
      return true;
    } catch { return false; }
  }
  return false;
}

module.exports = {
  startBot,
  stopBot,
  panicStop,
  restoreActiveBots,
  stopAllBots,
  getBotStatus,
  getActiveCount,
  getActiveUserIds,
  triggerCatalogSync,
  recargarCalendar,
  recargarConfig,
  enviarMensajeExterno,
  getWorkerInfo: workerHandler.getWorkerInfo,
};
