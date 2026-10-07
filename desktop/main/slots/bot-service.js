// slots/bot-service.js
// Equivalente local de backend/services/bot.manager.js: ciclo de vida de los
// bots (uno por cuenta de WhatsApp / slot), estado, auto-reinicio con
// backoff, QR pendiente y eventos hacia la interfaz (socket.io local). El
// bot se crea SIEMPRE en modo "cloud-direct" (sin options.externalSock):
// Baileys corre en este mismo proceso y la sesión vive en la carpeta del
// usuario, no en ningún servidor.
//
// También recuerda qué slots estaban activos (userData/bots-activos.json)
// para volver a arrancarlos al abrir la app — el "mantiene su bot" de una
// instalación de escritorio.
'use strict';

const path = require('path');
const fs = require('fs');

const crearAkiraBot = require('../bot-engine/services/akira.bot');
const Config = require('../bot-engine/models/Config');
const Log = require('../bot-engine/models/Log');
const licenseClient = require('../license/license-client');
const { construirCredenciales } = require('./bot-manager-local');

const instancias = new Map(); // slot → bot
const conectados = new Set(); // slots con WhatsApp conectado
const qrPendientes = new Map(); // slot → { qr, ts }
const autoRestartTimers = new Map();
const arranqueEnProceso = new Set();
// Para informar a la nube el estado real del bot (ver main/estado-bot.js y main/vigilante-bot.js)
const desconectadoDesde = new Map(); // slot → ms desde que dejó de estar conectado
const sesionExpirada = new Set();    // slots a los que WhatsApp les pide un QR nuevo
const huboConexion = new Set();      // slots que ya se conectaron alguna vez en esta ejecución

let baseDir = null;
let emitir = () => {};
let cambioDeEstado = () => {};

function init({ userDataDir, emitirAlUsuario, alCambiarEstado }) {
  baseDir = userDataDir;
  emitir = emitirAlUsuario || (() => {});
  cambioDeEstado = (ev) => { try { alCambiarEstado?.(ev); } catch { /* un aviso fallido nunca debe afectar al bot */ } };
}

function estadoDetallado({ pausado = false } = {}) {
  return require('../estado-bot').construirEstado({
    deseados: new Set(leerActivos()), activos: new Set(instancias.keys()), conectados, sesionExpirada, huboConexion,
    desde: desconectadoDesde, pausado,
    tieneSesion: (slot) => { try { return fs.existsSync(path.join(baseDir, 'sessions', sessionDirName(slot), 'creds.json')); } catch { return false; } },
  });
}

const ts = () => new Date().toLocaleTimeString('es-AR');
const archivoActivos = () => path.join(baseDir, 'bots-activos.json');

function leerActivos() {
  try { return JSON.parse(fs.readFileSync(archivoActivos(), 'utf-8')); } catch { return []; }
}
function marcarActivo(slot, activo) {
  const set = new Set(leerActivos());
  if (activo) set.add(slot); else set.delete(slot);
  try { fs.writeFileSync(archivoActivos(), JSON.stringify([...set])); } catch {}
}

// Contador de mensajes del día (entrantes + salientes), guardado en disco para
// que no se pierda al cerrar la app. Solo se conserva el día actual.
const archivoStats = () => path.join(baseDir, 'estadisticas.json');
const claveHoy = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function mensajesHoy() {
  try { const j = JSON.parse(fs.readFileSync(archivoStats(), 'utf-8')); return j.dia === claveHoy() ? (j.mensajes || 0) : 0; } catch { return 0; }
}
function sumarMensaje() {
  try { fs.writeFileSync(archivoStats(), JSON.stringify({ dia: claveHoy(), mensajes: mensajesHoy() + 1 })); } catch {}
}

// Registro del bot en archivo (userData/logs/bot.log, se rota a los 2 MB): sirve
// para diagnosticar lo que pasó aunque la ventana estuviera cerrada. Las claves
// de API nunca se escriben completas.
function escribirLogBot(slot, msg) {
  try {
    const dir = path.join(baseDir, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'bot.log');
    try { if (fs.statSync(f).size > 2 * 1024 * 1024) fs.renameSync(f, path.join(dir, 'bot.old.log')); } catch { /* aún no existe */ }
    const limpio = String(msg).replace(/(gsk_|re_|APP_USR-|TEST-)[A-Za-z0-9_-]{3,}/g, '$1…');
    fs.appendFileSync(f, `${new Date().toISOString()} [slot ${slot}] ${limpio}
`);
  } catch { /* el registro nunca rompe al bot */ }
}

function sessionDirName(slot) { return slot === 0 ? 'principal' : `slot-${slot}`; }

async function startBot(userId, slot = 0) {
  const uid = String(userId);
  if (instancias.has(slot) || arranqueEnProceso.has(slot)) return { ok: false, msg: 'El bot ya está activo' };
  arranqueEnProceso.add(slot);
  if (autoRestartTimers.has(slot)) { clearTimeout(autoRestartTimers.get(slot)); autoRestartTimers.delete(slot); }

  try {
    const estadoLicencia = licenseClient.getEstado();
    if (!estadoLicencia?.vigente) throw new Error('Licencia no vigente. Renová tu suscripción.');
    if (slot >= (estadoLicencia.slotsMax ?? 1)) throw new Error(`Tu plan permite hasta ${estadoLicencia.slotsMax ?? 1} cuenta(s) de WhatsApp.`);

    const credenciales = await construirCredenciales(uid, slot);
    if (!desconectadoDesde.has(slot)) desconectadoDesde.set(slot, Date.now());

    const sessionDir = path.join(baseDir, 'sessions', sessionDirName(slot));
    const dataDir = path.join(sessionDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    if (credenciales._GOOGLE_CREDENTIALS_JSON) {
      try {
        JSON.parse(credenciales._GOOGLE_CREDENTIALS_JSON);
        fs.writeFileSync(path.join(dataDir, 'credentials.json'), credenciales._GOOGLE_CREDENTIALS_JSON, 'utf8');
      } catch { /* credenciales inválidas: Calendar queda desactivado */ }
    }

    const bot = crearAkiraBot(credenciales, dataDir, sessionDir, uid);
    instancias.set(slot, bot);

    bot.on('log', (msg) => { emitir(uid, 'bot:log', { msg, ts: ts(), slot }); escribirLogBot(slot, msg); });
    bot.on('stat', () => { sumarMensaje(); emitir(uid, 'stats:update', {}); });
    bot.on('documento', (d) => emitir(uid, d.actualizado ? 'documento:actualizado' : 'documento:nuevo', d));

    bot.on('qr', async (qr) => {
      const qrTs = Date.now();
      qrPendientes.set(slot, { qr, ts: qrTs });
      setTimeout(() => { if (qrPendientes.get(slot)?.ts === qrTs) qrPendientes.delete(slot); }, 60_000);
      emitir(uid, 'bot:qr', { qr, slot });
      await Log.registrar({ userId: uid, tipo: 'bot_qr', mensaje: `Slot ${slot}: QR generado — esperando escaneo` });
    });

    bot.on('ready', async () => {
      qrPendientes.delete(slot);
      conectados.add(slot);
      huboConexion.add(slot); desconectadoDesde.delete(slot); sesionExpirada.delete(slot);
      emitir(uid, 'bot:ready', { slot });
      cambioDeEstado({ slot, estado: 'conectado' });
      await Log.registrar({ userId: uid, tipo: 'bot_connected', mensaje: `Slot ${slot}: WhatsApp conectado y listo` });
    });

    bot.on('disconnected', async (reason) => {
      conectados.delete(slot);
      instancias.delete(slot);
      emitir(uid, 'bot:disconnected', { reason, slot });
      await Log.registrar({ userId: uid, tipo: 'bot_disconnected', nivel: 'warn', mensaje: `Slot ${slot}: Desconectado: ${reason}` });

      // Estas razones exigen escanear un QR nuevo: reiniciar solo crearía un
      // bucle infinito inicia → espera QR → timeout → reinicia.
      const r = String(reason || '').toLowerCase();
      const requiereQR = ['qr requerido', 'sesión inválida', 'sesión corrupta', 'código: 401', 'código: 440', 'código: 500', 'demasiados intentos'].some((x) => r.includes(x));
      if (!desconectadoDesde.has(slot)) desconectadoDesde.set(slot, Date.now());
      if (requiereQR) sesionExpirada.add(slot);
      cambioDeEstado({ slot, estado: 'desconectado', requiereQR });
      if (requiereQR) {
        emitir(uid, 'bot:log', { msg: '⚠️ Sesión expirada — iniciá el bot de nuevo desde el panel para escanear un QR nuevo.', ts: ts(), slot });
        await Log.registrar({ userId: uid, tipo: 'bot_session_expired', nivel: 'warn', mensaje: `Slot ${slot}: Sesión expirada — requiere QR nuevo.` });
        return;
      }
      programarAutoRestart(uid, slot);
    });

    bot.on('error', async (err) => {
      emitir(uid, 'bot:error', { msg: err.message, slot });
      await Log.registrar({ userId: uid, tipo: 'error', nivel: 'error', mensaje: err.message });
    });

    // ── Catálogo ──
    bot.on('catalog:update', async (catalogo) => {
      try {
        const cfg = await Config.findOne({ userId: uid });
        const manuales = (cfg?.catalogo || []).filter((p) => p.fuente !== 'wa_catalog');
        const merged = [...manuales, ...catalogo];
        await Config.findOneAndUpdate({ userId: uid }, { catalogo: merged, catalogoSincronizadoEn: new Date() }, { upsert: true });
        emitir(uid, 'catalog:synced', { count: catalogo.length, total: merged.length });
      } catch (e) { console.warn('[BotSvc] catálogo:', e.message); }
    });
    bot.on('catalog:not_business', () => emitir(uid, 'catalog:not_business', {}));
    bot.on('catalog:candidate', async (producto) => {
      try {
        await Config.findOneAndUpdate({ userId: uid }, { $push: { catalogo: { ...producto, disponible: true, fuente: 'status' } } });
        emitir(uid, 'catalog:new-product', producto);
      } catch (e) { console.warn('[BotSvc] candidato catálogo:', e.message); }
    });

    await bot.iniciar();
    marcarActivo(slot, true);
    await Log.registrar({ userId: uid, tipo: 'bot_start', mensaje: `Slot ${slot}: Bot iniciado` });
    return { ok: true, msg: 'Bot iniciando — esperá el QR' };
  } catch (err) {
    instancias.delete(slot);
    await Log.registrar({ userId: uid, tipo: 'error', nivel: 'error', mensaje: `Error al iniciar slot ${slot}: ${err.message}` }).catch(() => {});
    return { ok: false, msg: err.message };
  } finally {
    arranqueEnProceso.delete(slot);
  }
}

// Backoff 15s, 30s, 1m, 2m, 5m y luego cada 10 min — nunca desiste.
function programarAutoRestart(uid, slot) {
  const DELAYS = [15_000, 30_000, 60_000, 120_000, 300_000];
  let intento = 0;
  const intentar = async () => {
    if (instancias.has(slot) || arranqueEnProceso.has(slot)) { autoRestartTimers.delete(slot); return; }
    if (!licenseClient.getEstado()?.vigente) { autoRestartTimers.delete(slot); return; }
    intento++;
    emitir(uid, 'bot:log', { msg: `🔄 Auto-restart (intento ${intento})...`, ts: ts(), slot });
    const r = await startBot(uid, slot);
    if (r.ok) { autoRestartTimers.delete(slot); return; }
    const espera = intento <= DELAYS.length ? DELAYS[intento - 1] : 10 * 60_000;
    emitir(uid, 'bot:log', { msg: `⚠️ Auto-restart falló: ${r.msg} — reintentando en ${Math.round(espera / 60000) || '<1'} min`, ts: ts(), slot });
    autoRestartTimers.set(slot, setTimeout(intentar, espera));
  };
  autoRestartTimers.set(slot, setTimeout(intentar, DELAYS[0]));
}

async function stopBot(userId, slot = 0) {
  const uid = String(userId);
  if (autoRestartTimers.has(slot)) { clearTimeout(autoRestartTimers.get(slot)); autoRestartTimers.delete(slot); }
  marcarActivo(slot, false);
  desconectadoDesde.delete(slot); sesionExpirada.delete(slot);
  cambioDeEstado({ slot, estado: 'detenido' });
  const bot = instancias.get(slot);
  if (!bot) return { ok: false, msg: 'El bot no está activo' };
  try {
    await bot.detener();
    instancias.delete(slot);
    conectados.delete(slot);
    emitir(uid, 'bot:stopped', { slot });
    await Log.registrar({ userId: uid, tipo: 'bot_stop', mensaje: `Slot ${slot}: Bot detenido` });
    return { ok: true, msg: 'Bot detenido' };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

// Borra la sesión de WhatsApp de ese slot → obliga a escanear un QR nuevo.
async function resetSession(userId, slot = 0) {
  await stopBot(userId, slot).catch(() => {});
  const dir = path.join(baseDir, 'sessions', sessionDirName(slot));
  let borrados = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f === 'data') continue;
      fs.rmSync(path.join(dir, f), { recursive: true, force: true });
      borrados++;
    }
  } catch { /* la carpeta puede no existir todavía */ }
  await Log.registrar({ userId, tipo: 'bot_stop', nivel: 'warn', mensaje: `Slot ${slot}: sesión WhatsApp eliminada` });
  return borrados;
}

function getBotStatus(slot = 0) {
  return { activo: instancias.has(slot), conectado: conectados.has(slot) };
}
function getQRPendiente(slot = 0) { return qrPendientes.get(slot)?.qr || null; }

const sobreBot = (slot, evento, payload) => { const b = instancias.get(slot); if (b) { b.emit(evento, payload); return true; } return false; };
const recargarConfig = (slot = 0) => sobreBot(slot, 'config:reload');
const recargarCalendar = (slot = 0) => sobreBot(slot, 'calendar:reload');
const triggerCatalogSync = (slot = 0) => sobreBot(slot, 'catalog:sync');
const enviarTexto = (slot, jid, texto) => sobreBot(slot, 'enviar:texto', { jid, texto });
const silenciarCliente = (jid, silenciado) => sobreBot(0, 'cliente:silenciar', { jid, silenciado });

async function procesarWebhookMP(payload) {
  for (const bot of instancias.values()) {
    try { await bot.procesarWebhookMP(payload); } catch (e) { console.warn('[BotSvc] webhook MP:', e.message); }
  }
}

// Al abrir la app: volver a arrancar los slots que estaban activos.
async function restaurarActivos(userId) {
  for (const slot of leerActivos()) {
    const r = await startBot(userId, slot);
    if (!r.ok) emitir(String(userId), 'bot:log', { msg: `No se pudo restaurar el slot ${slot}: ${r.msg}`, ts: ts(), slot });
  }
}

async function detenerTodos() {
  for (const t of autoRestartTimers.values()) clearTimeout(t);
  autoRestartTimers.clear();
  for (const [slot, bot] of Array.from(instancias.entries())) {
    try { await bot.detener(); } catch {}
    instancias.delete(slot);
  }
  conectados.clear();
  desconectadoDesde.clear(); sesionExpirada.clear();
}

module.exports = {
  init, mensajesHoy, estadoDetallado, startBot, stopBot, resetSession, getBotStatus, getQRPendiente,
  recargarConfig, recargarCalendar, triggerCatalogSync, silenciarCliente, enviarTexto,
  procesarWebhookMP, restaurarActivos, detenerTodos, slotsActivos: () => Array.from(instancias.keys()),
};
