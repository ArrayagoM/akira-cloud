// tests/guardian.test.js — la licencia decide si el bot funciona: cubre
// vencimiento, equipo revocado, gracia sin internet, sesión vencida y
// recuperación (con el servidor de licencias simulado).
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-guardian-'));
const licenseClient = require('../main/license/license-client');
const offlineGrace = require('../main/license/offline-grace');
const sessionStore = require('../main/license/session-store');
const guardian = require('../main/license/guardian');

const llamadas = { detener: 0, restaurar: 0, eventos: [] };
const botService = {
  detenerTodos: async () => { llamadas.detener++; },
  restaurarActivos: async () => { llamadas.restaurar++; },
};

const ESTADO_OK = { plan: 'pro', features: {}, slotsMax: 1, vigente: true, expira: null };
// el heartbeat real también deja el estado vigente en memoria (guardarEstadoLicencia)
const heartbeatOk = async () => { licenseClient.restaurarEstado(ESTADO_OK); return ESTADO_OK; };
let heartbeat = heartbeatOk;
let ultimoCuerpo = null; // lo que el guardian le manda al servidor en el latido
licenseClient.heartbeat = (extra) => { ultimoCuerpo = extra; return heartbeat(extra); };
const falla = (status, body, extra = {}) => async () => { const e = new Error('detalle-interno-123'); e.status = status; e.body = body; Object.assign(e, extra); throw e; };

(async () => {
  console.log('\n[guardian] Tests:');
  sessionStore.guardar(dir, { token: 'tok', userId: 'u1', email: 'a@b.c' });
  assert(sessionStore.leer(dir)?.token === 'tok', 'la sesión se guarda y se lee (token cifrado)');
  assert(!fs.readFileSync(path.join(dir, 'session.json'), 'utf-8').includes('"tok"'), 'el token no queda en claro en el archivo');

  await guardian.iniciar({ userDataDir: dir, botService, emitir: (u, ev, p) => llamadas.eventos.push([ev, p]) });
  guardian.detener();
  assert(llamadas.restaurar === 1 && !guardian.estado().bloqueada, 'al arrancar con licencia vigente reactiva los bots activos');

  // ── suscripción vencida ──
  heartbeat = falla(403, { vigente: false });
  await guardian._tick();
  assert(guardian.estado().bloqueada && guardian.estado().motivo === 'suscripcion_vencida', '403 vigente:false → bloqueada por suscripción vencida');
  assert(llamadas.detener === 1, 'frena los bots al vencer la suscripción');
  assert(offlineGrace.leer(dir).vigente === false, 'deja anotado en disco que no está vigente (para el próximo arranque)');
  assert(licenseClient.getEstado().vigente === false, 'startBot ya no puede arrancar (estado en memoria no vigente)');
  assert(offlineGrace.evaluar(dir).puedeOperar === false, 'sin conexión tampoco opera después de haber vencido');

  await guardian._tick();
  assert(llamadas.detener === 1, 'no frena dos veces seguidas');

  // ── renovó ──
  heartbeat = heartbeatOk;
  await guardian._tick();
  assert(!guardian.estado().bloqueada && llamadas.restaurar === 2, 'al renovar se desbloquea y reactiva los bots');

  // ── equipo revocado ──
  heartbeat = falla(403, { revocado: true });
  await guardian._tick();
  assert(guardian.estado().motivo === 'equipo_revocado', '403 revocado → bloqueada por equipo revocado');
  heartbeat = heartbeatOk; await guardian._tick();

  // ── sin internet dentro de la gracia ──
  heartbeat = falla(undefined);
  await guardian._tick();
  assert(!guardian.estado().bloqueada && guardian.estado().aviso === 'sin_conexion', 'sin internet dentro de las 72 h: sigue funcionando y avisa');

  // ── sin internet pasada la gracia ──
  const cache = offlineGrace.leer(dir);
  fs.writeFileSync(path.join(dir, 'license-cache.json'), JSON.stringify({ ...cache, guardadoEn: Date.now() - 100 * 3600 * 1000 }));
  await guardian._tick();
  assert(guardian.estado().bloqueada && guardian.estado().motivo === 'sin_conexion_prolongada', 'sin internet más de 72 h → pausa el bot');
  heartbeat = heartbeatOk; await guardian._tick();
  assert(!guardian.estado().bloqueada, 'al volver internet se reactiva solo');

  // ── sesión vencida (401) ──
  heartbeat = falla(401);
  await guardian._tick();
  assert(!guardian.estado().bloqueada && guardian.estado().aviso === 'sesion_expirada', '401 dentro de la gracia: avisa que hay que volver a ingresar, sin cortar el bot');

  // ── 403 sin motivo conocido (firewall, error de despliegue): no frena los bots a la primera ──
  const lineas = [];
  heartbeat = heartbeatOk;
  await guardian.iniciar({ userDataDir: dir, botService, emitir: () => {}, log: (...a) => lineas.push(a.join(' ')) });
  guardian.detener();
  assert(!guardian.estado().bloqueada && guardian.diagnostico().seguidos403 === 0, 'arranca limpio: sin bloqueo ni 403 seguidos');
  const detenerAntes = llamadas.detener;
  heartbeat = falla(403, { error: 'Respuesta inválida del servidor' });
  await guardian._tick(); await guardian._tick();
  assert(!guardian.estado().bloqueada && guardian.estado().aviso === 'sin_conexion' && llamadas.detener === detenerAntes, '403 sin motivo (1.º y 2.º): NO frena los bots y el aviso sigue siendo "sin_conexion" (la ventana no cambia)');
  assert(guardian.diagnostico().seguidos403 === 2, 'cuenta los 403 seguidos');
  await guardian._tick();
  assert(guardian.estado().bloqueada && guardian.estado().motivo === 'suscripcion_vencida' && llamadas.detener === detenerAntes + 1, 'al 3.er 403 seguido sin motivo sí bloquea (mismo motivo que antes) y frena los bots');
  heartbeat = heartbeatOk; await guardian._tick();
  assert(!guardian.estado().bloqueada && guardian.diagnostico().seguidos403 === 0, 'una respuesta buena desbloquea y pone el contador en cero');

  heartbeat = falla(403, {}); await guardian._tick(); await guardian._tick();
  heartbeat = heartbeatOk; await guardian._tick();
  heartbeat = falla(403); await guardian._tick(); await guardian._tick();
  assert(!guardian.estado().bloqueada, 'una respuesta buena en el medio reinicia la cuenta: 2 + bien + 2 no bloquea');
  heartbeat = heartbeatOk; await guardian._tick();

  // los 403 reales del servidor siguen bloqueando YA (sin esperar 3), aunque haya 403 dudosos antes
  heartbeat = falla(403, {}); await guardian._tick();
  heartbeat = falla(403, { revocado: true }); await guardian._tick();
  assert(guardian.estado().bloqueada && guardian.estado().motivo === 'equipo_revocado', '403 con revocado:true bloquea al instante, sin esperar 3');
  heartbeat = heartbeatOk; await guardian._tick();
  heartbeat = falla(403, { vigente: false }); await guardian._tick();
  assert(guardian.estado().bloqueada && guardian.estado().motivo === 'suscripcion_vencida', '403 con vigente:false bloquea al instante');
  heartbeat = heartbeatOk; await guardian._tick();
  heartbeat = falla(403, { motivo: 'equipo_revocado' }); await guardian._tick();
  assert(guardian.estado().motivo === 'equipo_revocado', '403 con motivo conocido (equipo_revocado) bloquea al instante');
  heartbeat = heartbeatOk; await guardian._tick();
  heartbeat = falla(403, { error: 'Cuenta bloqueada. Contactá al administrador.' }); await guardian._tick();
  assert(guardian.estado().bloqueada, '403 de cuenta bloqueada (middleware de auth) también bloquea al instante, como antes');
  heartbeat = heartbeatOk; await guardian._tick();
  assert(!guardian.estado().bloqueada, 'y se recupera al volver a validar');

  // ── motivo normalizado del fallo: queda en memoria, viaja en el SIGUIENTE latido bueno y se limpia ──
  const motivoDe = async (fn) => { heartbeat = fn; await guardian._tick(); const u = guardian.diagnostico().ultimoError; heartbeat = heartbeatOk; await guardian._tick(); return u; };
  const cInternet = await motivoDe(falla(undefined, undefined, { code: 'ENOTFOUND' }));
  assert(cInternet.motivo === 'sin_internet' && cInternet.status === null && !isNaN(Date.parse(cInternet.en)), 'ENOTFOUND -> sin_internet {motivo, status, en ISO}');
  assert((await motivoDe(falla(undefined, undefined, { code: 'ECONNREFUSED' }))).motivo === 'sin_internet', 'ECONNREFUSED -> sin_internet');
  assert((await motivoDe(async () => { throw new Error('Timeout contactando el servidor de licencias'); })).motivo === 'timeout', 'timeout del cliente -> timeout');
  const c502 = await motivoDe(falla(502, { error: 'Bad gateway' }));
  assert(c502.motivo === 'servidor' && c502.status === 502, '5xx -> servidor (con su status)');
  assert((await motivoDe(falla(401))).motivo === 'sesion', '401 -> sesion');
  assert((await motivoDe(falla(403, {}))).motivo === 'bloqueo', '403 -> bloqueo');

  heartbeat = falla(undefined, undefined, { code: 'ENOTFOUND' }); await guardian._tick();
  assert(guardian.diagnostico().ultimoError.motivo === 'sin_internet', 'queda guardado en memoria el último error');
  heartbeat = heartbeatOk; await guardian._tick();
  assert(ultimoCuerpo.ultimoError && ultimoCuerpo.ultimoError.motivo === 'sin_internet' && ultimoCuerpo.ultimoError.status === null && !isNaN(Date.parse(ultimoCuerpo.ultimoError.en)), 'el siguiente latido bueno lo manda en el cuerpo bajo "ultimoError"');
  assert(guardian.diagnostico().ultimoError === null, 'después de mandarlo lo limpia');
  await guardian._tick();
  assert(!('ultimoError' in ultimoCuerpo), 'el latido siguiente ya no lo repite');

  // ── registro: status y motivo, sin datos sensibles ──
  assert(lineas.some((l) => /status=403 motivo=bloqueo/.test(l)) && lineas.some((l) => /status=502 motivo=servidor/.test(l)) && lineas.some((l) => /motivo=sin_internet code=ENOTFOUND/.test(l)) && lineas.some((l) => /motivo=timeout/.test(l)), 'cada fallo queda en el registro con su status y su motivo normalizado');
  assert(!lineas.some((l) => /detalle-interno-123|Bearer|Bad gateway|\btok\b/.test(l)), 'el registro no incluye mensajes del servidor ni el token');

  console.log('\n✅ Todos los tests de guardian pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
