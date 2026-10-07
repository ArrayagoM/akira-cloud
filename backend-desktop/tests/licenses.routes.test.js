// tests/licenses.routes.test.js
// Prueba el flujo de activación de equipos con modelos simulados en memoria
// (no toca ninguna base real): límite por plan, aviso de "ya hay otro equipo",
// reemplazo confirmado por el usuario, admins sin tope y heartbeat de un
// equipo desactivado.
'use strict';

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);

const Module = require('module');
const path = require('path');

// ── Modelos simulados ─────────────────────────────────────────────
const dispositivos = [];
class FakeDevice {
  constructor(d) { Object.assign(this, { activo: true, revocado: false, ultimoHeartbeat: new Date(), ...d }); }
  async save() { return this; }
  static async create(d) { const x = new FakeDevice(d); dispositivos.push(x); return x; }
  static findOne(q) { return Promise.resolve(dispositivos.find((d) => String(d.userId) === String(q.userId) && d.deviceId === q.deviceId) || null); }
  static find(q) {
    const r = dispositivos.filter((d) => String(d.userId) === String(q.userId) && d.activo === q.activo && d.revocado === q.revocado);
    r.sort = () => r.slice().sort((a, b) => a.ultimoHeartbeat - b.ultimoHeartbeat);
    return r;
  }
}
const logs = [];
const FakeLog = { registrar: async (x) => logs.push(x) };

const cache = Module._cache;
const inyectar = (rel, exportado) => {
  const f = path.join(__dirname, '..', rel);
  cache[f] = { id: f, filename: f, loaded: true, exports: exportado, children: [], paths: [] };
};
inyectar('models/Device.js', FakeDevice);
inyectar('models/Log.js', FakeLog);
inyectar('middleware/auth.js', { requireAuth: (req, _res, next) => next(), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
inyectar('config/logger.js', { info() {}, warn() {}, error() {} });

const router = require('../routes/licenses.routes');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

// Ejecuta el handler de una ruta como lo haría Express
async function llamar(metodo, ruta, user, body) {
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  const handlers = capa.route.stack.map((s) => s.handle);
  let status = 200; let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  const req = { user, body, ip: '1.1.1.1' };
  for (const h of handlers) await h(req, res, () => {});
  return { status, json };
}

const FUTURO = new Date(Date.now() + 30 * 86400000);
const usuario = (extra = {}) => ({ _id: 'u1', rol: 'user', plan: 'pro', planExpira: FUTURO, ...extra });

(async () => {
  console.log('\n[licenses.routes] Tests:');

  let r = await llamar('post', '/activate', usuario(), { deviceId: 'pc-A', nombre: 'PC Local' });
  assert(r.status === 200 && r.json.vigente, 'el primer equipo se activa');

  r = await llamar('post', '/activate', usuario(), { deviceId: 'pc-B', nombre: 'Notebook' });
  assert(r.status === 409 && r.json.codigo === 'LIMITE_DISPOSITIVOS', 'un segundo equipo en plan de 1 equipo → 409 con código para que la app ofrezca el cambio');
  assert(r.json.dispositivos?.[0]?.nombre === 'PC Local', 'el aviso dice cuál es el otro equipo activo');
  assert(!dispositivos.find((d) => d.deviceId === 'pc-B'), 'sin confirmación no se registra el equipo nuevo');

  r = await llamar('post', '/activate', usuario(), { deviceId: 'pc-B', nombre: 'Notebook', reemplazar: true });
  assert(r.status === 200, 'confirmando el cambio, el equipo nuevo se activa');
  assert(dispositivos.find((d) => d.deviceId === 'pc-A').activo === false, 'el equipo anterior queda desactivado');
  assert(dispositivos.find((d) => d.deviceId === 'pc-B').activo === true, 'el equipo nuevo queda activo');

  r = await llamar('post', '/heartbeat', usuario(), { deviceId: 'pc-A' });
  assert(r.status === 403 && r.json.revocado, 'el equipo desactivado deja de pasar el control de licencia (el bot se frena ahí)');
  r = await llamar('post', '/heartbeat', usuario(), { deviceId: 'pc-B' });
  assert(r.status === 200 && r.json.vigente, 'el equipo activo sigue pasando el control');

  r = await llamar('post', '/activate', usuario(), { deviceId: 'pc-A', nombre: 'PC Local', reemplazar: true });
  assert(r.status === 200 && dispositivos.find((d) => d.deviceId === 'pc-B').activo === false, 'se puede volver al equipo anterior (reactivación) y el otro se desactiva');

  // ── admin con plan trial: sin tope de equipos y con todas las funciones ──
  dispositivos.length = 0;
  const admin = { _id: 'adm', rol: 'admin', plan: 'trial', trialExpira: new Date(Date.now() - 86400000) };
  r = await llamar('post', '/activate', admin, { deviceId: 'a1' });
  assert(r.status === 200 && r.json.plan === 'admin' && r.json.slotsMax === 5, 'un admin con plan trial vencido igual activa, con plan admin y 5 cuentas');
  r = await llamar('post', '/activate', admin, { deviceId: 'a2' });
  r = await llamar('post', '/activate', admin, { deviceId: 'a3' });
  assert(r.status === 200 && dispositivos.filter((d) => d.activo).length === 3, 'un admin puede tener varios equipos a la vez');

  // ── suscripción vencida ──
  r = await llamar('post', '/activate', usuario({ _id: 'u9', planExpira: new Date(Date.now() - 1000) }), { deviceId: 'z1' });
  assert(r.status === 403 && r.json.vigente === false, 'plan vencido → 403, no se activa');

  // ── estado del bot en el heartbeat (alertas por email si se cae) ──
  dispositivos.length = 0;
  await llamar('post', '/activate', usuario({ email: 'a@b.com', nombre: 'Ana' }), { deviceId: 'pc-E', nombre: 'PC Ana' });
  const caido = { slots: [{ slot: 0, deseado: true, activo: true, conectado: false, requiereQR: true, desdeMs: 5000 }] };
  r = await llamar('post', '/heartbeat', usuario({ email: 'a@b.com', nombre: 'Ana' }), { deviceId: 'pc-E', estadoBot: caido });
  const dE = dispositivos.find((d) => d.deviceId === 'pc-E');
  assert(r.status === 200 && r.json.vigente, 'un heartbeat con el bot caído igual renueva la licencia (aunque el email no se pueda mandar)');
  assert(dE.estadoBot?.slots?.[0]?.requiereQR === true && dE.alertaBot?.abierta === true, 'guarda el estado del bot y abre el incidente');
  r = await llamar('post', '/heartbeat', usuario({ email: 'a@b.com' }), { deviceId: 'pc-E', estadoBot: 'basura' });
  assert(r.status === 200, 'un estado del bot inválido no rompe el heartbeat');
  r = await llamar('post', '/heartbeat', usuario({ email: 'a@b.com' }), { deviceId: 'pc-E', estadoBot: { slots: [{ slot: 0, deseado: true, activo: true, conectado: true }] } });
  assert(r.status === 200 && dE.alertaBot.abierta === false, 'cuando el bot vuelve, se cierra el incidente');
  r = await llamar('post', '/heartbeat', usuario({ email: 'a@b.com' }), { deviceId: 'pc-E' });
  assert(r.status === 200 && dE.estadoBot.slots[0].conectado === true, 'un heartbeat sin estado (app vieja) no borra el último estado conocido');

  console.log('\n✅ Todos los tests de licenses.routes pasaron.\n');
})().catch((e) => { console.error('❌', e.message, e.stack); process.exit(1); });
