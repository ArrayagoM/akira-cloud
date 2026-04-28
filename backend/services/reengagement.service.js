// services/reengagement.service.js
// Re-engagement automático: detecta clientes inactivos y les envía WhatsApp.
'use strict';

let nodeCron;
try { nodeCron = require('node-cron'); } catch { nodeCron = null; }

const BotCliente = require('../models/BotCliente');
const Turno      = require('../models/Turno');
const User       = require('../models/User');
const Config     = require('../models/Config');
const logger     = require('../config/logger');

let botManagerRef = null;

function iniciar(botManager) {
  botManagerRef = botManager;
  if (!nodeCron) {
    logger.warn('[Reengagement] node-cron no disponible — re-engagement desactivado');
    return;
  }
  // Todos los días a las 10:00 AM Argentina (UTC-3 = 13:00 UTC)
  nodeCron.schedule('0 13 * * *', async () => {
    logger.info('[Reengagement] Iniciando ciclo diario...');
    await ejecutarCiclo();
  }, { timezone: 'UTC' });

  logger.info('[Reengagement] Cron diario activo (10:00 AM Argentina)');
}

async function ejecutarCiclo() {
  try {
    const usuarios = await User.find({
      botActivo: true,
      status: 'activo',
      $expr: {
        $or: [
          { $eq: ['$plan', 'admin'] },
          { $and: [{ $ne: ['$plan', 'trial'] }, { $gt: ['$planExpira', new Date()] }] },
          { $eq: ['$esTester', true] },
        ],
      },
    }).lean();

    logger.info(`[Reengagement] Procesando ${usuarios.length} negocios activos`);
    for (const user of usuarios) {
      try {
        await procesarNegocio(user);
      } catch (e) {
        logger.error(`[Reengagement] Error en user ${user._id}: ${e.message}`);
      }
    }
  } catch (e) {
    logger.error(`[Reengagement] Error ciclo: ${e.message}`);
  }
}

// Devuelve el intervalo en días que aplica para un cliente:
//   1) override del cliente (BotCliente.intervaloRecordatorioDias)
//   2) intervalo del último servicio que reservó (matched en serviciosList por nombre)
//   3) default 30
function intervaloAplicable(cliente, ultimoServicioNombre, serviciosList) {
  if (cliente?.intervaloRecordatorioDias && cliente.intervaloRecordatorioDias > 0) {
    return { dias: cliente.intervaloRecordatorioDias, fuente: 'cliente', servicio: null };
  }
  if (ultimoServicioNombre && Array.isArray(serviciosList)) {
    const svc = serviciosList.find(s =>
      String(s.nombre || '').trim().toLowerCase() === String(ultimoServicioNombre).trim().toLowerCase()
    );
    if (svc?.intervaloRecordatorioDias > 0) {
      return { dias: svc.intervaloRecordatorioDias, fuente: 'servicio', servicio: svc };
    }
  }
  return { dias: 30, fuente: 'default', servicio: null };
}

async function procesarNegocio(user) {
  const userId = user._id;
  const config = await Config.findOne({ userId }).lean();
  if (!config) return;
  if (config.activarReengagement === false) return;

  const ahora    = Date.now();
  const hace8    = new Date(ahora - 8   * 86400000);  // mínimo: ningún recordatorio antes de 8 días
  const hace365  = new Date(ahora - 365 * 86400000);  // máximo: 1 año

  // Clientes con turno confirmado en ventana razonable (8d–365d)
  const turnos = await Turno.aggregate([
    { $match: { userId, estado: 'confirmado' } },
    { $sort: { fechaFin: -1 } },
    { $group: {
        _id: '$clienteTelefono',
        ultimoTurno: { $first: '$fechaFin' },
        ultimoServicio: { $first: '$resumen' },
        nombre: { $first: '$clienteNombre' },
    } },
    { $match: { ultimoTurno: { $lt: hace8, $gt: hace365 } } },
  ]);

  const NOMBRE_NEGOCIO = config.miNombre || 'el negocio';
  const serviciosList  = config.serviciosList || [];
  let enviados = 0;

  for (const t of turnos) {
    if (!t._id) continue;
    const jid = await buscarJidPorTel(userId, t._id);
    if (!jid) continue;

    const cliente = await BotCliente.findOne({ userId, jid }).lean();
    if (!cliente) continue;

    const diasSinTurno = Math.floor((ahora - new Date(t.ultimoTurno).getTime()) / 86400000);
    const { dias: umbralDias, fuente, servicio } = intervaloAplicable(
      cliente,
      cliente?.ultimoServicio || t.ultimoServicio,
      serviciosList
    );

    // Solo recordar si ya pasó el intervalo configurado
    if (diasSinTurno < umbralDias) continue;

    // No spamear: respetar al menos el intervalo entre mensajes de reengagement (mínimo 14 días)
    const intervaloEntreMsgs = Math.max(14, Math.floor(umbralDias / 2));
    if (cliente.ultimoMensajeReengagement) {
      const diasDesdeUltimo = (ahora - new Date(cliente.ultimoMensajeReengagement).getTime()) / 86400000;
      if (diasDesdeUltimo < intervaloEntreMsgs) continue;
    }

    let mensaje;
    const nombre = t.nombre || cliente.nombre || 'cliente';
    const sustituir = (txt) => txt
      .replace(/\{nombre\}/g, nombre)
      .replace(/\{negocio\}/g, NOMBRE_NEGOCIO)
      .replace(/\{dias\}/g, String(diasSinTurno))
      .replace(/\{servicio\}/g, servicio?.nombre || cliente?.ultimoServicio || 'tu servicio');

    if (fuente === 'servicio' && servicio?.mensajeRecordatorio?.trim()) {
      mensaje = sustituir(servicio.mensajeRecordatorio);
    } else if (diasSinTurno >= 60 && config.mensajeReengagement60?.trim()) {
      mensaje = sustituir(config.mensajeReengagement60);
    } else if (diasSinTurno >= 30 && config.mensajeReengagement30?.trim()) {
      mensaje = sustituir(config.mensajeReengagement30);
    } else if (servicio?.nombre) {
      mensaje = `¡Hola ${nombre}! 👋 Pasaron *${diasSinTurno} días* desde tu último *${servicio.nombre}* en *${NOMBRE_NEGOCIO}*.\n¿Reservamos un nuevo turno? 📅`;
    } else if (diasSinTurno >= 60) {
      mensaje = `¡Hola ${nombre}! 👋 Hace tiempo que no nos vemos en *${NOMBRE_NEGOCIO}*.\n¿Querés que te busquemos un turno esta semana? 😊`;
    } else {
      mensaje = `¡Hola ${nombre}! Hace un tiempo que no te vemos en *${NOMBRE_NEGOCIO}*. ¿Renovamos tu turno? 📅`;
    }

    try {
      const ok = await enviarDesdeBot(userId, jid, mensaje);
      if (ok) {
        await BotCliente.updateOne({ userId, jid }, { $set: { ultimoMensajeReengagement: new Date() } });
        enviados++;
        logger.info(`[Reengagement] ✅ ${nombre} (${diasSinTurno} días inactivo)`);
        // Pausa entre mensajes para no saturar
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      logger.warn(`[Reengagement] No se pudo enviar a ${jid}: ${e.message}`);
    }
  }
  if (enviados > 0) logger.info(`[Reengagement] ${NOMBRE_NEGOCIO}: ${enviados} mensajes enviados`);
}

async function buscarJidPorTel(userId, telefono) {
  if (!telefono) return null;
  const tel = String(telefono).replace(/\D/g, '');
  const cliente = await BotCliente.findOne({ userId, $or: [
    { numeroReal: tel },
    { telefono: tel },
    { jid: { $regex: tel } },
  ]}).lean();
  return cliente?.jid || null;
}

async function enviarDesdeBot(userId, jid, mensaje) {
  if (!botManagerRef) return false;
  try {
    return await botManagerRef.enviarMensajeExterno(String(userId), jid, mensaje);
  } catch { return false; }
}

module.exports = { iniciar, ejecutarCiclo };
