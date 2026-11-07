// tests/cobro-webhook.test.js — rutas de cobro de suscripciones con Mercado Pago simulado (no sale a internet ni toca ninguna base).
// Antes: el webhook respondía 200 ANTES de procesar (si fallaba, Mercado Pago nunca reintentaba), la firma era opcional en tres sentidos
// y los ids de pago que llegaban de afuera se pegaban tal cual en la consulta a Mercado Pago.
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.MP_PLATFORM_ACCESS_TOKEN = 'TEST-token';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
delete process.env.MP_PLATFORM_WEBHOOK_SECRET; delete process.env.MP_WEBHOOK_FIRMA_ESTRICTA;

const { EventEmitter } = require('events');
const crypto = require('crypto');
const path = require('path');
const Module = require('module');
const https = require('https');

const ID_USUARIO = '507f1f77bcf86cd799439011';
const usuarios = new Map(); let fallarBase = false; const logs = [];
const cadena = (valor) => ({ select() { return { lean: async () => valor, then: (r, j) => Promise.resolve(valor).then(r, j) }; }, lean: async () => valor, then: (r, j) => Promise.resolve(valor).then(r, j) });
const UserFalso = {
  findOneAndUpdate(filtro, upd) {
    if (fallarBase) throw new Error('la base se cortó');
    const u = usuarios.get(String(filtro._id)); const id = filtro.pagosMpProcesados && filtro.pagosMpProcesados.$ne;
    if (!u || (id && u.pagosMpProcesados.includes(id))) return cadena(null);
    const antes = { plan: u.plan, planExpira: u.planExpira };
    if (upd.$push) u.pagosMpProcesados.push(...upd.$push.pagosMpProcesados.$each); if (upd.$set) Object.assign(u, upd.$set); return cadena(antes);
  },
  async findByIdAndUpdate(id, set) { const u = usuarios.get(String(id)); if (u && set) Object.assign(u, set); return u; },
  findById(id) { return cadena(usuarios.get(String(id)) || null); },
};
const inyectar = (rel, ex) => { const f = path.join(__dirname, '..', rel); Module._cache[f] = { id: f, filename: f, loaded: true, exports: ex, children: [], paths: [] }; };
inyectar('models/User.js', UserFalso);
inyectar('models/Referido.js', { findOne: async () => null });
inyectar('models/Log.js', { registrar: async (x) => { logs.push(x); } });
inyectar('models/Pago.js', { create: async (x) => x });
inyectar('middleware/auth.js', { requireAuth: (req, _res, next) => next() });
inyectar('config/logger.js', { info() {}, warn() {}, error() {} });

// Mercado Pago simulado: https.request devuelve lo que diga `respuestaMp` (o falla)
const consultasMp = []; let respuestaMp = null;
https.request = (opts, cb) => {
  const req = new EventEmitter();
  req.write = () => {}; req.setTimeout = () => {}; req.destroy = (e) => req.emit('error', e);
  req.end = () => setImmediate(() => {
    consultasMp.push(opts.path);
    const r = respuestaMp(opts.path);
    if (r instanceof Error) return req.emit('error', r);
    const res = new EventEmitter(); res.statusCode = r.status; cb(res); res.emit('data', JSON.stringify(r.body)); res.emit('end');
  });
  return req;
};

const router = require('../routes/subscription.routes');
function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
async function llamar(metodo, ruta, { headers = {}, query = {}, body, user } = {}) {
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  const r = { status: null, json: null, redirigido: null };
  const res = { sendStatus(c) { r.status = c; return this; }, status(c) { r.status = c; return this; }, json(j) { r.json = j; if (r.status === null) r.status = 200; return this; }, redirect(c, u) { r.status = c; r.redirigido = u; return this; } };
  for (const h of capa.route.stack.map((s) => s.handle)) await h({ headers, query, body, params: {}, user, ip: '1.1.1.1' }, res, () => {});
  return r;
}
const pagoMp = (id, extra = {}) => ({ status: 200, body: { id, status: 'approved', transaction_amount: 49000, currency_id: 'ARS', metadata: { precio_esperado: 49000 }, external_reference: `${ID_USUARIO}|pro|mensual|0`, ...extra } });
const nuevoUsuario = () => usuarios.set(ID_USUARIO, { plan: 'trial', planExpira: null, pagosMpProcesados: [] });
const aviso = (id = 1234567) => ({ type: 'payment', data: { id } });
const reiniciar = () => { consultasMp.length = 0; fallarBase = false; nuevoUsuario(); respuestaMp = (p) => pagoMp(Number(p.split('/').pop())); };

(async () => {
  console.log('\n[cobro-webhook] Tests:');

  // ── camino normal (igual que antes) ──
  reiniciar();
  let r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'pro' && consultasMp[0] === '/v1/payments/1234567', 'aviso de pago aprobado: activa el plan y responde 200 (ya con el plan activado, no antes)');
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).pagosMpProcesados.length === 1, 'el mismo aviso otra vez: 200 y no se activa de nuevo');

  // ── fallas pasajeras → 500 para que Mercado Pago reintente ──
  reiniciar(); respuestaMp = () => new Error('sin red');
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 500 && usuarios.get(ID_USUARIO).plan === 'trial', 'si Mercado Pago no contesta: 500 (MP reintenta) y nada queda a medias');
  reiniciar(); respuestaMp = () => ({ status: 404, body: { message: 'Payment not found' } });
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 500, 'si MP todavía no encuentra el pago (404 por demora): 500 para que reintente');
  reiniciar(); fallarBase = true;
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 500 && usuarios.get(ID_USUARIO).plan === 'trial' && !usuarios.get(ID_USUARIO).pagosMpProcesados.length, 'si la base se corta al activar: 500 y el pago NO queda reclamado');
  fallarBase = false;
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'pro', 'el reintento de Mercado Pago activa el plan (antes quedaba perdido)');

  // ── lo que no se arregla reintentando → 200 ──
  reiniciar(); respuestaMp = (p) => pagoMp(Number(p.split('/').pop()), { status: 'pending' });
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'trial', 'pago pendiente: 200 y no se activa');
  reiniciar(); respuestaMp = (p) => pagoMp(Number(p.split('/').pop()), { transaction_amount: 100, metadata: { precio_esperado: 49000 } });
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'trial', 'pago por menos de lo que cuesta: 200 (no tiene sentido reintentar) y no activa');
  reiniciar(); respuestaMp = (p) => pagoMp(Number(p.split('/').pop()), { external_reference: 'no-es-un-id|pro|mensual|0' });
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'trial', 'referencia con un userId que no es un id válido: 200 y no rompe (antes tiraba error de conversión)');
  reiniciar(); respuestaMp = (p) => pagoMp(Number(p.split('/').pop()), { external_reference: `${ID_USUARIO}|plan-inventado|mensual|0` });
  r = await llamar('post', '/webhook', { body: aviso() });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'trial', 'plan desconocido: 200 y no activa');
  reiniciar();
  r = await llamar('post', '/webhook', { body: { type: 'merchant_order', data: { id: 5 } } });
  assert(r.status === 200 && consultasMp.length === 0, 'otros tipos de aviso: 200 sin consultar nada');
  r = await llamar('post', '/webhook', { body: undefined });
  assert(r.status === 200 && consultasMp.length === 0, 'aviso sin cuerpo: 200 y no se cae (antes tiraba un error sin atrapar)');

  // ── ids que llegan de afuera ──
  reiniciar();
  for (const raro of ['../../users/me', '123?x=1', '12 3', ['1'], { a: 1 }, '9'.repeat(30)]) {
    r = await llamar('post', '/webhook', { body: aviso(raro) });
    assert(r.status === 200 && consultasMp.length === 0, `id raro en el aviso (${JSON.stringify(raro).slice(0, 24)}): se ignora y NO se consulta a Mercado Pago`);
  }
  r = await llamar('get', '/return', { query: { status: 'approved', payment_id: '../../v1/payments/search?x=1', external_reference: `${ID_USUARIO}|pro|mensual|0` } });
  assert(r.status === 302 && consultasMp.length === 0 && usuarios.get(ID_USUARIO).plan === 'trial', '/return con un payment_id raro: redirige igual y no consulta nada');
  r = await llamar('post', '/verificar-pago', { body: { payment_id: '1/../x' }, user: { _id: ID_USUARIO } });
  assert(r.status === 400 && consultasMp.length === 0, '/verificar-pago con un payment_id raro: 400 sin consultar');
  r = await llamar('get', '/return', { query: { status: 'approved', payment_id: '4455667', external_reference: `${ID_USUARIO}|pro|mensual|0` } });
  assert(r.status === 302 && usuarios.get(ID_USUARIO).plan === 'pro', '/return con un id normal: sigue activando el plan como siempre');
  reiniciar();
  r = await llamar('post', '/verificar-pago', { body: { payment_id: '4455668' }, user: { _id: ID_USUARIO } });
  assert(r.status === 200 && r.json.ok === true && usuarios.get(ID_USUARIO).plan === 'pro', '/verificar-pago con un id normal: sigue activando como siempre');
  reiniciar();
  r = await llamar('post', '/verificar-pago', { body: { payment_id: '4455669' }, user: { _id: '507f1f77bcf86cd799439099' } });
  assert(r.status === 403 && usuarios.get(ID_USUARIO).plan === 'trial', '/verificar-pago de un pago ajeno: 403 como siempre');

  // ── firma del aviso ──
  const secreto = 'secreto-de-prueba'; process.env.MP_PLATFORM_WEBHOOK_SECRET = secreto;
  const firmar = (id, req, ts, s = secreto) => crypto.createHmac('sha256', s).update(`id:${id};request-id:${req};ts:${ts};`).digest('hex');
  const ts = String(Date.now());
  reiniciar();
  r = await llamar('post', '/webhook', { body: aviso(), query: { 'data.id': '1234567' }, headers: { 'x-request-id': 'r1', 'x-signature': `ts=${ts},v1=${firmar('1234567', 'r1', ts)}` } });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'pro', 'con secreto y firma válida: se procesa');
  reiniciar();
  r = await llamar('post', '/webhook', { body: aviso(), query: { 'data.id': '1234567' }, headers: { 'x-request-id': 'r1', 'x-signature': `ts=${ts},v1=${firmar('1234567', 'r1', ts, 'otro')}` } });
  assert(r.status === 401 && consultasMp.length === 0 && usuarios.get(ID_USUARIO).plan === 'trial', 'firma mala: 401 y NO se consulta a Mercado Pago ni se activa nada');
  r = await llamar('post', '/webhook', { body: aviso(), query: { 'data.id': '1234567' }, headers: { 'x-request-id': 'r1', 'x-signature': `ts=${ts},v1=abc` } });
  assert(r.status === 401, 'firma truncada: 401 (antes pasaba)');
  r = await llamar('post', '/webhook', { body: aviso(), headers: {} });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'pro', 'con secreto pero aviso sin cabecera de firma, modo por defecto: se procesa (no se rompen cobros reales)');
  process.env.MP_WEBHOOK_FIRMA_ESTRICTA = '1'; reiniciar();
  r = await llamar('post', '/webhook', { body: aviso(), headers: {} });
  assert(r.status === 401 && consultasMp.length === 0, 'modo estricto (MP_WEBHOOK_FIRMA_ESTRICTA=1): sin firma, 401');
  r = await llamar('post', '/webhook', { body: aviso(), query: { 'data.id': '1234567' }, headers: { 'x-request-id': 'r1', 'x-signature': `ts=${ts},v1=${firmar('1234567', 'r1', ts)}` } });
  assert(r.status === 200 && usuarios.get(ID_USUARIO).plan === 'pro', 'modo estricto con firma válida: se procesa');
  delete process.env.MP_PLATFORM_WEBHOOK_SECRET; delete process.env.MP_WEBHOOK_FIRMA_ESTRICTA;

  console.log('\n✅ Todos los tests de las rutas de cobro pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
