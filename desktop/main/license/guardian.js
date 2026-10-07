// license/guardian.js
// Vigila la licencia MIENTRAS el bot corre (aunque la ventana esté oculta):
//  - cada 15 min revalida con el servidor (heartbeat);
//  - suscripción vencida o equipo revocado → frena los bots de inmediato;
//  - sin conexión: el bot sigue dentro de la ventana de gracia (72 h desde la
//    última validación exitosa); pasada la gracia, se pausa;
//  - al volver a validar bien, reanuda los bots que estaban activos.
// Pausar nunca borra datos ni la sesión de WhatsApp.
'use strict';

const licenseClient = require('./license-client');
const offlineGrace = require('./offline-grace');
const sessionStore = require('./session-store');
const { obtenerDeviceId } = require('../device');

const CADA_MS = 15 * 60 * 1000;

const estado = { bloqueada: false, motivo: null, aviso: null, ultimoCheckOk: null, ultimoIntento: null };
let ctx = null; // { userDataDir, botService, emitir }
let timer = null;

const publicar = () => {
  const s = sessionStore.leer(ctx.userDataDir);
  if (s) ctx.emitir?.(s.userId, 'licencia:estado', { ...estado });
};

async function bloquear(motivo) {
  const yaBloqueada = estado.bloqueada;
  Object.assign(estado, { bloqueada: true, motivo, aviso: null });
  const cache = offlineGrace.leer(ctx.userDataDir);
  if (motivo === 'suscripcion_vencida' || motivo === 'equipo_revocado') {
    offlineGrace.guardar(ctx.userDataDir, { ...(cache || {}), vigente: false });
    const e = licenseClient.getEstado();
    if (e) e.vigente = false;
  }
  if (!yaBloqueada) {
    // detenerTodos NO borra "bots-activos.json": se reactivan al recuperar la licencia
    await ctx.botService.detenerTodos();
  }
  publicar();
}

async function tick() {
  const s = sessionStore.leer(ctx.userDataDir);
  if (!s) return; // nadie inició sesión todavía
  licenseClient.configurar({ sessionToken: s.token, deviceId: obtenerDeviceId(ctx.userDataDir) });
  estado.ultimoIntento = new Date().toISOString();

  try {
    const extra = await ctx.datosHeartbeat?.(s.userId).catch(() => ({})) || {};
    const e = await licenseClient.heartbeat(extra);
    offlineGrace.guardar(ctx.userDataDir, e);
    estado.ultimoCheckOk = estado.ultimoIntento;
    estado.aviso = null;
    if (estado.bloqueada) {
      Object.assign(estado, { bloqueada: false, motivo: null });
      await ctx.botService.restaurarActivos(s.userId);
    }
    publicar();
  } catch (err) {
    if (err.status === 403) return bloquear(err.body?.revocado ? 'equipo_revocado' : 'suscripcion_vencida');

    // 401 (sesión vencida), sin internet o servidor caído → gracia
    const g = offlineGrace.evaluar(ctx.userDataDir);
    if (!g.puedeOperar) return bloquear(g.motivo === 'gracia_offline_agotada' ? 'sin_conexion_prolongada' : g.motivo);
    estado.aviso = err.status === 401 ? 'sesion_expirada' : 'sin_conexion';
    publicar();
  }
}

// Al abrir la app: valida primero y, si corresponde, reactiva los bots activos
// sin que nadie abra la ventana.
async function iniciar({ userDataDir, botService, emitir, datosHeartbeat }) {
  ctx = { userDataDir, botService, emitir, datosHeartbeat };
  const s = sessionStore.leer(userDataDir);
  if (!s) return;

  licenseClient.configurar({ sessionToken: s.token, deviceId: obtenerDeviceId(userDataDir) });
  const cache = offlineGrace.leer(userDataDir);
  if (cache) licenseClient.restaurarEstado(cache);

  await tick();
  if (!estado.bloqueada && licenseClient.getEstado()?.vigente) {
    await botService.restaurarActivos(s.userId);
  }
  timer = setInterval(() => tick().catch(() => {}), CADA_MS);
}

function detener() { if (timer) clearInterval(timer); }

module.exports = { iniciar, detener, _tick: tick, estado: () => ({ ...estado, plan: licenseClient.getEstado()?.plan || null, expira: licenseClient.getEstado()?.expira || null }) };
