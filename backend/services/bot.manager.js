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
// clave: userId (string), valor: instancia del bot
const instancias = new Map();

// ── Locks para evitar arrancar dos veces el mismo bot ────────
const arranqueEnProceso = new Set();

// ── Asignación de puertos sin colisiones ─────────────────────
const PUERTO_BASE  = 3100;
const puertosEnUso = new Set();
const puertosAsignados = new Map(); // userId → puerto

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
async function startBot(userId) {
  const uid = String(userId);

  if (instancias.has(uid)) {
    logger.warn(`[BotMgr] Bot ${uid} ya está corriendo`);
    return { ok: false, msg: 'El bot ya está activo' };
  }

  if (arranqueEnProceso.has(uid)) {
    return { ok: false, msg: 'El bot ya está iniciando' };
  }

  arranqueEnProceso.add(uid);

  try {
    // ── Modo híbrido: delegar al worker si está conectado ──
    if (workerHandler.isWorkerAvailable()) {
      logger.info(`[BotMgr] Delegando bot ${uid} al worker local`);
      workerHandler.sendToWorker('worker:start-bot', { userId: uid });
      arranqueEnProceso.delete(uid);
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
      PORT:                    String(asignarPuerto(uid)),
    };

    if (!credenciales.GROQ_API_KEY) throw new Error('GROQ API Key no configurada o inválida');

    // Directorio de sesión aislado por usuario
    const sessionDir = path.resolve(SESSIONS_PATH, uid);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    // Directorio de memoria del bot
    const dataDir = path.resolve(SESSIONS_PATH, uid, 'data');
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
    instancias.set(uid, bot);

    // ── Eventos del bot → Socket.io + DB ────────────────────
    bot.on('log', (msg) => {
      emitirAlUsuario(uid, 'bot:log', { msg, ts: new Date().toLocaleTimeString('es-AR') });
    });

    bot.on('qr', async (qr) => {
      logger.info(`[BotMgr] QR generado para user ${uid}`);
      emitirAlUsuario(uid, 'bot:qr', { qr });
      await Log.registrar({ userId: uid, tipo: 'bot_qr', mensaje: 'QR generado — esperando escaneo' });
    });

    bot.on('ready', async () => {
      logger.info(`[BotMgr] Bot listo para user ${uid}`);
      await User.findByIdAndUpdate(uid, { botActivo: true, botConectado: true });
      emitirAlUsuario(uid, 'bot:ready', {});
      await Log.registrar({ userId: uid, tipo: 'bot_connected', mensaje: 'WhatsApp conectado y listo' });
    });

    bot.on('disconnected', async (reason) => {
      logger.warn(`[BotMgr] Bot desconectado para user ${uid}: ${reason}`);
      await User.findByIdAndUpdate(uid, { botConectado: false });
      emitirAlUsuario(uid, 'bot:disconnected', { reason });
      await Log.registrar({ userId: uid, tipo: 'bot_disconnected', nivel: 'warn', mensaje: `Desconectado: ${reason}` });
      // Limpiar instancia y puerto
      instancias.delete(uid);
      liberarPuerto(uid);
    });

    bot.on('error', async (err) => {
      logger.error(`[BotMgr] Error en bot de user ${uid}: ${err.message}`);
      emitirAlUsuario(uid, 'bot:error', { msg: err.message });
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
          { catalogo: merged, catalogoSincronizadoEn: new Date() }
        );
        emitirAlUsuario(uid, 'catalog:synced', { count: catalogo.length, total: merged.length });
        logger.info(`[BotMgr] Catálogo WA sincronizado para user ${uid}: ${catalogo.length} productos`);
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
    await User.findByIdAndUpdate(uid, { botActivo: true });
    await Log.registrar({ userId: uid, tipo: 'bot_start', mensaje: 'Bot iniciado' });

    logger.info(`[BotMgr] ✅ Bot iniciado para user ${uid}`);
    return { ok: true, msg: 'Bot iniciando — esperá el QR' };

  } catch (err) {
    logger.error(`[BotMgr] Error iniciando bot ${uid}: ${err.message}`);
    instancias.delete(uid);
    liberarPuerto(uid);
    await User.findByIdAndUpdate(uid, { botActivo: false, botConectado: false }).catch(() => {});
    await Log.registrar({ userId: uid, tipo: 'error', nivel: 'error', mensaje: `Error al iniciar: ${err.message}` }).catch(() => {});
    return { ok: false, msg: err.message };
  } finally {
    arranqueEnProceso.delete(uid);
  }
}

// ────────────────────────────────────────────────────────────
//  DETENER BOT
// ────────────────────────────────────────────────────────────
async function stopBot(userId) {
  const uid = String(userId);

  // ── Modo híbrido: delegar al worker ───────────────────────
  if (workerHandler.isWorkerAvailable()) {
    try {
      workerHandler.sendToWorker('worker:stop-bot', { userId: uid });
      return { ok: true, msg: 'Señal de parada enviada al worker' };
    } catch (err) {
      logger.warn(`[BotMgr] No se pudo enviar stop al worker: ${err.message}`);
    }
  }

  const bot = instancias.get(uid);
  if (!bot) return { ok: false, msg: 'El bot no está activo' };

  try {
    await bot.detener();
    instancias.delete(uid);
    liberarPuerto(uid);
    await User.findByIdAndUpdate(uid, { botActivo: false, botConectado: false });
    await Log.registrar({ userId: uid, tipo: 'bot_stop', mensaje: 'Bot detenido' });
    logger.info(`[BotMgr] Bot detenido para user ${uid}`);
    emitirAlUsuario(uid, 'bot:stopped', {});
    return { ok: true, msg: 'Bot detenido' };
  } catch (err) {
    logger.error(`[BotMgr] Error deteniendo bot ${uid}: ${err.message}`);
    instancias.delete(uid);
    liberarPuerto(uid);
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

  await stopBot(uid).catch(() => {});

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
    const usuarios = await User.find({ botActivo: true, status: 'activo' }).select('_id');
    if (!usuarios.length) return;

    logger.info(`[BotMgr] Restaurando ${usuarios.length} bot(s)...`);
    for (const u of usuarios) {
      try {
        await startBot(u._id.toString());
      } catch (e) {
        logger.error(`[BotMgr] Error restaurando bot ${u._id}: ${e.message}`);
      }
    }
  } catch (err) {
    logger.error('[BotMgr] Error en restoreActiveBots:', err.message);
  }
}

// ────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────
function getBotStatus(userId) {
  const uid = String(userId);
  const bot = instancias.get(uid);
  return {
    activo: !!bot,
    instancias: instancias.size,
  };
}

function getActiveCount() {
  return instancias.size;
}

function getActiveUserIds() {
  return Array.from(instancias.keys());
}

async function stopAllBots() {
  const uids = Array.from(instancias.keys());
  logger.info(`[BotMgr] Deteniendo ${uids.length} bot(s)...`);
  await Promise.allSettled(uids.map(uid => stopBot(uid)));
}

function emitirAlUsuario(userId, evento, datos) {
  if (global.io) {
    global.io.to(`user:${userId}`).emit(evento, datos);
  }
}

// ─── Disparar sincronización de catálogo WA en un bot activo ──
function triggerCatalogSync(userId) {
  const uid = String(userId);

  // Modo local: bot corre en este proceso
  const bot = instancias.get(uid);
  if (bot) {
    bot.emit('catalog:sync');
    return true;
  }

  // Modo híbrido: delegar al worker si está conectado
  if (workerHandler.isWorkerAvailable()) {
    try {
      workerHandler.sendToWorker('worker:catalog-sync', { userId: uid });
      return true;
    } catch (e) {
      logger.warn(`[BotMgr] No se pudo enviar catalog:sync al worker: ${e.message}`);
      return false;
    }
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
  getWorkerInfo: workerHandler.getWorkerInfo,
};
