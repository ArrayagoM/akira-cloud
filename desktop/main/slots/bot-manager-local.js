// slots/bot-manager-local.js
// Equivalente local de backend/services/bot.manager.js — misma construcción
// de `credenciales` para crearAkiraBot, pero:
//   - Config sale del SQLite local (bot-engine/models/Config.js), no de Mongo.
//   - GROQ/MP/Rime/Calendar keys salen de credentials-store (safeStorage),
//     no de crypto.service.js.
//   - plan/features salen del license-client (cacheados de la última
//     activación/heartbeat contra el servidor de licencias), no de `User.planVigente()`.
//   - SIEMPRE modo cloud-direct (crearAkiraBot sin options.externalSock) —
//     acá no hay "worker remoto": Baileys corre en este mismo proceso.
//   - Multi-slot: un Map<slot, bot> — cada slot es una cuenta de WhatsApp
//     distinta de ESTE MISMO negocio (ver SKILL/plan: gateado por
//     slotsMax del plan, igual que SLOTS_POR_PLAN hoy).
'use strict';

const path = require('path');
const fs = require('fs');

const crearAkiraBot = require('../bot-engine/services/akira.bot');
const Config = require('../bot-engine/models/Config');
const licenseClient = require('../license/license-client');

const instancias = new Map(); // slot → bot (EventEmitter con .iniciar/.detener/.enviarMensaje)

function sessionDirName(slot) {
  return slot === 0 ? 'principal' : `slot-${slot}`;
}

async function construirCredenciales(userId, slot) {
  const config = await Config.findOne({ userId });
  if (!config) throw new Error('Configuración no encontrada — completá los datos del negocio primero.');
  if (!config.estaCompleta()) throw new Error('Configuración incompleta. Cargá tu Groq API Key primero.');

  const estadoLicencia = licenseClient.getEstado();
  if (!estadoLicencia) throw new Error('Licencia no activada todavía.');
  const { plan, features } = estadoLicencia;

  const credenciales = {
    GROQ_API_KEY: config.getKey('keyGroq'),
    MP_ACCESS_TOKEN: features?.mercadopago ? (config.getKey('keyMP') || '') : '',
    CALENDAR_ID: config.getKey('idCalendar') || '',
    RIME_API_KEY: features?.audio ? (config.getKey('keyRime') || '') : '',
    PLAN: plan || 'trial',
    NGROK_AUTH_TOKEN: config.getKey('keyNgrok') || '',
    NGROK_DOMAIN: config.dominioNgrok || '',
    MI_NOMBRE: config.miNombre,
    NEGOCIO: config.negocio,
    SERVICIOS: config.servicios,
    PRECIO_TURNO: String(config.precioTurno),
    HORAS_MINIMAS_CANCELACION: String(config.horasCancelacion),
    PROMPT_PERSONALIZADO: config.promptPersonalizado || '',
    ALIAS_TRANSFERENCIA: config.aliasTransferencia || '',
    CBU_TRANSFERENCIA: config.cbuTransferencia || '',
    BANCO_TRANSFERENCIA: config.bancoTransferencia || '',
    SERVICIOS_LIST: JSON.stringify(config.serviciosList || []),
    HORARIOS_ATENCION: JSON.stringify(config.horariosAtencion || {}),
    DIAS_BLOQUEADOS: JSON.stringify(config.diasBloqueados || []),
    MODO_PAUSA: String(config.modoPausa || false),
    CELULAR_NOTIFICACIONES: config.celularNotificaciones || '',
    CHATS_IGNORADOS: JSON.stringify(config.chatsIgnorados || []),
    TIPO_NEGOCIO: config.tipoNegocio || 'turnos',
    CHECK_IN_HORA: config.checkInHora || '14:00',
    CHECK_OUT_HORA: config.checkOutHora || '10:00',
    MINIMA_ESTADIA: String(config.minimaEstadia || 1),
    UNIDADES_ALOJAMIENTO: JSON.stringify(config.unidadesAlojamiento || []),
    DIRECCION_PROPIEDAD: config.direccionPropiedad || '',
    LINK_UBICACION: config.linkUbicacion || '',
    CATALOGO: JSON.stringify(config.catalogo || []),
  };

  if (!credenciales.GROQ_API_KEY) throw new Error('Groq API Key no configurada o inválida');

  if (features?.calendar && config.googleCalendarTokens?.encrypted) {
    credenciales.GOOGLE_CALENDAR_TOKENS = config.getKey('googleCalendarTokens');
    credenciales.GOOGLE_EMAIL = config.googleEmail || '';
  }
  if (features?.calendar && config.credentialsGoogleB64?.encrypted) {
    credenciales._GOOGLE_CREDENTIALS_JSON = config.getKey('credentialsGoogleB64');
  }

  return credenciales;
}

// baseDir: app.getPath('userData') del proceso Electron — pasado desde
// main/index.js para no acoplar este módulo a `electron` directamente
// (facilita testear la construcción de credenciales sin levantar Electron).
async function iniciarSlot(baseDir, userId, slot, onEvento) {
  if (instancias.has(slot)) {
    return { ok: false, error: 'Ese slot ya está corriendo.' };
  }

  const estadoLicencia = licenseClient.getEstado();
  const slotsMax = estadoLicencia?.slotsMax ?? 1;
  if (slot >= slotsMax) {
    return { ok: false, error: `Tu plan permite hasta ${slotsMax} cuenta(s) de WhatsApp.` };
  }

  const credenciales = await construirCredenciales(userId, slot);

  const sessionDir = path.join(baseDir, 'sessions', sessionDirName(slot));
  fs.mkdirSync(sessionDir, { recursive: true });
  const dataDir = path.join(sessionDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  if (credenciales._GOOGLE_CREDENTIALS_JSON) {
    try {
      JSON.parse(credenciales._GOOGLE_CREDENTIALS_JSON);
      fs.writeFileSync(path.join(dataDir, 'credentials.json'), credenciales._GOOGLE_CREDENTIALS_JSON, 'utf8');
    } catch {
      // credenciales inválidas — Calendar queda desactivado, el resto del bot sigue andando
    }
  }

  // SIEMPRE cloud-direct: sin options.externalSock, crearAkiraBot arma su
  // propio socket Baileys en este mismo proceso (ver akira.bot.js línea ~108).
  const bot = crearAkiraBot(credenciales, dataDir, sessionDir, userId);

  for (const evento of ['qr', 'ready', 'disconnected', 'log', 'stopped']) {
    bot.on(evento, (payload) => onEvento?.(slot, evento, payload));
  }

  instancias.set(slot, bot);
  await bot.iniciar();
  return { ok: true };
}

function detenerSlot(slot, opts) {
  const bot = instancias.get(slot);
  if (!bot) return { ok: false, error: 'Ese slot no está corriendo.' };
  bot.detener(opts);
  instancias.delete(slot);
  return { ok: true };
}

function estadoSlots() {
  return Array.from(instancias.keys());
}

function getBot(slot) {
  return instancias.get(slot) || null;
}

async function detenerTodos(opts) {
  for (const slot of Array.from(instancias.keys())) {
    detenerSlot(slot, opts);
  }
}

module.exports = { iniciarSlot, detenerSlot, estadoSlots, getBot, detenerTodos, construirCredenciales };
