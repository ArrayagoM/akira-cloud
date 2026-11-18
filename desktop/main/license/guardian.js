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
const renovacion = require('./renovacion');
const { obtenerDeviceId } = require('../device');

const CADA_MS = 15 * 60 * 1000;

// Un 403 SIN motivo reconocible (cuerpo vacío o raro: típico de un firewall, un antivirus o un error de despliegue) no frena los bots
// hasta que se repite esta cantidad de veces seguidas. Los 403 reales del servidor (equipo revocado / suscripción vencida) bloquean YA.
const SEGUIDOS_403_PARA_BLOQUEAR = 3;

const estado = { bloqueada: false, motivo: null, aviso: null, ultimoCheckOk: null, ultimoIntento: null };
let ctx = null; // { userDataDir, botService, emitir, log }
let timer = null;
let seguidos403 = 0;    // 403 sin motivo conocido, uno atrás de otro
let ultimoError = null; // { motivo, status, en }: se manda al servidor con el próximo latido bueno y se limpia

const registrar = (...a) => { try { (ctx?.log || console.log)(...a); } catch { /* el registro nunca debe romper el latido */ } };

// Motivo normalizado de un fallo del latido (sin datos sensibles): sin_internet | timeout | servidor | sesion | bloqueo | desconocido
function motivoDeFallo(err) {
  const status = Number(err && err.status) || 0;
  if (status === 403) return 'bloqueo';
  if (status === 401) return 'sesion';
  if (status >= 400) return 'servidor'; // 5xx (y cualquier otro código raro del servidor o de un intermediario)
  const code = String((err && err.code) || '');
  const msg = String((err && err.message) || '');
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || /timeout|timed out/i.test(msg)) return 'timeout';
  if (/^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ENETDOWN|EPIPE)$/.test(code) || /ENOTFOUND|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|getaddrinfo/i.test(msg)) return 'sin_internet';
  return 'desconocido';
}

// ¿El 403 trae un motivo que da el propio servidor? → { motivo } para bloquear YA; si no, null.
// Formas reales (backend-desktop/routes/licenses.routes.js): { revocado: true } | { vigente: false } | y el middleware auth: { error: 'Cuenta bloqueada...' }.
function bloqueoConfirmado(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (b.revocado === true || b.motivo === 'equipo_revocado') return { motivo: 'equipo_revocado' };
  if (b.vigente === false || b.motivo === 'suscripcion_vencida' || /cuenta bloqueada/i.test(String(b.error || ''))) return { motivo: 'suscripcion_vencida' };
  return null;
}

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

  // La sesión se renueva sola antes de vencer (así el bot no se pausa por "sesión vencida"); la ventana recibe la nueva por el socket.
  await renovacion.renovarSiHaceFalta({
    sesion: s, renovar: () => licenseClient.renovarSesion(),
    guardar: (nueva) => sessionStore.guardar(ctx.userDataDir, nueva),
    configurar: (token) => licenseClient.configurar({ sessionToken: token }),
    avisar: (token) => ctx.emitir?.(s.userId, 'sesion:token', { token }),
    log: (...a) => console.log(...a),
  }).catch(() => {});
  const vigente = sessionStore.leer(ctx.userDataDir); // puede haberse renovado recién
  if (vigente) licenseClient.configurar({ sessionToken: vigente.token });

  try {
    const extra = await ctx.datosHeartbeat?.(s.userId).catch(() => ({})) || {};
    // Si el latido anterior falló, se cuenta el motivo en este (el servidor viejo ignora la clave `ultimoError`).
    const aEnviar = ultimoError || null;
    const e = await licenseClient.heartbeat(aEnviar ? { ...extra, ultimoError: aEnviar } : extra);
    if (ultimoError === aEnviar) ultimoError = null;
    seguidos403 = 0;
    offlineGrace.guardar(ctx.userDataDir, e);
    estado.ultimoCheckOk = estado.ultimoIntento;
    estado.aviso = null;
    if (estado.bloqueada) {
      Object.assign(estado, { bloqueada: false, motivo: null });
      await ctx.botService.restaurarActivos(s.userId);
    }
    publicar();
  } catch (err) {
    const motivoFallo = motivoDeFallo(err);
    ultimoError = { motivo: motivoFallo, status: Number(err && err.status) || null, en: new Date().toISOString() };
    if (err && err.status !== 403 && err.status) seguidos403 = 0; // otra respuesta del servidor: ya no son 403 "seguidos"
    if (err && err.status === 403) {
      const conf = bloqueoConfirmado(err.body);
      if (conf) {
        seguidos403 = 0;
        registrar(`[licencia] latido fallo: status=403 motivo=bloqueo (confirmado: ${conf.motivo}) -> se bloquea`);
        return bloquear(conf.motivo);
      }
      seguidos403++;
      if (seguidos403 >= SEGUIDOS_403_PARA_BLOQUEAR) {
        registrar(`[licencia] latido fallo: status=403 motivo=bloqueo (sin motivo del servidor, ${seguidos403} seguidos) -> se bloquea`);
        return bloquear('suscripcion_vencida');
      }
      registrar(`[licencia] latido fallo: status=403 motivo=bloqueo (sin motivo del servidor, ${seguidos403}/${SEGUIDOS_403_PARA_BLOQUEAR}) -> todavia no se bloquea`);
    } else {
      registrar(`[licencia] latido fallo: status=${(err && err.status) || '-'} motivo=${motivoFallo}${err && err.code ? ' code=' + err.code : ''}`);
    }

    // 401 (sesión vencida), sin internet o servidor caído → gracia
    const g = offlineGrace.evaluar(ctx.userDataDir);
    if (!g.puedeOperar) return bloquear(g.motivo === 'gracia_offline_agotada' ? 'sin_conexion_prolongada' : g.motivo);
    estado.aviso = err.status === 401 ? 'sesion_expirada' : 'sin_conexion';
    publicar();
  }
}

// Al abrir la app: valida primero y, si corresponde, reactiva los bots activos
// sin que nadie abra la ventana.
async function iniciar({ userDataDir, botService, emitir, datosHeartbeat, log }) {
  ctx = { userDataDir, botService, emitir, datosHeartbeat, log };
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

// Señal de vida inmediata (por ejemplo, el bot se cayó o volvió): se agrupan los pedidos cercanos.
let pedido = null;
function pedirLatido(demoraMs = 2000) {
  if (!ctx || pedido) return;
  pedido = setTimeout(() => { pedido = null; tick().catch(() => {}); }, demoraMs);
}

function detener() { if (timer) clearInterval(timer); if (pedido) { clearTimeout(pedido); pedido = null; } }

// Diagnóstico (solo lectura): fallos 403 seguidos sin motivo y último error pendiente de informar al servidor.
const diagnostico = () => ({ seguidos403, ultimoError: ultimoError ? { ...ultimoError } : null });

module.exports = { iniciar, detener, pedirLatido, diagnostico, _tick: tick, estado: () => ({ ...estado, plan: licenseClient.getEstado()?.plan || null, expira: licenseClient.getEstado()?.expira || null }) };
