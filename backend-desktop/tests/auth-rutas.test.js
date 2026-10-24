// tests/auth-rutas.test.js — recorrido completo por HTTP del alta con verificación de email, el inicio de sesión y Google/Facebook.
// Se arma la app de Express de verdad (rutas + passport) con una base de mentira y el envío de mails capturado.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
process.env.GOOGLE_CLIENT_ID = 'x'; process.env.GOOGLE_CLIENT_SECRET = 'x'; process.env.GOOGLE_CALLBACK_URL = 'http://localhost/cb';
process.env.FACEBOOK_APP_ID = 'x'; process.env.FACEBOOK_APP_SECRET = 'x'; process.env.FACEBOOK_CALLBACK_URL = 'http://localhost/cb';

const path = require('path'); const Module = require('module'); const bcrypt = require('bcryptjs'); const http = require('http');
function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const inyectar = (rel, ex) => { const f = path.join(__dirname, '..', rel); Module._cache[f] = { id: f, filename: f, loaded: true, exports: ex, children: [], paths: [] }; };

// ── base de mentira ──
const usuarios = []; const mails = []; let ids = 0; const limites = new Map();
const cadena = (v) => { const p = Promise.resolve(v); p.select = () => p; p.lean = () => p; return p; };
const aplicar = (u, upd) => { for (const [k, v] of Object.entries(upd)) { if (k === '$unset') for (const c of Object.keys(v)) delete u[c]; else if (k === '$inc') for (const [c, n] of Object.entries(v)) u[c] = (u[c] || 0) + n; else u[k] = v; } };
function nuevo(d) {
  const u = { _id: 'u' + (++ids), tokenVersion: 0, status: 'activo', rol: 'user', loginCount: 0, ...d };
  if (u.password && !String(u.password).startsWith('$2')) u.password = bcrypt.hashSync(u.password, 4);
  Object.defineProperty(u, 'save', { enumerable: false, value: async () => { if (u.password && !String(u.password).startsWith('$2')) u.password = bcrypt.hashSync(u.password, 4); return u; } });
  Object.defineProperty(u, 'toJSON', { enumerable: false, value: () => { const { password, ...r } = u; return r; } });
  return u;
}
const User = {
  findOne: (q) => cadena(usuarios.find((u) => (q.email && u.email === q.email) || (q.codigoReferido && u.codigoReferido === q.codigoReferido) || (q._id && u._id === q._id)) || null),
  findById: (id) => cadena(usuarios.find((u) => u._id === id) || null),
  create: async (d) => { const u = nuevo(d); usuarios.push(u); return u; },
  generarCodigoUnico: async () => 'COD-' + (++ids),
  findByIdAndUpdate: (id, upd, op = {}) => { const u = usuarios.find((x) => x._id === id); if (!u) return cadena(null); const antes = { ...u }; aplicar(u, upd); return cadena(op.new ? u : antes); },
  findOneAndUpdate: (f, upd, op = {}) => { const u = usuarios.find((x) => x._id === f._id && (!f.verifIntentos || (x.verifIntentos || 0) < f.verifIntentos.$lt)); if (!u) return cadena(null); const antes = { ...u }; aplicar(u, upd); return cadena(op.new ? u : antes); },
  findByIdAndDelete: async (id) => { const i = usuarios.findIndex((x) => x._id === id); if (i >= 0) usuarios.splice(i, 1); },
};
inyectar('models/User.js', User);
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('models/Referido.js', { create: async () => {} });
inyectar('models/Limite.js', { async findOneAndUpdate(filtro, upd, op = {}) { const f = limites.get(filtro._id); if (filtro.expira && !(f && f.expira > filtro.expira.$gt)) return null; if (!f && !op.upsert) return null; const n = f ? { ...f } : { _id: filtro._id, n: 0 }; if (upd.$inc) n.n += upd.$inc.n; if (upd.$set) Object.assign(n, upd.$set); limites.set(filtro._id, n); return n; } });
inyectar('services/email.service.js', { enviarCodigoVerificacion: async (email, nombre, codigo) => { mails.push({ email, codigo }); return true; }, enviarRecuperoPassword: async () => true, enviarEmail: async () => true });

const express = require('express'); const passport = require('passport');
require('../config/passport')(passport);
const app = express(); app.use(express.json()); app.use(passport.initialize()); app.use('/api/auth', require('../routes/auth.routes'));
const S = require('../lib/seguridad-cuentas');

(async () => {
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const llamar = async (ruta, { metodo = 'POST', cuerpo, token } = {}) => { const r = await fetch(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }); let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ } return { status: r.status, body: j }; };
  const token = () => S.crearTokenFormulario(process.env.JWT_SECRET, Date.now() - 5000);
  const datos = (extra = {}) => ({ nombre: 'Ana', apellido: 'López', email: 'ana@negocio.com', password: 'Tr3s-gatos-azules', pais: 'Argentina', formToken: token(), ...extra });

  console.log('\n[auth-rutas] Tests:');

  // formulario
  let r = await llamar('/form-token', { metodo: 'GET' });
  assert(r.status === 200 && typeof r.body.token === 'string' && r.body.token.split('.').length === 3, 'el formulario recibe un token firmado');

  // alta: sin token / con token
  r = await llamar('/register', { cuerpo: datos({ formToken: undefined }) });
  assert(r.status === 400 && r.body.codigo === 'FORMULARIO_INVALIDO' && usuarios.length === 0, 'sin token de formulario no se crea la cuenta');
  r = await llamar('/register', { cuerpo: datos() });
  assert(r.status === 201 && r.body.requiereVerificacion === true && !r.body.token && !r.body.user, 'el alta responde "falta verificar" y no devuelve sesión ni usuario');
  assert(usuarios.length === 1 && usuarios[0].emailVerificado === false && mails.length === 1 && /^\d{6}$/.test(mails[0].codigo), 'la cuenta queda sin verificar y sale un código al mail');
  assert(!JSON.stringify(r.body).includes('password') && !String(usuarios[0].password).includes('Tr3s'), 'ni la respuesta ni la base contienen la contraseña en texto plano');

  // login antes de verificar
  r = await llamar('/login', { cuerpo: { email: 'ana@negocio.com', password: 'Tr3s-gatos-azules' } });
  assert(r.status === 403 && r.body.codigo === 'EMAIL_NO_VERIFICADO' && !r.body.token, 'con la contraseña correcta pero sin verificar el email, el login se rechaza (403) y pide el código');
  r = await llamar('/login', { cuerpo: { email: 'ana@negocio.com', password: 'otra-clave' } });
  assert(r.status === 401, 'con contraseña incorrecta sigue siendo 401');

  // una sesión pedida a mano no sirve sin verificar
  const jwt = require('jsonwebtoken'); const tokenSuelto = jwt.sign({ id: usuarios[0]._id, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  r = await llamar('/me', { metodo: 'GET', token: tokenSuelto });
  assert(r.status === 401, 'aunque alguien tenga un token firmado de esa cuenta, sin email verificado no entra');

  // código
  const codigo = mails[mails.length - 1].codigo; const mal = codigo === '000000' ? '111111' : '000000';
  r = await llamar('/verificar-email', { cuerpo: { email: 'ana@negocio.com', codigo: mal } });
  assert(r.status === 400 && r.body.codigo === 'CODIGO_INCORRECTO' && !r.body.token, 'un código incorrecto no da sesión');
  r = await llamar('/verificar-email', { cuerpo: { email: 'ana@negocio.com', codigo } });
  assert(r.status === 200 && r.body.token && r.body.user && r.body.user.email === 'ana@negocio.com' && !('password' in r.body.user), 'el código correcto verifica y entrega la sesión (sin datos secretos)');
  const sesion = r.body.token;
  r = await llamar('/me', { metodo: 'GET', token: sesion });
  assert(r.status === 200 && r.body.user.email === 'ana@negocio.com', 'con la sesión nueva entra a /me');
  r = await llamar('/login', { cuerpo: { email: 'ana@negocio.com', password: 'Tr3s-gatos-azules' } });
  assert(r.status === 200 && r.body.token, 'ya verificada, el login funciona');

  // validaciones por HTTP
  for (const [campo, valor] of [['nombre', '<img src=x onerror=alert(1)>'], ['password', 'Password1'], ['email', 'x@mailinator.com']]) {
    r = await llamar('/register', { cuerpo: datos({ [campo]: valor, email: campo === 'email' ? valor : 'otra@negocio.com' }) });
    assert(r.status === 400, `por HTTP se rechaza ${campo} = ${valor.slice(0, 22)}`);
  }
  r = await llamar('/register', { cuerpo: datos({ sitio_web: 'http://spam.com', email: 'bot@negocio.com' }) });
  assert(r.status === 201 && !usuarios.find((u) => u.email === 'bot@negocio.com'), 'el campo trampa finge éxito pero no crea la cuenta');
  r = await llamar('/login', { cuerpo: { email: { $gt: '' }, password: { $gt: '' } } });
  assert(r.status === 400, 'un login con objetos en lugar de texto (inyección NoSQL) se rechaza');
  r = await llamar('/login', { cuerpo: { email: 'ana@negocio.com', password: 'x'.repeat(5000) } });
  assert(r.status === 400, 'una contraseña de 5000 caracteres se rechaza');

  // Google: secuestro previo
  const google = passport._strategy('google')._verify; const facebook = passport._strategy('facebook')._verify;
  const entrar = (verify, perfil) => new Promise((res, rej) => verify('a', 'r', perfil, (e, u, i) => (e ? rej(e) : res({ u, i }))));
  const perfil = (email, extra = {}) => ({ id: 'g-' + email, emails: [{ value: email, verified: true }], name: { givenName: 'Víctor', familyName: 'Real' }, photos: [], _json: { email_verified: true }, ...extra });

  // el atacante registra el email de la víctima con SU contraseña y sin verificar
  limites.clear();   // (en la prueba todo sale de la misma IP: se reinician los contadores para no chocar con el tope por hora)
  r = await llamar('/register', { cuerpo: datos({ email: 'victima@gmail.com', password: 'Clave-del-atacante-9' }) });
  const cuentaAtacada = usuarios.find((u) => u.email === 'victima@gmail.com'); const tvAntes = cuentaAtacada.tokenVersion;
  assert(r.status === 201 && cuentaAtacada.emailVerificado === false, 'el atacante crea la cuenta con el email de otra persona (queda sin verificar)');
  const { u } = await entrar(google, perfil('victima@gmail.com'));
  assert(u && u._id === cuentaAtacada._id && !u.password && u.emailVerificado === true && u.tokenVersion === tvAntes + 1, 'cuando la víctima entra con Google: se borra la contraseña del atacante, se cierran las sesiones anteriores y la cuenta queda verificada');
  r = await llamar('/login', { cuerpo: { email: 'victima@gmail.com', password: 'Clave-del-atacante-9' } });
  assert(r.status === 401, 'la contraseña del atacante ya no sirve');
  // cuenta verificada por código: conserva su contraseña al vincular Google
  const ana = usuarios.find((x) => x.email === 'ana@negocio.com'); const hashAna = ana.password; const tvAna = ana.tokenVersion;
  const rg = await entrar(google, perfil('ana@negocio.com'));
  assert(rg.u && rg.u.password === hashAna && rg.u.tokenVersion === tvAna, 'una cuenta ya verificada por código conserva su contraseña y sus sesiones al vincular Google');
  // Google que no confirma el email
  const rn = await entrar(google, perfil('nuevo@gmail.com', { emails: [{ value: 'nuevo@gmail.com', verified: false }], _json: { email_verified: false } }));
  assert(!rn.u && !usuarios.find((x) => x.email === 'nuevo@gmail.com'), 'si Google no confirma el email, no se crea la cuenta');
  // cuenta nueva por Facebook / Google: nace verificada
  await entrar(facebook, { id: 'f1', emails: [{ value: 'fb@gmail.com' }], name: { givenName: 'Fabi' }, photos: [] });
  assert(usuarios.find((x) => x.email === 'fb@gmail.com')?.emailVerificado === true, 'una cuenta nueva creada con Facebook nace verificada');
  // cuenta anterior a la verificación (campo ausente) con Facebook
  usuarios.push(nuevo({ email: 'vieja@gmail.com', nombre: 'Vieja', password: 'Contra-vieja-1A', auth_provider: 'local' }));
  const vieja = usuarios.find((x) => x.email === 'vieja@gmail.com');
  const rf = await entrar(facebook, { id: 'f2', emails: [{ value: 'vieja@gmail.com' }], name: { givenName: 'Vieja' }, photos: [] });
  assert(rf.u && !rf.u.password && vieja.tokenVersion === 1, 'una cuenta anterior con contraseña nunca verificada: al entrar con Facebook también se borra la contraseña');

  server.close();
  console.log('\n✅ Todos los tests de las rutas de autenticación pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
