// services/system.bot.js
// Canal de comandos de sistema, SOLO para el admin de la plataforma, vía WhatsApp.
//
// Gate de seguridad (se aplica en akira.bot.js, no acá):
//   fromMe === true (garantía criptográfica de Baileys/Signal — nadie puede
//   falsificar esto desde otro número) + el chat es el número configurado
//   como "canal de admin" para esa cuenta + esa cuenta tiene rol==='admin'
//   en Mongo. Este módulo NUNCA valida eso — asume que ya se validó antes
//   de invocarlo.
//
// Todo el parseo de comandos es DETERMINÍSTICO (regex/keywords) — el LLM
// nunca decide si reiniciar o no un bot ajeno, dado el historial de
// alucinaciones de Groq en este proyecto (cobro 3x, tool_calls huérfanos,
// bookings espontáneos). Una acción que reinicia infraestructura de un
// cliente no puede depender de que el modelo "interprete bien" la intención.
'use strict';

const Log    = require('../models/Log');
const Config = require('../models/Config');

// ── Inyección de dependencias (evita require circular con bot.manager.js,
// que a su vez requiere akira.bot.js) — server.js llama a esto una sola vez
// al arrancar, después de cargar botManager.
let _botManager = null;
function configurarBotManager(bm) {
  _botManager = bm;
}

// ── Canal de admin — un solo admin en esta plataforma hoy. Si en el futuro
// hay más de uno, esto pasa a ser un Map indexado por adminUserId.
let adminChannel = null; // { userId, jid }
function registrarCanalAdmin(userId, jid) {
  adminChannel = { userId: String(userId), jid };
}
function _soloParaTests_getAdminChannel() {
  return adminChannel;
}

// ── Confirmación pendiente — una sola acción a la vez (un solo admin).
let pendiente = null; // { accion, targetUserId, targetSlot, negocio, createdAt, expiresAt }
const VENTANA_CONFIRMACION_MS = 5 * 60 * 1000;

function limpiarSiExpiro(ahora = Date.now()) {
  if (pendiente && ahora > pendiente.expiresAt) pendiente = null;
}

function _soloParaTests_setPendiente(p) { pendiente = p; }
function _soloParaTests_getPendiente() { return pendiente; }
function _soloParaTests_reset() { pendiente = null; adminChannel = null; }

// Detección barata (sin async, sin Mongo) de si un texto POdría ser un
// comando de sistema — usado en akira.bot.js para evitar hacer trabajo de
// más cuando claramente no aplica.
function esComandoSistemaCandidato(texto) {
  const t = (texto || '').trim().toLowerCase();
  if (!t) return false;
  return t.startsWith('sistema') || ['si', 'sí', 'confirmar', 'confirmo', 'no', 'cancelar'].includes(t);
}

function escaparRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function manejarComandoSistema(textoOriginal, jid, adminUserId, enviarMensajeFn) {
  limpiarSiExpiro();
  const texto = (textoOriginal || '').trim().toLowerCase();

  // ── Confirmar/cancelar acción pendiente ─────────────────────
  if (['si', 'sí', 'confirmar', 'confirmo'].includes(texto)) {
    if (!pendiente) return false; // nada pendiente — no comerse el mensaje
    const { accion, targetUserId, targetSlot, negocio } = pendiente;
    pendiente = null;
    if (accion === 'restart' && _botManager) {
      await Log.registrar({
        userId: adminUserId, tipo: 'admin_action', nivel: 'critical',
        mensaje: `Admin confirmó restart de "${negocio}" vía WhatsApp`,
      });
      await enviarMensajeFn(jid, `🔄 Reiniciando *${negocio}*...`);
      await _botManager.stopBot(targetUserId, targetSlot).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      const res = await _botManager.startBot(targetUserId, targetSlot);
      await enviarMensajeFn(
        jid,
        res.ok
          ? `✅ *${negocio}* reiniciado — esperando reconexión.`
          : `❌ No se pudo reiniciar *${negocio}*: ${res.msg}`,
      );
    }
    return true;
  }
  if (['no', 'cancelar'].includes(texto)) {
    if (!pendiente) return false;
    const negocio = pendiente.negocio;
    pendiente = null;
    await enviarMensajeFn(jid, `Cancelado. No se tocó *${negocio}*.`);
    return true;
  }

  if (!texto.startsWith('sistema')) return false;
  if (!_botManager) {
    await enviarMensajeFn(jid, '⚠️ Sistema no disponible ahora mismo.');
    return true;
  }

  const resto = texto.replace(/^sistema\s*/, '').trim();

  if (!resto || resto === 'ayuda') {
    await enviarMensajeFn(
      jid,
      `*Comandos de sistema:*\n` +
        `• *sistema estado* — resumen de todos los bots\n` +
        `• *sistema caidos* — solo los que están caídos\n` +
        `• *sistema reiniciar <negocio>* — reinicia un bot (pide confirmación)\n` +
        `• *sistema ayuda* — este mensaje`,
    );
    return true;
  }

  if (resto === 'estado' || resto === 'caidos') {
    const User = require('../models/User');
    const workerInfo = _botManager.getWorkerInfo();
    const usuarios = await User.find({ botActivo: true, status: 'activo' })
      .select('_id botActivo botConectado').lean();
    const configs = await Config.find({ userId: { $in: usuarios.map((u) => u._id) } })
      .select('userId negocio').lean();
    const negocioPorUid = {};
    configs.forEach((c) => { negocioPorUid[String(c.userId)] = c.negocio || 'Sin nombre'; });

    if (resto === 'caidos') {
      const caidos = usuarios.filter((u) => u.botActivo && !u.botConectado);
      if (!caidos.length) {
        await enviarMensajeFn(jid, '✅ No hay bots caídos.');
        return true;
      }
      const lineas = caidos.map((u) => `🔴 ${negocioPorUid[String(u._id)] || String(u._id).slice(-6)}`);
      await enviarMensajeFn(jid, `*Bots caídos (${caidos.length}):*\n${lineas.join('\n')}`);
      return true;
    }

    const lineas = usuarios.map((u) => {
      const negocio = negocioPorUid[String(u._id)] || String(u._id).slice(-6);
      const estado = u.botConectado ? '🟢 conectado' : '🔴 caído';
      return `${negocio}: ${estado}`;
    });
    await enviarMensajeFn(
      jid,
      `*Estado del sistema*\n` +
        `Worker: ${workerInfo?.conectado ? '🟢 conectado' : '🔴 desconectado'}\n` +
        `Bots marcados activos: ${usuarios.length}\n\n${lineas.join('\n') || 'Ninguno activo.'}`,
    );
    return true;
  }

  if (resto.startsWith('reiniciar')) {
    const query = resto.replace(/^reiniciar\s*/, '').trim();
    if (!query) {
      await enviarMensajeFn(jid, 'Uso: sistema reiniciar <nombre del negocio>');
      return true;
    }
    const matches = await Config.find({ negocio: new RegExp(escaparRegex(query), 'i') })
      .select('userId negocio').lean();
    if (!matches.length) {
      await enviarMensajeFn(jid, `No encontré ningún negocio que coincida con "${query}".`);
      return true;
    }
    if (matches.length > 1) {
      const lista = matches.map((m, i) => `${i + 1}. ${m.negocio}`).join('\n');
      await enviarMensajeFn(jid, `Encontré varios:\n${lista}\n\nEspecificá mejor el nombre.`);
      return true;
    }
    const match = matches[0];
    const status = _botManager.getBotStatus(match.userId, 0);
    pendiente = {
      accion: 'restart',
      targetUserId: String(match.userId),
      targetSlot: 0,
      negocio: match.negocio,
      createdAt: Date.now(),
      expiresAt: Date.now() + VENTANA_CONFIRMACION_MS,
    };
    await Log.registrar({
      userId: adminUserId, tipo: 'admin_action', nivel: 'warn',
      mensaje: `Admin propuso restart de "${match.negocio}" vía WhatsApp`,
    });
    await enviarMensajeFn(
      jid,
      `⚠️ ¿Confirmás reiniciar el bot de *${match.negocio}*?\n` +
        `Estado actual: ${status.activo ? 'corriendo' : 'detenido'}.\n` +
        `Respondé *SI* para confirmar o *NO* para cancelar. Vence en 5 min.`,
    );
    return true;
  }

  return false;
}

// ── Alertas proactivas: si CUALQUIER bot se cae, avisar al admin ────────
// Se engancha al emitter de Log (ver models/Log.js) — no requiere tocar
// bot.manager.js/worker.handler.js, que ya llaman Log.registrar() en cada
// caída de bot.
const TIPOS_ALERTA = new Set(['bot_disconnected', 'bot_session_expired']);
Log.eventos.on('registrado', ({ userId, tipo, mensaje }) => {
  if (!adminChannel || !_botManager) return;
  if (!TIPOS_ALERTA.has(tipo)) return;
  if (String(userId) === adminChannel.userId) return; // evita bucle con el propio canal admin
  Config.findOne({ userId }).select('negocio').lean()
    .then((cfg) => {
      const negocio = cfg?.negocio || String(userId).slice(-6);
      return _botManager.enviarMensajeExterno(
        adminChannel.userId,
        adminChannel.jid,
        `🚨 *Bot caído*\n🏢 ${negocio}\n📋 ${mensaje}`,
      );
    })
    .catch(() => {});
});

module.exports = {
  configurarBotManager,
  registrarCanalAdmin,
  esComandoSistemaCandidato,
  manejarComandoSistema,
  _soloParaTests_getAdminChannel,
  _soloParaTests_setPendiente,
  _soloParaTests_getPendiente,
  _soloParaTests_reset,
};
