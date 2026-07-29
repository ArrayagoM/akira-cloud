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
const { featuresDePlan } = require('../config/planes');
const { mesActual } = require('./bot/quota.service');

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
// Solo borra si coincide el userId — evita que un bot que se está apagando
// pise el registro de otro admin (previendo el día en que haya más de uno).
function desregistrarCanalAdmin(userId) {
  if (adminChannel && adminChannel.userId === String(userId)) adminChannel = null;
}
// Única fuente de verdad de "¿este mensaje viene del canal de control?".
// akira.bot.js llama esto en vez de guardar su propia copia del JID, así
// un cambio de número (dashboard, patch directo, o "sistema numero") se
// refleja de inmediato sin esperar un reinicio del bot.
function esCanalAdminActivo(userId, jid) {
  return !!(adminChannel && adminChannel.userId === String(userId) && adminChannel.jid === jid);
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

// ── Funciones puras (sin Mongo, sin _botManager) — separadas para poder
// testearlas sin una DB real, mismo criterio que quota.service.js.

function validarNumeroContacto(numeroCrudo) {
  const soloDigitos = String(numeroCrudo || '').replace(/\D/g, '');
  if (soloDigitos.length < 8 || soloDigitos.length > 15) {
    return {
      ok: false,
      digits: null,
      error: `Número inválido: "${numeroCrudo}". Usá solo dígitos, con código de país (ej: 5493411234567).`,
    };
  }
  return { ok: true, digits: soloDigitos, error: null };
}

// usuarios: [{ _id, plan, botActivo, botConectado, mensajesMes, mesContadorMensajes }]
// negocioPorUid: { [userId]: nombreNegocio }
function construirReporte({ usuarios, negocioPorUid, erroresCount, workerConectado, mesStr }) {
  const activos = usuarios.filter((u) => u.botActivo);
  const conectados = activos.filter((u) => u.botConectado);
  const caidos = activos.filter((u) => !u.botConectado);

  const porPlan = {};
  usuarios.forEach((u) => {
    const p = u.plan || 'trial';
    porPlan[p] = (porPlan[p] || 0) + 1;
  });
  const lineaPlanes = Object.entries(porPlan).map(([p, n]) => `${p}: ${n}`).join(' · ') || 'Sin usuarios';

  const cercaDelLimite = usuarios
    .filter((u) => u.mesContadorMensajes === mesStr)
    .map((u) => {
      const { mensajesMes: limite } = featuresDePlan(u.plan);
      if (limite === Infinity) return null;
      const usados = u.mensajesMes || 0;
      if (usados / limite < 0.8) return null;
      return `${negocioPorUid[String(u._id)] || String(u._id).slice(-6)}: ${usados}/${limite}`;
    })
    .filter(Boolean);

  return (
    `*📊 Reporte del sistema*\n` +
    `Negocios activos: ${activos.length} (🟢 ${conectados.length} conectados, 🔴 ${caidos.length} caídos)\n` +
    `Worker: ${workerConectado ? '🟢 conectado' : '🔴 desconectado'}\n\n` +
    `*Por plan:* ${lineaPlanes}\n\n` +
    `*Cerca del límite de mensajes:*\n${cercaDelLimite.join('\n') || 'Ninguno.'}\n\n` +
    `*Errores/críticos (24h):* ${erroresCount}`
  );
}

// logs: [{ userId, tipo, nivel, mensaje, createdAt }]
function formatearListaErrores(logs, negocioPorUid) {
  if (!logs.length) return '✅ Sin errores registrados.';
  const lineas = logs.map((l) => {
    const negocio = l.userId ? (negocioPorUid[String(l.userId)] || String(l.userId).slice(-6)) : 'Sistema';
    const fecha = new Date(l.createdAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    const icono = l.nivel === 'critical' ? '🔴' : '🟠';
    return `${icono} [${fecha}] ${negocio} — ${l.mensaje}`;
  });
  return `*Últimos ${logs.length} errores:*\n${lineas.join('\n')}`;
}

async function manejarComandoSistema(textoOriginal, jid, adminUserId, enviarMensajeFn) {
  limpiarSiExpiro();
  const texto = (textoOriginal || '').trim().toLowerCase();

  // ── Confirmar/cancelar acción pendiente ─────────────────────
  if (['si', 'sí', 'confirmar', 'confirmo'].includes(texto)) {
    if (!pendiente) return false; // nada pendiente — no comerse el mensaje
    const { accion, targetUserId, targetSlot, negocio, numero } = pendiente;
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
    } else if (accion === 'set_numero') {
      const nuevoJid = `${numero}@s.whatsapp.net`;
      await Config.findOneAndUpdate(
        { userId: adminUserId },
        { $set: { celularNotificaciones: numero } },
        { upsert: true },
      );
      registrarCanalAdmin(adminUserId, nuevoJid);
      await Log.registrar({
        userId: adminUserId, tipo: 'admin_action', nivel: 'info',
        mensaje: `Admin actualizó el número de contacto del sistema a ${numero}`,
      });
      await enviarMensajeFn(
        jid,
        `✅ Número de contacto actualizado a *${numero}*.\n` +
          `Las alertas y los comandos de sistema van a ese número a partir de ahora.`,
      );
    }
    return true;
  }
  if (['no', 'cancelar'].includes(texto)) {
    if (!pendiente) return false;
    const { accion, negocio } = pendiente;
    pendiente = null;
    const detalle = accion === 'set_numero' ? 'el número de contacto' : `*${negocio}*`;
    await enviarMensajeFn(jid, `Cancelado. No se tocó ${detalle}.`);
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
        `• *sistema reporte* — analítica completa de la plataforma\n` +
        `• *sistema errores [n]* — últimos errores/críticos (default 10)\n` +
        `• *sistema numero <número>* — cambia a dónde llegan alertas y comandos\n` +
        `• *sistema reiniciar <negocio>* — reinicia un bot (pide confirmación)\n` +
        `• *sistema ayuda* — este mensaje`,
    );
    return true;
  }

  if (resto === 'numero' || resto.startsWith('numero ')) {
    const numeroCrudo = resto.replace(/^numero\s*/, '').trim();
    if (!numeroCrudo) {
      const actual = adminChannel?.jid ? adminChannel.jid.replace('@s.whatsapp.net', '') : '(sin configurar)';
      await enviarMensajeFn(
        jid,
        `📱 Número de contacto actual: *${actual}*\n\nPara cambiarlo: *sistema numero <nuevo número>*`,
      );
      return true;
    }
    const validacion = validarNumeroContacto(numeroCrudo);
    if (!validacion.ok) {
      await enviarMensajeFn(jid, `❌ ${validacion.error}`);
      return true;
    }
    const soloDigitos = validacion.digits;
    pendiente = {
      accion: 'set_numero',
      numero: soloDigitos,
      negocio: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + VENTANA_CONFIRMACION_MS,
    };
    await enviarMensajeFn(
      jid,
      `⚠️ ¿Confirmás cambiar el número de contacto del sistema a *${soloDigitos}*?\n` +
        `Los comandos "sistema ..." y las alertas van a ir a ese número a partir de ahora.\n` +
        `Respondé *SI* para confirmar o *NO* para cancelar. Vence en 5 min.`,
    );
    return true;
  }

  if (resto === 'reporte' || resto === 'resumen' || resto === 'analisis' || resto === 'análisis') {
    const User = require('../models/User');
    const usuarios = await User.find({ status: 'activo' })
      .select('_id plan botActivo botConectado mensajesMes mesContadorMensajes').lean();
    const configs = await Config.find({ userId: { $in: usuarios.map((u) => u._id) } })
      .select('userId negocio').lean();
    const negocioPorUid = {};
    configs.forEach((c) => { negocioPorUid[String(c.userId)] = c.negocio || 'Sin nombre'; });

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const erroresCount = await Log.countDocuments({
      nivel: { $in: ['error', 'critical'] },
      createdAt: { $gte: hace24h },
    });

    const workerInfo = _botManager.getWorkerInfo();

    await enviarMensajeFn(
      jid,
      construirReporte({
        usuarios,
        negocioPorUid,
        erroresCount,
        workerConectado: !!workerInfo?.conectado,
        mesStr: mesActual(),
      }),
    );
    return true;
  }

  if (resto === 'errores' || resto.startsWith('errores ')) {
    const argN = parseInt(resto.replace(/^errores\s*/, '').trim(), 10);
    const n = Number.isFinite(argN) ? Math.min(Math.max(argN, 1), 25) : 10;

    const logs = await Log.find({ nivel: { $in: ['error', 'critical'] } })
      .sort({ createdAt: -1 }).limit(n)
      .select('userId tipo nivel mensaje createdAt').lean();

    const uids = [...new Set(logs.map((l) => String(l.userId)).filter(Boolean))];
    const configs = await Config.find({ userId: { $in: uids } }).select('userId negocio').lean();
    const negocioPorUid = {};
    configs.forEach((c) => { negocioPorUid[String(c.userId)] = c.negocio || 'Sin nombre'; });

    await enviarMensajeFn(jid, formatearListaErrores(logs, negocioPorUid));
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
  desregistrarCanalAdmin,
  esCanalAdminActivo,
  esComandoSistemaCandidato,
  manejarComandoSistema,
  validarNumeroContacto,
  construirReporte,
  formatearListaErrores,
  _soloParaTests_getAdminChannel,
  _soloParaTests_setPendiente,
  _soloParaTests_getPendiente,
  _soloParaTests_reset,
};
