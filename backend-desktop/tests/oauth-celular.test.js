// tests/oauth-celular.test.js — "Continuar con Google" en la app de Android (esquema akira://oauth + PKCE) sin cambiar el flujo de la web ni el de escritorio.
// Se usan las rutas reales de auth.routes.js; solo se reemplazan la base (modelos) y la estrategia de Google (para no salir a internet).
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const express = require('express');
const { assert, inyectar, logCapturado, limiteFalso, consulta } = require('./_ayuda');

inyectar('config/logger.js', logCapturado());
const usuario = { _id: 'u1', status: 'activo', emailVerificado: true, tokenVersion: 0, rol: 'user', email: 'ana@negocio.com' };
inyectar('models/User.js', { findById: (id) => consulta(id === 'u1' ? usuario : null), findByIdAndUpdate: async () => ({}), findOne: () => consulta(null) });
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('models/Referido.js', {});
inyectar('models/Limite.js', limiteFalso());
inyectar('services/email.service.js', {});

// Códigos OAuth en memoria, con la misma semántica de un solo uso (findOneAndDelete).
const codigos = new Map();
inyectar('models/OAuthCode.js', {
  create: async (d) => { codigos.set(d.code, { ...d }); return d; },
  findOneAndDelete: async ({ code }) => { const e = codigos.get(code); codigos.delete(code); return e || null; },
});

// Estrategia de Google de mentira: sin "code" manda a Google; con "code" inicia sesión como Ana. Registra las opciones que recibe.
const opcionesRecibidas = [];
passport.use('google', {
  authenticate(req, opciones) {
    opcionesRecibidas.push(opciones);
    if (req.query.code) return this.success({ _id: 'u1', email: 'ana@negocio.com' });
    return this.redirect('https://accounts.google.com/o/oauth2/fake');
  },
});

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

(async () => {
  console.log('\n[oauth-celular] Tests:');
  const app = express(); app.use(express.json()); app.use(passport.initialize());
  app.use('/api/auth', require('../routes/auth.routes'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const ir = async (ruta) => { const r = await fetch(base + ruta, { redirect: 'manual' }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* sin JSON */ } return { status: r.status, loc: r.headers.get('location'), body: j }; };
  const stateDe = (opts) => jwt.verify(opts.state, process.env.JWT_SECRET, { algorithms: ['HS256'] });

  const verifier = crypto.randomBytes(32).toString('hex');
  const desafio = sha256hex(verifier);

  // ── inicio: el desafío viaja firmado en `state` ──
  let r = await ir(`/google?mobile_challenge=${desafio}`);
  assert(r.status === 302 && /accounts\.google\.com/.test(r.loc), 'con desafío válido se manda a Google');
  assert(stateDe(opcionesRecibidas.at(-1)).mc === desafio, 'el desafío viaja dentro del state firmado');
  await ir('/google?mobile_challenge=' + 'z'.repeat(64));
  assert(opcionesRecibidas.at(-1).state === undefined, 'un desafío que no es sha256 en hexa se ignora (sin state)');
  await ir('/google');
  assert(opcionesRecibidas.at(-1).state === undefined, 'sin parámetros (web) no se agrega state: igual que antes');
  await ir(`/google?desktop_port=45123&mobile_challenge=${desafio}`);
  const stEsc = stateDe(opcionesRecibidas.at(-1));
  assert(stEsc.dp === 45123 && stEsc.mc === undefined, 'si llegan los dos, gana el flujo de escritorio (no se mezclan)');

  // ── vuelta de Google ──
  const state = jwt.sign({ mc: desafio }, process.env.JWT_SECRET, { expiresIn: '10m' });
  r = await ir(`/google/callback?code=abc&state=${state}`);
  assert(r.status === 302 && r.loc.startsWith('akira://oauth?code='), 'la app de Android vuelve por akira://oauth con un código');
  const codigoApp = new URL(r.loc).searchParams.get('code');
  assert(codigos.get(codigoApp).challenge === desafio, 'el código guarda el desafío para exigirlo al canjear');

  r = await ir(`/google/callback?code=abc`);
  assert(r.status === 302 && r.loc.startsWith('https://akiracloud.lat/oauth-callback?code='), 'la web sigue volviendo a /oauth-callback');
  const codigoWeb = new URL(r.loc).searchParams.get('code');
  assert(codigos.get(codigoWeb).challenge === undefined, 'el código de la web no lleva desafío');

  const stEscritorio = jwt.sign({ dp: 45123 }, process.env.JWT_SECRET, { expiresIn: '10m' });
  r = await ir(`/google/callback?code=abc&state=${stEscritorio}`);
  assert(r.status === 302 && r.loc.startsWith('http://127.0.0.1:45123/callback?code='), 'el escritorio sigue volviendo a su puerto local');

  const stFalso = jwt.sign({ mc: desafio }, 'otro-secreto-que-no-es-el-nuestro-xxxxxxxx', { expiresIn: '10m' });
  r = await ir(`/google/callback?code=abc&state=${stFalso}`);
  assert(r.loc.startsWith('https://akiracloud.lat/oauth-callback?code='), 'un state firmado con otra clave no sirve: cae al flujo normal de la web');
  const stMalo = jwt.sign({ mc: 'no-es-un-hash' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  r = await ir(`/google/callback?code=abc&state=${stMalo}`);
  assert(r.loc.startsWith('https://akiracloud.lat/oauth-callback?code='), 'un state con un desafío mal formado tampoco redirige a la app');

  // ── canje ──
  r = await ir(`/oauth-token?code=${codigoApp}&verifier=${'0'.repeat(64)}`);
  assert(r.status === 401 && !r.body.token, 'con un verifier equivocado no entrega la sesión');
  r = await ir(`/oauth-token?code=${codigoApp}&verifier=${verifier}`);
  assert(r.status === 401, 'y el código ya quedó gastado: ni el verifier correcto sirve después de un intento fallido');

  r = await ir(`/google/callback?code=abc&state=${state}`);
  const codigo2 = new URL(r.loc).searchParams.get('code');
  r = await ir(`/oauth-token?code=${codigo2}`);
  assert(r.status === 401, 'sin verifier un código de la app no se canjea (el atacante que lo roba no puede usarlo)');

  r = await ir(`/google/callback?code=abc&state=${state}`);
  const codigo3 = new URL(r.loc).searchParams.get('code');
  r = await ir(`/oauth-token?code=${codigo3}&verifier=${verifier}`);
  assert(r.status === 200 && typeof r.body.token === 'string', 'con el verifier correcto entrega la sesión');
  assert(jwt.verify(r.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] }).id === 'u1', 'el token es de la cuenta que entró con Google');
  r = await ir(`/oauth-token?code=${codigo3}&verifier=${verifier}`);
  assert(r.status === 401, 'un código se usa una sola vez');

  // web y escritorio: se canjean sin verifier, como siempre
  r = await ir(`/oauth-token?code=${codigoWeb}`);
  assert(r.status === 200 && typeof r.body.token === 'string', 'el código de la web se canjea sin verifier (sin cambios)');
  r = await ir('/oauth-token');
  assert(r.status === 400, 'sin código responde 400, como antes');
  r = await ir(`/oauth-token?code=${'f'.repeat(64)}&verifier=${verifier}`);
  assert(r.status === 401, 'un código inexistente responde 401');

  server.close();
  console.log('✅ oauth-celular: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
