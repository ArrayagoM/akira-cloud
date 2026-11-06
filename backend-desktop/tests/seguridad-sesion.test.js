// tests/seguridad-sesion.test.js — AUD-001 #1, #3 y #6: el enlace de baja no es una sesión, "Bloquear usuario" bloquea de verdad,
// y el cuerpo de los pedidos se limpia de operadores "$" de Mongo. Con la app de Express real (passport + middleware) y base de mentira.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
process.env.GOOGLE_CLIENT_ID = 'x'; process.env.GOOGLE_CLIENT_SECRET = 'x'; process.env.GOOGLE_CALLBACK_URL = 'http://localhost/cb';
process.env.FACEBOOK_APP_ID = 'x'; process.env.FACEBOOK_APP_SECRET = 'x'; process.env.FACEBOOK_CALLBACK_URL = 'http://localhost/cb';

const path = require('path'); const Module = require('module'); const fs = require('fs'); const jwt = require('jsonwebtoken');
function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const inyectar = (rel, ex) => { const f = path.join(__dirname, '..', rel); Module._cache[f] = { id: f, filename: f, loaded: true, exports: ex, children: [], paths: [] }; };

// ── base de mentira ──
const usuarios = []; const equipos = [];
const cadena = (v) => { const p = Promise.resolve(v); p.select = () => p; p.lean = () => p; return p; };
const aplicar = (u, upd) => { for (const [k, v] of Object.entries(upd)) { if (k === '$inc') for (const [c, n] of Object.entries(v)) u[c] = (u[c] || 0) + n; else u[k] = v; } };
const User = {
  findById: (id) => cadena(usuarios.find((u) => u._id === id) || null),
  findOne: () => cadena(null),
  findByIdAndUpdate: (id, upd) => { const u = usuarios.find((x) => x._id === id); if (u) aplicar(u, upd); return cadena(u || null); },
  // soporta el filtro { _id, rol: { $ne: 'admin' } } que usa panicStop
  findOneAndUpdate: (f, upd) => { const u = usuarios.find((x) => x._id === f._id && (!f.rol || !f.rol.$ne || x.rol !== f.rol.$ne)); if (u) aplicar(u, upd); return cadena(u || null); },
};
const Device = {
  async updateMany(f, upd) {
    let n = 0;
    for (const d of equipos) {
      const okMotivo = !f.revocadoMotivo || (f.revocadoMotivo.$regex && new RegExp(f.revocadoMotivo.$regex).test(d.revocadoMotivo));
      if (d.userId === f.userId && d.revocado === f.revocado && okMotivo) { Object.assign(d, upd); n++; }
    }
    return { modifiedCount: n };
  },
};
inyectar('models/User.js', User); inyectar('models/Device.js', Device);
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('models/Referido.js', { create: async () => {} });
inyectar('models/Limite.js', { async findOneAndUpdate() { return { n: 1 }; } });
inyectar('services/email.service.js', { enviarCodigoVerificacion: async () => true, enviarRecuperoPassword: async () => true, enviarEmail: async () => true });

const express = require('express'); const passport = require('passport');
require('../config/passport')(passport);
const { requireAuth, generarJWT } = require('../middleware/auth');
const { evaluarRenovacion, payloadDe } = require('../lib/sesion');
const botManager = require('../services/bot.manager');
const mongoSanitize = require('express-mongo-sanitize');

const app = express(); app.use(express.json()); app.use(passport.initialize());
app.get('/protegida', requireAuth, (req, res) => res.json({ ok: true, id: req.user._id }));
app.post('/eco', mongoSanitize({ allowDots: true }), (req, res) => res.json(req.body));
app.use('/api/auth', require('../routes/auth.routes'));

(async () => {
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const llamar = async (ruta, { metodo = 'GET', token, cuerpo } = {}) => { const r = await fetch(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }); let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j }; };

  console.log('\n[seguridad-sesion] Tests:');
  usuarios.push({ _id: 'u1', rol: 'user', status: 'activo', tokenVersion: 0, emailVerificado: true, novedadesActivas: true, email: 'a@a.com' });
  usuarios.push({ _id: 'adm', rol: 'admin', status: 'activo', tokenVersion: 0, emailVerificado: true, email: 'adm@a.com' });

  // ── #1: el enlace de baja no sirve como sesión ──
  const sesion = generarJWT('u1', 0);
  const baja = jwt.sign({ id: 'u1', p: 'baja-novedades' }, process.env.JWT_SECRET); // igual al que firma services/email.novedades.js
  let r = await llamar('/protegida', { token: sesion });
  assert(r.status === 200 && r.body.id === 'u1', 'una sesión normal sigue entrando (nada se rompió)');
  r = await llamar('/protegida', { token: baja });
  assert(r.status === 401, 'el token del enlace de baja NO entra como sesión (antes sí, y no vencía)');
  r = await llamar('/api/auth/renovar', { metodo: 'POST', token: baja });
  assert(r.status === 401, 'el token de baja tampoco se puede canjear por una sesión renovada');
  assert(evaluarRenovacion(payloadDe(baja)).ok === false && evaluarRenovacion(payloadDe(sesion)).ok === true, 'la renovación rechaza tokens de un solo propósito y sigue aceptando sesiones');
  r = await llamar('/api/auth/baja-novedades?t=' + encodeURIComponent(baja));
  assert(r.status === 200 && usuarios[0].novedadesActivas === false && /no te enviaremos más novedades/.test(r.body), 'el enlace de baja de los emails (también los viejos) sigue dando de baja al usuario');
  r = await llamar('/api/auth/baja-novedades?t=' + encodeURIComponent(sesion));
  assert(!/no te enviaremos más novedades/.test(r.body), 'una sesión normal no sirve como enlace de baja');

  // ── #3: bloquear bloquea de verdad ──
  equipos.push({ userId: 'u1', deviceId: 'pc1', revocado: false, revocadoMotivo: '' });
  equipos.push({ userId: 'u1', deviceId: 'pc-vieja', revocado: true, revocadoMotivo: 'El usuario la quitó' });
  const antes = sesion;
  let b = await botManager.panicStop('u1', 'abuso');
  assert(b.ok && usuarios[0].status === 'bloqueado' && usuarios[0].bloqueadoPor === 'abuso', 'bloquear marca la cuenta como bloqueada (antes solo revocaba equipos)');
  assert(usuarios[0].tokenVersion === 1, 'bloquear invalida las sesiones abiertas (tokenVersion sube)');
  assert(equipos[0].revocado === true && equipos[0].revocadoMotivo.startsWith(botManager.MARCA_BLOQUEO), 'los equipos activos se revocan con la marca de bloqueo');
  r = await llamar('/protegida', { token: antes });
  assert(r.status === 401, 'con la sesión que tenía abierta ya no entra');
  r = await llamar('/protegida', { token: generarJWT('u1', 1) });
  assert(r.status === 401 || r.status === 403, 'ni con una sesión nueva: la cuenta está bloqueada');
  b = await botManager.panicStop('adm', 'x');
  assert(b.ok === false && usuarios[1].status === 'activo' && usuarios[1].tokenVersion === 0, 'a un administrador no se lo puede bloquear');
  b = await botManager.panicStop('no-existe', 'x');
  assert(b.ok === false, 'un usuario que no existe no da "ok"');
  b = await botManager.desbloquear('u1');
  assert(usuarios[0].status === 'activo' && usuarios[0].bloqueadoPor === null, 'desbloquear vuelve la cuenta a activa');
  assert(equipos[0].revocado === false && equipos[1].revocado === true, 'desbloquear devuelve solo los equipos que revocó el bloqueo, no el que el usuario había quitado');
  r = await llamar('/protegida', { token: generarJWT('u1', 1) });
  assert(r.status === 200, 'después de desbloquear, entra de nuevo con una sesión nueva');

  // ── #6: el cuerpo se limpia de operadores $ ──
  r = await llamar('/eco', { metodo: 'POST', cuerpo: { deviceId: { $ne: null }, ok: 'a', 'a.b': 1 } });
  assert(r.status === 200 && r.body.deviceId && !('$ne' in r.body.deviceId), 'el operador $ne del cuerpo se elimina (el cuerpo sí se limpia)');
  assert(r.body.ok === 'a' && r.body['a.b'] === 1, 'los datos normales y las claves con punto no se tocan');
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const iJson = fuente.indexOf("app.use(express.json({ limit: '10kb' }))");
  const iSan2 = fuente.indexOf('app.use(mongoSanitize({ allowDots: true }))');
  const iRutas = fuente.indexOf("app.use('/api/auth'");
  assert(iJson > 0 && iSan2 > iJson && iRutas > iSan2, 'en app.js la limpieza del cuerpo corre DESPUÉS de leerlo y ANTES de las rutas');

  server.close();
  console.log('✅ seguridad-sesion: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
