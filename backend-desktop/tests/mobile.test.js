// tests/mobile.test.js — app móvil: estado de la PC, comandos mínimos, push (Expo) y alertas con push.
// Modelos simulados en memoria (no toca ninguna base real).
'use strict';

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);
process.env.FRONTEND_URL = 'https://akiracloud.lat';

const Module = require('module');
const path = require('path');

const dispositivos = []; const celulares = [];
class FakeDevice {
  constructor(d) { Object.assign(this, { activo: true, revocado: false, celularActivo: false, comandos: [], ultimoHeartbeat: new Date(), ...d }); }
  async save() { return this; }
  static findOne(q) { return Promise.resolve(dispositivos.find((d) => String(d.userId) === String(q.userId) && d.deviceId === q.deviceId && (q.activo === undefined || d.activo === q.activo) && (q.revocado === undefined || d.revocado === q.revocado)) || null); }
  static find(q) { return Promise.resolve(dispositivos.filter((d) => String(d.userId) === String(q.userId) && d.activo === q.activo && d.revocado === q.revocado)); }
}
class FakeMobile {
  constructor(d) { Object.assign(this, { activo: true, ultimoUso: new Date(), ...d }); }
  async save() { return this; }
  static async create(d) { const x = new FakeMobile(d); celulares.push(x); return x; }
  static findOne(q) { return Promise.resolve(celulares.find((c) => (q.pushToken === undefined || c.pushToken === q.pushToken) && (q.userId === undefined || String(c.userId) === String(q.userId))) || null); }
  static find(q) { return Promise.resolve(celulares.filter((c) => String(c.userId) === String(q.userId) && c.activo === q.activo)); }
}
const cache = Module._cache;
const inyectar = (rel, exportado) => { const f = path.join(__dirname, '..', rel); cache[f] = { id: f, filename: f, loaded: true, exports: exportado, children: [], paths: [] }; };
let usuarioActual = null;
inyectar('models/Device.js', FakeDevice);
inyectar('models/MobileDevice.js', FakeMobile);
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('middleware/auth.js', { requireAuth: (req, _res, next) => { req.user = usuarioActual; next(); }, requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
inyectar('config/logger.js', { info() {}, warn() {}, error() {} });

const comandos = require('../lib/comandos');
const push = require('../services/push.service');
const { procesarEstadoBot } = require('../services/alertas-estado.service');
const mobile = require('../routes/mobile.routes');
const licenses = require('../routes/licenses.routes');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
async function llamar(router, metodo, ruta, user, body, { params = {}, query = {} } = {}) {
  usuarioActual = user;
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  let status = 200; let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  for (const h of capa.route.stack.map((s) => s.handle)) await h({ user, body, params, query, ip: '1.1.1.1' }, res, () => {});
  return { status, json };
}
const U = { _id: 'u1', email: 'a@b.com', nombre: 'Ana', rol: 'user', plan: 'pro', planExpira: new Date(Date.now() + 30 * 86400000) };
const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';
const t0 = new Date('2026-10-08T15:00:00Z');
const slot = (o) => ({ slot: 0, deseado: true, activo: true, conectado: true, requiereQR: false, desdeMs: 0, ...o });

(async () => {
  console.log('\n[mobile] Tests:');

  // ── comandos (lógica pura) ──
  const d = { deviceId: 'pc1', celularActivo: false, comandos: [] };
  let fallo = null; try { comandos.encolar(d, 'bot-pausar', t0); } catch (e) { fallo = e; }
  assert(fallo?.status === 409 && fallo.codigo === 'CELULAR_DESACTIVADO', 'si el control desde el celular no está activado en la PC, se rechaza con un mensaje claro');
  d.celularActivo = true;
  fallo = null; try { comandos.encolar(d, 'formatear-disco', t0); } catch (e) { fallo = e; }
  assert(fallo?.status === 400, 'solo acepta los comandos de la lista (pausar, reanudar, vacaciones)');
  const c1 = comandos.encolar(d, 'bot-pausar', t0);
  assert(c1.estado === 'pendiente' && new Date(c1.venceEn) - t0 === 10 * 60 * 1000, 'el comando queda pendiente y vence a los 10 min');
  assert(comandos.encolar(d, 'bot-pausar', t0).id === c1.id && d.comandos.length === 1, 'repetir el mismo comando no lo duplica');
  const c2 = comandos.encolar(d, 'bot-reanudar', t0);
  assert(d.comandos.find((c) => c.id === c1.id).estado === 'cancelado' && comandos.pendientes(d, t0).map((c) => c.tipo).join() === 'bot-reanudar', 'un comando opuesto cancela al anterior (gana el último)');
  assert(comandos.pendientes(d, new Date(t0.getTime() + 11 * 60000)).length === 0 && d.comandos.find((c) => c.id === c2.id).estado === 'vencido', 'si la PC no lo retira a tiempo, vence y NO se ejecuta más tarde');
  const d2 = { deviceId: 'pc2', celularActivo: true, comandos: [] };
  const a = comandos.encolar(d2, 'vacaciones-on', t0); comandos.encolar(d2, 'bot-pausar', t0);
  comandos.confirmar(d2, [{ id: a.id, ok: true }, { id: 'inventado', ok: true }, { id: d2.comandos[1].id, ok: false, detalle: 'x'.repeat(500) }], t0);
  assert(d2.comandos[0].estado === 'hecho' && d2.comandos[1].estado === 'fallo' && d2.comandos[1].detalle.length === 120, 'la PC confirma: hecho / falló (el detalle se acota); ids inventados se ignoran');
  const d3 = { deviceId: 'pc3', celularActivo: true, comandos: [] };
  for (const t of ['bot-pausar', 'vacaciones-on']) comandos.encolar(d3, t, t0);
  assert(comandos.pendientes(d3, t0).length === 2, 'puede haber varios comandos distintos pendientes');

  // ── estado para la app ──
  const base = { deviceId: 'pc1', nombre: 'PC Barbería', version: '1.0.17', ultimoHeartbeat: new Date(t0.getTime() - 5 * 60000), celularActivo: true, comandos: [] };
  const R = (extra, ahora = t0) => comandos.resumirEstado({ ...base, ...extra }, ahora);
  assert(R({ estadoBot: { slots: [slot()] } }).bot === 'conectado', 'estado: conectado');
  assert(R({ estadoBot: { slots: [slot({ conectado: false, desdeMs: 9e5 })] } }).bot === 'caido', 'estado: caído');
  assert(R({ estadoBot: { slots: [slot({ conectado: false, requiereQR: true })] } }).motivo === 'sesion', 'estado: caído por sesión (pide QR)');
  assert(R({ estadoBot: { slots: [slot({ deseado: false, activo: false, conectado: false })] } }).bot === 'detenido', 'estado: detenido a propósito');
  assert(R({ estadoBot: { slots: [slot()], pausado: true } }).bot === 'pausado-licencia', 'estado: pausado por la licencia');
  assert(R({ estadoBot: { slots: [slot({ conectado: false, desdeMs: 1000 })] } }).bot === 'conectando', 'estado: reconectando (todavía dentro de la gracia)');
  assert(R({ estadoBot: null }).bot === 'desconocido', 'estado: sin datos todavía (app vieja)');
  assert(R({ estadoBot: { slots: [slot()] } }, new Date(t0.getTime() + 60 * 60000)).bot === 'pc-sin-senal', 'estado: la PC lleva más de 40 min sin dar señales');
  assert(R({ estadoBot: { slots: [slot()], vacaciones: true } }).vacaciones === true, 'informa si está en modo vacaciones');
  assert(R({ estadoBot: { slots: [slot()] }, resumen: { mensajesHoy: 5 } }).resumen.mensajesHoy === 5 && R({}).resumen === null, 'incluye el resumen del negocio solo si el usuario lo activó');

  // ── push (Expo) ──
  const pedidos = [];
  const expo = (resp) => async (url, op) => { pedidos.push({ url, body: JSON.parse(op.body), headers: op.headers }); return { json: async () => resp(JSON.parse(op.body)) }; };
  assert(push.tokenValido(TOKEN) && !push.tokenValido('abc') && !push.tokenValido('ExponentPushToken[]') && !push.tokenValido(null), 'valida el formato del token');
  let r = await push.enviar([TOKEN, TOKEN, 'basura'], { titulo: 'T', cuerpo: 'C' }, { fetchFn: expo((b) => ({ data: b.map(() => ({ status: 'ok' })) })), accessToken: 'sec' });
  assert(r.enviados === 1 && pedidos[0].body.length === 1 && pedidos[0].url.includes('exp.host') && pedidos[0].headers.Authorization === 'Bearer sec', 'sin duplicados ni tokens inválidos; usa la API de Expo');
  r = await push.enviar([TOKEN], { titulo: 'T', cuerpo: 'C' }, { fetchFn: expo(() => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] })) });
  assert(r.invalidos[0] === TOKEN && r.enviados === 0, 'detecta los celulares dados de baja');
  r = await push.enviar([TOKEN], { titulo: 'T', cuerpo: 'C' }, { fetchFn: async () => { throw new Error('sin red'); } });
  assert(r.errores === 1, 'si Expo no responde, no rompe');
  const muchos = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[token-numero-${i}-xxxxx]`);
  pedidos.length = 0; await push.enviar(muchos, { titulo: 'T', cuerpo: 'C' }, { fetchFn: expo((b) => ({ data: b.map(() => ({ status: 'ok' })) })) });
  assert(pedidos.length === 2 && pedidos[0].body.length === 100, 'manda en lotes de 100');

  // ── rutas del celular ──
  let x = await llamar(mobile, 'post', '/registrar', U, { pushToken: 'malo' });
  assert(x.status === 400, 'registrar con un token inválido → 400');
  x = await llamar(mobile, 'post', '/registrar', U, { pushToken: TOKEN, plataforma: 'android', nombre: 'Pixel de Ana' });
  assert(x.status === 200 && celulares.length === 1 && celulares[0].plataforma === 'android', 'registra el celular');
  x = await llamar(mobile, 'post', '/registrar', { ...U, _id: 'u2' }, { pushToken: TOKEN, plataforma: 'ios' });
  assert(celulares.length === 1 && String(celulares[0].userId) === 'u2', 'el mismo celular con otra cuenta pasa a la cuenta nueva (no queda duplicado ni recibe avisos de la anterior)');
  x = await llamar(mobile, 'post', '/registrar', U, { pushToken: TOKEN });
  for (let i = 0; i < 5; i++) await llamar(mobile, 'post', '/registrar', U, { pushToken: `ExponentPushToken[cel-extra-numero-${i}-xx]` });
  x = await llamar(mobile, 'post', '/registrar', U, { pushToken: 'ExponentPushToken[uno-mas-de-la-cuenta-xx]' });
  assert(x.status === 409 && /5 celulares/.test(x.json.error), 'máximo 5 celulares por cuenta');

  dispositivos.push(new FakeDevice({ userId: 'u1', deviceId: 'pc1', nombre: 'PC Barbería', estadoBot: { slots: [slot()] } }));
  dispositivos.push(new FakeDevice({ userId: 'u9', deviceId: 'pc-ajena', nombre: 'Ajena' }));
  x = await llamar(mobile, 'get', '/estado', U);
  assert(x.status === 200 && x.json.pcs.length === 1 && x.json.pcs[0].bot === 'conectado' && x.json.pcs[0].controlRemoto === false, 'GET /estado devuelve SOLO las PCs del usuario');
  assert(!JSON.stringify(x.json).match(/pushToken|licenseToken|fingerprint/), 'no filtra datos internos (tokens, huella)');

  x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  assert(x.status === 409 && x.json.codigo === 'CELULAR_DESACTIVADO', 'comando con el control remoto apagado en la PC → 409');
  x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc-ajena', tipo: 'bot-pausar' });
  assert(x.status === 404, 'no se puede mandar comandos a la PC de otro usuario');

  // La PC activa el control remoto y consulta comandos
  x = await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1', celularActivo: true });
  assert(x.status === 200 && x.json.comandos.length === 0 && dispositivos[0].celularActivo === true, 'la PC activa el control remoto (queda registrado) y no hay comandos');
  x = await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'bot-pausar' });
  const cmdId = x.json.comando.id;
  assert(x.status === 200 && x.json.comando.estado === 'pendiente', 'ahora el comando se acepta');
  x = await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1' });
  assert(x.json.comandos.length === 1 && x.json.comandos[0].tipo === 'bot-pausar' && x.json.comandos[0].id === cmdId, 'la PC retira el comando');
  x = await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1', hechos: [{ id: cmdId, ok: true }] });
  assert(x.json.comandos.length === 0, 'una vez confirmado ya no se vuelve a entregar');
  x = await llamar(mobile, 'get', '/comandos/:id', U, null, { params: { id: cmdId }, query: { deviceId: 'pc1' } });
  assert(x.json.estado === 'hecho', 'la app puede ver que el comando se ejecutó');
  x = await llamar(licenses, 'post', '/comandos', { ...U, _id: 'u9' }, { deviceId: 'pc1' });
  assert(x.status === 403, 'otro usuario no puede retirar comandos de esa PC');
  await llamar(mobile, 'post', '/comandos', U, { deviceId: 'pc1', tipo: 'vacaciones-on' });
  x = await llamar(licenses, 'post', '/comandos', U, { deviceId: 'pc1', celularActivo: false });
  assert(x.json.comandos.length === 0, 'si el usuario apaga el control remoto en la PC, no se entrega ningún comando pendiente');

  // ── alertas con push ──
  const enviadosPush = []; const emails = [];
  const dev = { deviceId: 'pc1', nombre: 'PC Barbería', alertaBot: undefined };
  const caido = { slots: [slot({ conectado: false, requiereQR: true, desdeMs: 1000 })] };
  const opciones = (extra) => ({ user: U, device: dev, ahora: t0, enviar: async (m) => { emails.push(m); return true; }, notificarPush: async (p) => { enviadosPush.push(p); return { enviados: 1 }; }, ...extra });
  let rr = await procesarEstadoBot({ ...opciones(), estadoBot: caido });
  assert(rr.accion === 'caida' && enviadosPush.length === 1 && emails.length === 1 && /dejó de atender/.test(enviadosPush[0].titulo), 'cuando se cae: email + push al celular');
  assert(!JSON.stringify(enviadosPush).match(/Ana|2241|@/), 'la notificación no lleva datos de clientes');
  rr = await procesarEstadoBot({ ...opciones(), estadoBot: { slots: [slot()] } });
  assert(rr.accion === 'recuperado' && enviadosPush.length === 2 && /volvió/.test(enviadosPush[1].titulo), 'cuando vuelve: push de "volvió"');
  const dev2 = { deviceId: 'pc2', nombre: 'PC', alertaBot: undefined }; enviadosPush.length = 0;
  await procesarEstadoBot({ ...opciones({ device: dev2, user: { ...U, alertas: { push: false, email: false } } }), estadoBot: caido });
  assert(enviadosPush.length === 0, 'con las alertas apagadas no manda nada');
  const dev3 = { deviceId: 'pc3', nombre: 'PC', alertaBot: undefined };
  rr = await procesarEstadoBot({ ...opciones({ device: dev3, notificarPush: async () => { throw new Error('expo caído'); } }), estadoBot: caido });
  assert(rr.accion === 'caida' && dev3.alertaBot.abierta === true, 'si Expo falla, igual se registra el incidente y sale el email');

  console.log('\n✅ mobile OK\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
