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

async function procesarNegocio(user) {
  const userId = user._id;
  const config = await Config.findOne({ userId }).lean();
  if (!config) return;
  if (config.activarReengagement === false) return;

  const ahora    = Date.now();
  const hace30   = new Date(ahora - 30  * 86400000);
  const hace120  = new Date(ahora - 120 * 86400000);

  // Clientes con turno confirmado pero el último fue hace más de 30 días
  const turnos = await Turno.aggregate([
    { $match: { userId, estado: 'confirmado' } },
    { $group: { _id: '$clienteTelefono', ultimoTurno: { $max: '$fechaFin' }, nombre: { $last: '$clienteNombre' } } },
    { $match: { ultimoTurno: { $lt: hace30, $gt: hace120 } } },
  ]);

  const NOMBRE_NEGOCIO = config.miNombre || 'el negocio';
  let enviados = 0;

  for (const t of turnos) {
    if (!t._id) continue;
    const jid = await buscarJidPorTel(userId, t._id);
    if (!jid) continue;

    const cliente = await BotCliente.findOne({ userId, jid }).lean();
    if (!cliente) continue;

    // No spamear: esperar 30 días entre mensajes de reengagement
    if (cliente.ultimoMensajeReengagement) {
      const diasDesdeUltimo = (ahora - new Date(cliente.ultimoMensajeReengagement).getTime()) / 86400000;
      if (diasDesdeUltimo < 30) continue;
    }

    const diasSinTurno = Math.floor((ahora - new Date(t.ultimoTurno).getTime()) / 86400000);
    let mensaje;
    const nombre = t.nombre || cliente.nombre || 'cliente';

    if (diasSinTurno >= 60 && config.mensajeReengagement60?.trim()) {
      mensaje = config.mensajeReengagement60.replace('{nombre}', nombre).replace('{negocio}', NOMBRE_NEGOCIO);
    } else if (diasSinTurno >= 30 && config.mensajeReengagement30?.trim()) {
      mensaje = config.mensajeReengagement30.replace('{nombre}', nombre).replace('{negocio}', NOMBRE_NEGOCIO);
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
