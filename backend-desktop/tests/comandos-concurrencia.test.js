// tests/comandos-concurrencia.test.js — órdenes del celular: el celular y la PC escriben a la vez y no se pisan.
// Almacén simulado que entrega COPIAS (como la base real) y una barrera que hace que dos operaciones lean
// al mismo tiempo antes de que cualquiera guarde. No toca ninguna base real.
'use strict';

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);
process.env.FRONTEND_URL = 'https://akiracloud.lat';

const Module = require('module');
const path = require('path');

let almacen = null;          // el equipo "guardado en la base"
let lecturas = 0;            // cuántas lecturas se hicieron
let barrera = null;          // { n, llegaron, liberar } → las primeras n lecturas esperan a las demás
let interferir = 0;          // cuántas veces un rival cambia la lista justo antes de cada guardado
let version = 0;

const copia = (d) => JSON.parse(JSON.stringify(d));
class FakeDevice {
  static async findOne(q) {
    if (!almacen || almacen.userId !== q.userId || almacen.deviceId !== q.deviceId) return null;
    if (q.activo !== undefined && almacen.activo !== q.activo) return null;
    if (q.revocado !== undefined && almacen.revocado !== q.revocado) return null;
    const mia = copia(almacen); lecturas++;
    if (barrera) { barrera.llegaron++; if (barrera.llegaron >= barrera.n) { barrera.liberar(); } await barrera.espera; }
    return mia;
  }
  static async updateOne(f, u) {
    if (interferir > 0) { interferir--; almacen.comandos = [...almacen.comandos, { id: 'rival' + (++version), tipo: 'vacaciones-off', estado: 'hecho', creadoEn: 'x', venceEn: 'x' }]; almacen.comandosV = (almacen.comandosV || 0) + 1; }
    const v = Number(almacen.comandosV) || 0;
    const ok = almacen._id === f._id && (f.comandosV === undefined || (typeof f.comandosV === 'number' ? f.comandosV === v : v === 0));
    if (ok) Object.assign(almacen, copia(u.$set));
    return { matchedCount: ok ? 1 : 0, modifiedCount: ok ? 1 : 0 };
  }
}
const cache = Module._cache;
const inyectar = (rel, exportado) => { const f = path.join(__dirname, '..', rel); cache[f] = { id: f, filename: f, loaded: true, exports: exportado, children: [], paths: [] }; };
let usuarioActual = null;
inyectar('models/Device.js', FakeDevice);
inyectar('models/MobileDevice.js', {});
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('middleware/auth.js', { requireAuth: (req, _res, next) => { req.user = usuarioActual; next(); }, requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
inyectar('config/logger.js', { info() {}, warn() {}, error() {} });
inyectar('lib/limite.js', { consumir: async () => ({ ok: true }), consumirTodos: async () => ({ ok: true }), mensajeEspera: (s) => String(s) });

const mobile = require('../routes/mobile.routes');
const licenses = require('../routes/licenses.routes');
const { mutarComandos, REINTENTOS } = require('../lib/comandos-guardar');
const cm = require('../lib/comandos');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
async function llamar(router, metodo, ruta, user, body) {
  usuarioActual = user;
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  let status = 200; let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  for (const h of capa.route.stack.map((s) => s.handle)) await h({ user, body, params: {}, query: {}, ip: '1.1.1.1' }, res, () => {});
  return { status, json };
}
const nuevaBarrera = (n) => { let liberar; const espera = new Promise((r) => { liberar = r; }); return { n, llegaron: 0, liberar, espera }; };
const U = { _id: 'u1', email: 'a@b.com', rol: 'user' };
const reiniciar = (extra = {}) => { almacen = { _id: 'd1', userId: 'u1', deviceId: 'pc1', activo: true, revocado: false, celularActivo: true, comandos: [], ultimoHeartbeat: 'viejo', ...extra }; lecturas = 0; barrera = null; interferir = 0; };
const tipos = () => almacen.comandos.filter((c) => c.estado === 'pendiente').map((c) => c.tipo).sort().join();

(async () => {
  console.log('\n[comandos-concurrencia] Tests:');

  // ── Contraste: así se perdía la orden antes (guardar el equipo entero) ──
  reiniciar();
  const lecturaVieja = async () => copia(almacen);
  const celular = await lecturaVieja(); const pc = await lecturaVieja();       // los dos leen a la vez
  cm.encolar(celular, 'bot-pausar');                                           // el celular manda "pausar"…
  cm.pendientes(pc); pc.ultimoHeartbeat = 'nuevo';                             // …la PC consulta (nada pendiente que ella vea)
  Object.assign(almacen, { comandos: celular.comandos });                      // el celular guarda
  Object.assign(almacen, { comandos: pc.comandos, ultimoHeartbeat: pc.ultimoHeartbeat }); // la PC guarda el equipo entero
  assert(tipos() === '', 'CONTRASTE (comportamiento anterior): la orden "pausar" del celular se perdía si la PC guardaba justo después');

  // ── Con el guardado por versión ──
  // 1) el celular manda "pausar" en el mismo instante en que la PC hace su consulta de rutina
  reiniciar();
  barrera = nuevaBarrera(2);
  const [a, b] = await Promise.all([
    llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' }),
    llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1' }),
  ]);
  assert(a.status === 200 && b.status === 200, 'las dos operaciones simultáneas terminan bien');
  assert(tipos() === 'bot-pausar', 'la orden del celular NO se pierde cuando la PC consulta al mismo tiempo');
  assert(almacen.ultimoHeartbeat !== 'viejo', 'la consulta de la PC igual deja su latido registrado');
  barrera = null;
  const retiro = await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1' });
  assert(retiro.json.comandos.length === 1 && retiro.json.comandos[0].tipo === 'bot-pausar', 'en la siguiente consulta la PC retira la orden');

  // 2) dos órdenes distintas del celular a la vez (ej. dos toques rápidos): las dos quedan
  reiniciar();
  barrera = nuevaBarrera(2);
  await Promise.all([
    llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' }),
    llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'vacaciones-on' }),
  ]);
  assert(tipos() === 'bot-pausar,vacaciones-on', 'dos órdenes simultáneas quedan las dos (la que perdió la carrera reintenta)');
  assert(almacen.comandosV === 2, 'la versión de la lista avanza una vez por cada cambio real');

  // 3) la PC confirma una orden mientras el celular manda otra
  reiniciar();
  await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  const idPausar = almacen.comandos[0].id;
  barrera = nuevaBarrera(2);
  await Promise.all([
    llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1', hechos: [{ id: idPausar, ok: true }] }),
    llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'vacaciones-on' }),
  ]);
  barrera = null;
  assert(almacen.comandos.find((c) => c.id === idPausar).estado === 'hecho' && tipos() === 'vacaciones-on', 'la confirmación de la PC y la orden nueva del celular quedan las dos');

  // 4) comportamiento de siempre, sin competencia
  reiniciar();
  let x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  assert(x.status === 200 && x.json.comando.estado === 'pendiente', 'sin competencia: la orden se acepta como antes');
  reiniciar({ celularActivo: false });
  x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  assert(x.status === 409 && x.json.codigo === 'CELULAR_DESACTIVADO' && almacen.comandos.length === 0, 'control remoto apagado: 409 y no se guarda nada');
  x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc-ajena', tipo: 'bot-pausar' });
  assert(x.status === 404, 'PC que no existe o es de otro usuario: 404');
  reiniciar({ revocado: true });
  x = await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1' });
  assert(x.status === 403 && x.json.revocado === true && almacen.ultimoHeartbeat === 'viejo', 'equipo revocado: 403 y no se registra latido');
  reiniciar();
  x = await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1', celularActivo: false });
  assert(x.status === 200 && almacen.celularActivo === false, 'la PC puede apagar el control remoto (se guarda)');
  reiniciar({ comandosV: undefined });
  await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  assert(tipos() === 'bot-pausar' && almacen.comandosV === 1, 'equipos viejos (sin versión) funcionan: empiezan en 0 y pasan a 1');

  // 5) consulta de rutina sin cambios: solo toca el latido, no la lista ni la versión
  reiniciar({ comandosV: 7 });
  await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1' });
  assert(almacen.comandosV === 7 && almacen.ultimoHeartbeat !== 'viejo', 'consulta sin cambios: no reescribe la lista (versión intacta) y registra el latido');

  // 6) si alguien gana la carrera una y otra vez, se reintenta y al final avisa en vez de perder la orden en silencio
  reiniciar();
  interferir = 1;
  x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  assert(x.status === 200 && tipos() === 'bot-pausar' && almacen.comandos.some((c) => c.id.startsWith('rival')), 'un cambio ajeno en medio: se reintenta, se conserva lo ajeno y la orden se guarda');
  reiniciar();
  interferir = 99;
  x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  assert(x.status === 503 && tipos() === '', 'si la competencia no termina, responde 503 (la app puede reintentar) y no deja nada a medias');
  assert(lecturas === REINTENTOS, 'reintenta una cantidad acotada de veces (no queda en un bucle)');

  // 7) el módulo por sí solo: omitir no guarda nada
  reiniciar();
  const r = await mutarComandos(FakeDevice, { userId: 'u1', deviceId: 'pc1' }, () => ({ omitir: true }), () => ({ ultimoHeartbeat: 'no' }));
  assert(r.guardado === false && almacen.ultimoHeartbeat === 'viejo', 'si la función pide omitir, no se escribe nada');

  console.log('\n✅ Todos los tests de concurrencia de órdenes pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
