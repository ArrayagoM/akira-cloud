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
licenseClient.heartbeat = () => heartbeat();
const falla = (status, body) => async () => { const e = new Error('x'); e.status = status; e.body = body; throw e; };

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

  console.log('\n✅ Todos los tests de guardian pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
