// tests/errores-fuga.test.js — AUD-001 #10: un Error interno (rutas, consultas, texto de la base) NO debe llegar al cuerpo de la respuesta.
// El detalle queda en el log del servidor; al cliente le llega un mensaje genérico en español, con el mismo status HTTP de antes.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
const fs = require('fs');
const path = require('path');
const { assert, inyectar, logCapturado, limiteFalso, servir, fijarIp, consulta } = require('./_ayuda');

const INTERNO = 'MongoServerError: connect ECONNREFUSED mongodb://usuario:clave-secreta@cluster0.interno:27017/akira';
const falla = () => Promise.reject(new Error(INTERNO));
const log = logCapturado();
inyectar('config/logger.js', log);

// ── modelos y servicios de mentira (todo lo que toca la base falla con un texto interno) ──
const User = {
  countDocuments: falla, find: () => consulta(null, { error: new Error(INTERNO) }), findById: () => consulta(null, { error: new Error(INTERNO) }),
  findByIdAndUpdate: falla, generarCodigoUnico: falla,
};
inyectar('models/User.js', User);
inyectar('models/Log.js', { registrar: async () => {}, countDocuments: falla, find: () => consulta(null, { error: new Error(INTERNO) }) });
inyectar('models/Referido.js', { create: async () => {}, find: () => consulta([]) });
inyectar('models/Device.js', { countDocuments: falla, distinct: falla, find: () => consulta(null, { error: new Error(INTERNO) }) });
inyectar('models/Pago.js', {});
inyectar('models/OAuthCode.js', {});
inyectar('models/Limite.js', limiteFalso());
inyectar('models/Suggestion.js', { countDocuments: falla, find: () => consulta(null, { error: new Error(INTERNO) }), findByIdAndUpdate: falla, aggregate: falla });
inyectar('models/Config.js', { findOne: falla });
inyectar('services/suggestion.service.js', { analizarSugerencia: async () => ({ puntuacion: 5, analisisIA: { categoria: 'otra' } }) });
inyectar('services/bot.manager.js', { panicStop: async () => { throw new Error(INTERNO); }, getActiveUserIds: () => [], getQRPendiente: () => null });
inyectar('services/email.service.js', { enviarCodigoVerificacion: async () => true, enviarRecuperoPassword: async () => true, enviarEmail: async () => true });
const USUARIO = { _id: 'adm1', rol: 'admin', nombre: 'Ana', email: 'admin@akira.test', plan: 'admin', codigoReferido: '', descuentoReferido: 0 };
inyectar('middleware/auth.js', { requireAuth: (req, _res, next) => { req.user = USUARIO; next(); }, requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });

const { responderError, MENSAJE_GENERICO } = require('../lib/errores');

(async () => {
  console.log('\n[errores-fuga] Tests:');

  // ── el helper ──
  let status = 0; let cuerpo = null;
  const res = { status(s) { status = s; return this; }, json(j) { cuerpo = j; return this; } };
  responderError(res, 'Prueba', new Error(INTERNO));
  assert(status === 500 && cuerpo.error === MENSAJE_GENERICO && !JSON.stringify(cuerpo).includes('mongodb'), 'responderError: 500 con mensaje genérico, sin el texto interno');
  assert(log.lineas.some((l) => l.includes('[Prueba]') && l.includes('ECONNREFUSED')), 'responderError: el detalle completo queda en el log del servidor');
  responderError(res, 'Prueba', new Error(INTERNO), { status: 503, mensaje: 'No disponible.', extra: { ok: false } });
  assert(status === 503 && cuerpo.ok === false && cuerpo.error === 'No disponible.', 'responderError: status, mensaje y campos extra a elección (ej. ok:false)');

  // ── revisión estática: ninguna respuesta de estas rutas arma el cuerpo con err.message ──
  for (const f of ['admin.routes.js', 'subscription.routes.js', 'auth.routes.js', 'suggestions.routes.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', f), 'utf8');
    const malas = src.match(/\.json\(\{[^;]*?\b(?:err|e|error)\.message[^;]*?\}\)/g) || [];
    assert(malas.length === 0, `${f}: ninguna respuesta .json() incluye err.message (${malas.length} encontradas)`);
  }
  const srcSub = fs.readFileSync(path.join(__dirname, '..', 'routes', 'subscription.routes.js'), 'utf8');
  assert(!/MP_PLATFORM_ACCESS_TOKEN\.slice/.test(srcSub), 'subscription: no se loguea ningún pedazo del token de Mercado Pago');

  // ── recorrido real por HTTP ──
  const ctx = { antes: [fijarIp] };
  const admin = await servir('/api/admin', require('../routes/admin.routes'), ctx);
  const subs = await servir('/api/subscriptions', require('../routes/subscription.routes'), ctx);
  const auth = await servir('/api/auth', require('../routes/auth.routes'), ctx);
  const sugs = await servir('/api/suggestions', require('../routes/suggestions.routes'), ctx);
  const sinFuga = (r, status, m) => assert(r.status === status && r.body && typeof r.body.error === 'string' && !/mongo|ECONNREFUSED|clave-secreta|cluster0|interno/i.test(r.texto), m);

  sinFuga(await admin.llamar('/dashboard'), 500, 'admin GET /dashboard: 500 sin el texto interno');
  sinFuga(await admin.llamar('/users'), 500, 'admin GET /users: 500 sin el texto interno');
  sinFuga(await admin.llamar('/users/66f1a2b3c4d5e6f7a8b9c0d1'), 500, 'admin GET /users/:id: 500 sin el texto interno');
  sinFuga(await admin.llamar('/users/66f1a2b3c4d5e6f7a8b9c0d1/block', { metodo: 'POST', cuerpo: {} }), 500, 'admin POST /users/:id/block: 500 sin el texto interno');
  sinFuga(await admin.llamar('/logs'), 500, 'admin GET /logs: 500 sin el texto interno');
  const r = await admin.llamar('/dashboard');
  assert(log.lineas.some((l) => l.includes('[Admin GET /dashboard]') && l.includes('ECONNREFUSED')), 'admin: el detalle sí queda en el log, con la ruta que falló');
  assert(r.body.error === MENSAJE_GENERICO, 'admin: el mensaje es el genérico en español');

  sinFuga(await subs.llamar('/mi-suscripcion'), 500, 'subscription GET /mi-suscripcion: 500 sin el texto interno');
  sinFuga(await auth.llamar('/generar-codigo', { metodo: 'POST', cuerpo: {} }), 500, 'auth POST /generar-codigo: 500 sin el texto interno');
  sinFuga(await sugs.llamar('/mias'), 500, 'suggestions GET /mias: 500 sin el texto interno');
  sinFuga(await sugs.llamar('/'), 500, 'suggestions GET / (admin): 500 sin el texto interno');
  sinFuga(await sugs.llamar('/66f1a2b3c4d5e6f7a8b9c0d1', { metodo: 'PATCH', cuerpo: { estado: 'revisada' } }), 500, 'suggestions PATCH /:id: 500 sin el texto interno');

  // ── checkout: ni el token de Mercado Pago (ni un pedazo) en el log, ni BACKEND_URL en la respuesta ──
  process.env.MP_PLATFORM_ACCESS_TOKEN = 'APP_USR-1234567890123456-TOKEN-SECRETO-DE-LA-PLATAFORMA';
  process.env.BACKEND_URL = 'http://localhost:4000/ruta-interna';
  process.env.FRONTEND_URL = 'https://akiracloud.lat';
  const ch = await subs.llamar('/checkout', { metodo: 'POST', cuerpo: { plan: 'pro_mensual' } });
  assert(ch.status === 503 && typeof ch.body.error === 'string', 'checkout con BACKEND_URL inválida: sigue respondiendo 503');
  assert(!/localhost|ruta-interna|BACKEND_URL|ngrok/i.test(ch.texto), 'checkout: la respuesta 503 no devuelve BACKEND_URL ni explica cómo está configurado el servidor');
  assert(log.lineas.some((l) => l.includes('BACKEND_URL inválida')), 'checkout: el detalle de la configuración mala queda en el log');
  assert(!log.lineas.some((l) => l.includes('APP_USR-123456') || l.includes('TOKEN-SECRETO')), 'checkout: ni el token de Mercado Pago ni un pedazo de él aparecen en el log');
  assert(log.lineas.some((l) => /MP_TOKEN=OK/.test(l)), 'checkout: el log solo dice si el token está o falta');
  process.env.MP_PLATFORM_ACCESS_TOKEN = '';
  const sinToken = await subs.llamar('/checkout', { metodo: 'POST', cuerpo: { plan: 'pro_mensual' } });
  assert(sinToken.status === 503 && !/\.env|MP_PLATFORM/.test(sinToken.texto), 'checkout sin token: 503 sin nombrar variables de entorno');

  // ── los mensajes de validación para la persona NO cambian ──
  const v = await subs.llamar('/checkout', { metodo: 'POST', cuerpo: { plan: 'inexistente' } });
  assert(v.status === 400 && /Plan inválido/.test(v.body.error), 'checkout con plan inválido: el mensaje de validación sigue igual (400)');
  const v2 = await subs.llamar('/checkout', { metodo: 'POST', cuerpo: {} });
  assert(v2.status === 400 && v2.body.error === 'Falta el campo plan', 'checkout sin plan: el mensaje de validación sigue igual (400)');

  for (const s of [admin, subs, auth, sugs]) await s.cerrar();
  console.log('\n✅ Todos los tests de fuga de errores pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
