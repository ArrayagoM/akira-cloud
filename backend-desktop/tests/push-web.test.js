// tests/push-web.test.js — avisos push de la app instalada desde la web (Web Push): suscripción, envío y bajas.
// Modelos y servicio de envío simulados (no sale a internet ni toca ninguna base real).
'use strict';

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;

const Module = require('module');
const path = require('path');

const celulares = [];
class FakeMobile {
  constructor(d) { Object.assign(this, { activo: true, suscripcion: null, ultimoUso: new Date(), ...d }); }
  async save() { return this; }
  static async create(d) { const x = new FakeMobile(d); celulares.push(x); return x; }
  static findOne(q) { return Promise.resolve(celulares.find((c) => (q.pushToken === undefined || c.pushToken === q.pushToken) && (q.userId === undefined || String(c.userId) === String(q.userId))) || null); }
  static find(q) { return Promise.resolve(celulares.filter((c) => String(c.userId) === String(q.userId) && c.activo === q.activo)); }
}
const cache = Module._cache;
const inyectar = (rel, exportado) => { const f = path.join(__dirname, '..', rel); cache[f] = { id: f, filename: f, loaded: true, exports: exportado, children: [], paths: [] }; };
inyectar('models/Device.js', {});
inyectar('models/MobileDevice.js', FakeMobile);
inyectar('middleware/auth.js', { requireAuth: (_q, _r, n) => n(), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
inyectar('config/logger.js', { info() {}, warn() {}, error() {} });

const push = require('../services/push.service');
const mobile = require('../routes/mobile.routes');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
async function llamar(router, metodo, ruta, user, body) {
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  let status = 200; let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  for (const h of capa.route.stack.map((s) => s.handle)) await h({ user, body, params: {}, query: {}, ip: '1.1.1.1' }, res, () => {});
  return { status, json };
}
const U = { _id: 'u1', email: 'a@b.com', nombre: 'Ana' };
const sub = (n) => ({ endpoint: `https://web.push.apple.com/abc${n}`, keys: { p256dh: 'BNc' + 'x'.repeat(60), auth: 'au' + 'y'.repeat(20) } });

(async () => {
  console.log('\n[push-web] Tests:');

  // ── validación de la suscripción ──
  assert(push.suscripcionValida(sub(1)), 'una suscripción completa (https + claves) es válida');
  assert(!push.suscripcionValida({ endpoint: 'http://inseguro', keys: sub(1).keys }), 'una URL que no es https se rechaza');
  assert(!push.suscripcionValida({ endpoint: sub(1).endpoint }) && !push.suscripcionValida(null) && !push.suscripcionValida({ endpoint: sub(1).endpoint, keys: { p256dh: 1, auth: 2 } }), 'sin claves o con datos raros se rechaza');

  // ── clave pública ──
  let x = await llamar(mobile, 'get', '/web-push/clave', null, {});
  assert(x.status === 503 && x.json.disponible === false, 'sin claves VAPID en el servidor, la app web sabe que los avisos no están disponibles');
  process.env.VAPID_PUBLIC_KEY = 'PUBLICA'; process.env.VAPID_PRIVATE_KEY = 'PRIVADA';
  x = await llamar(mobile, 'get', '/web-push/clave', null, {});
  assert(x.status === 200 && x.json.clave === 'PUBLICA' && !JSON.stringify(x.json).includes('PRIVADA'), 'con claves devuelve SOLO la pública');

  // ── registrar ──
  x = await llamar(mobile, 'post', '/registrar', U, { suscripcion: { endpoint: 'http://x', keys: {} } });
  assert(x.status === 400, 'registrar una suscripción inválida → 400');
  x = await llamar(mobile, 'post', '/registrar', U, { suscripcion: sub(1), nombre: 'iPhone de Ana' });
  assert(x.status === 200 && celulares.length === 1 && celulares[0].plataforma === 'web' && celulares[0].pushToken === sub(1).endpoint && celulares[0].suscripcion.keys.auth.startsWith('au'), 'registra el celular web (plataforma web, la URL como identificador y las claves guardadas)');
  x = await llamar(mobile, 'post', '/registrar', U, { suscripcion: sub(1) });
  assert(celulares.length === 1, 'registrar el mismo celular dos veces no lo duplica');

  // ── envío ──
  const enviados = []; const falsoWp = { sendNotification: async (s, cuerpo, op) => { if (s.endpoint.endsWith('muerto')) { const e = new Error('gone'); e.statusCode = 410; throw e; } if (s.endpoint.endsWith('roto')) { const e = new Error('x'); e.statusCode = 500; throw e; } enviados.push({ s, cuerpo: JSON.parse(cuerpo), op }); } };
  let r = await push.enviarWeb([sub(1), { endpoint: 'https://x/muerto', keys: sub(1).keys }, { endpoint: 'https://x/roto', keys: sub(1).keys }, { endpoint: 'basura' }], { titulo: 'Akira', cuerpo: 'Tu bot se cayó', datos: { tipo: 'caida' } }, { webpush: falsoWp });
  assert(r.enviados === 1 && r.invalidos.length === 1 && r.invalidos[0].endsWith('muerto') && r.errores === 1, 'envía, separa los dados de baja (410) de los errores pasajeros y descarta lo inválido');
  assert(enviados[0].cuerpo.titulo === 'Akira' && enviados[0].op.urgency === 'high' && enviados[0].op.TTL === 3600, 'el mensaje lleva título, texto y urgencia alta con vencimiento de 1 hora');
  delete process.env.VAPID_PRIVATE_KEY;
  r = await push.enviarWeb([sub(1)], { titulo: 'a', cuerpo: 'b' });
  assert(r.enviados === 0 && r.errores === 1, 'sin claves VAPID no intenta enviar nada (cuenta como error, no rompe)');
  process.env.VAPID_PRIVATE_KEY = 'PRIVADA';

  // ── notificarUsuario mezcla celular nativo + app web y da de baja lo muerto ──
  celulares.length = 0;
  await FakeMobile.create({ userId: 'u9', pushToken: 'ExponentPushToken[abcdefghijklmnop]', plataforma: 'android' });
  await FakeMobile.create({ userId: 'u9', pushToken: sub(7).endpoint, plataforma: 'web', suscripcion: sub(7) });
  const muerto = { endpoint: 'https://x/muerto', keys: sub(7).keys };
  await FakeMobile.create({ userId: 'u9', pushToken: muerto.endpoint, plataforma: 'web', suscripcion: muerto });
  const llamadas = { expo: [], web: [] };
  r = await push.notificarUsuario('u9', { titulo: 'Akira', cuerpo: 'Volvió' }, {
    MobileDevice: FakeMobile,
    enviarFn: async (tokens) => { llamadas.expo.push(tokens); return { enviados: tokens.length, invalidos: [], errores: 0 }; },
    enviarWebFn: async (subs) => { llamadas.web.push(subs.map((s) => s.endpoint)); return { enviados: 1, invalidos: [muerto.endpoint], errores: 0 }; },
  });
  assert(llamadas.expo[0].length === 1 && llamadas.web[0].length === 2, 'los celulares nativos van por Expo y los de la app web por Web Push');
  assert(r.enviados === 2 && celulares.find((c) => c.pushToken === muerto.endpoint).activo === false && celulares.filter((c) => c.activo).length === 2, 'suma los envíos y desactiva el celular web dado de baja');

  console.log('\n✅ Todos los tests de push web pasaron.\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
