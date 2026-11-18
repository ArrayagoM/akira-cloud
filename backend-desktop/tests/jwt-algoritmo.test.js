// tests/jwt-algoritmo.test.js — los tokens se firman siempre con HS256 (jwt.sign sin opción de algoritmo) y por eso se verifican SOLO con HS256:
// un token con alg=none o firmado con otro algoritmo (HS384/HS512) no pasa en la sesión, en la licencia ni en los enlaces firmados.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
process.env.LICENSE_JWT_SECRET = 'otro-secreto-de-licencia-largo-largo-456';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { assert, inyectar, logCapturado, limiteFalso, servir, consulta } = require('./_ayuda');

inyectar('config/logger.js', logCapturado());
const usuario = { _id: 'u1', status: 'activo', emailVerificado: true, tokenVersion: 0, rol: 'user' };
const bajas = [];
inyectar('models/User.js', { findById: (id) => consulta(id === 'u1' ? usuario : null), findByIdAndUpdate: async (id, upd) => { bajas.push({ id, upd }); return {}; }, findOne: () => consulta(null) });
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('models/Referido.js', {});
inyectar('models/OAuthCode.js', {});
inyectar('models/Limite.js', limiteFalso());
inyectar('services/email.service.js', {});
require('../config/passport')(passport);
const { generarJWT } = require('../middleware/auth');
const express = require('express');
const LS = require('../services/license.service');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sinFirma = (payload) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;

(async () => {
  console.log('\n[jwt-algoritmo] Tests:');

  // ── sesión (passport-jwt) ──
  const app = express();
  app.use(passport.initialize());
  app.get('/yo', (req, res, next) => passport.authenticate('jwt', { session: false }, (err, u, info) => res.status(u ? 200 : 401).json({ ok: !!u, motivo: info && info.message }))(req, res, next));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const yo = async (token) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/yo`, { headers: { Authorization: 'Bearer ' + token } }); return r.status; };
  const payload = { id: 'u1', tv: 0 };

  assert(await yo(generarJWT('u1', 0)) === 200, 'sesión: el token de siempre (generarJWT, HS256) sigue pasando');
  assert(await yo(jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })) === 200, 'sesión: jwt.sign sin opción de algoritmo (como firma todo el sistema) es HS256 y pasa');
  assert(await yo(jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS512', expiresIn: '1h' })) === 401, 'sesión: un token HS512 firmado con el mismo secreto NO pasa');
  assert(await yo(jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS384', expiresIn: '1h' })) === 401, 'sesión: un token HS384 NO pasa');
  assert(await yo(sinFirma({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 })) === 401, 'sesión: un token alg=none (sin firma) NO pasa');
  assert(await yo(jwt.sign(payload, 'otro-secreto-cualquiera-largo-largo', { expiresIn: '1h' })) === 401, 'sesión: un token HS256 con otro secreto NO pasa');
  assert(await yo(jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '-1h' })) === 401, 'sesión: un token vencido NO pasa');
  server.close();

  // ── licencia ──
  const lic = LS.generarLicenseToken({ userId: 'u1', deviceId: 'd1', plan: 'pro', features: {}, slotsMax: 1 });
  assert(LS.verificarLicenseToken(lic).sub === 'u1', 'licencia: el token de licencia firmado por el sistema (HS256) se verifica');
  const lic512 = jwt.sign({ sub: 'u1', deviceId: 'd1' }, process.env.LICENSE_JWT_SECRET, { algorithm: 'HS512', expiresIn: '1h' });
  let lanzo = false; try { LS.verificarLicenseToken(lic512); } catch { lanzo = true; }
  assert(lanzo, 'licencia: un token HS512 con el secreto de licencia NO se acepta');
  lanzo = false; try { LS.verificarLicenseToken(sinFirma({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })); } catch { lanzo = true; }
  assert(lanzo, 'licencia: un token alg=none NO se acepta');

  // ── enlace de baja de novedades (auth.routes) ──
  const auth = await servir('/api/auth', require('../routes/auth.routes'), { json: true });
  const baja = (t) => auth.llamar('/baja-novedades?t=' + encodeURIComponent(t));
  const emailTok = jwt.sign({ id: 'u1', p: 'baja-novedades' }, process.env.JWT_SECRET); // igual al que firma services/email.novedades.js
  let r = await baja(emailTok);
  assert(r.status === 200 && bajas.length === 1 && bajas[0].upd.novedadesActivas === false, 'baja de novedades: el enlace que mandan los emails (HS256) sigue funcionando');
  r = await baja(jwt.sign({ id: 'u1', p: 'baja-novedades' }, process.env.JWT_SECRET, { algorithm: 'HS512' }));
  assert(r.status === 400 && bajas.length === 1, 'baja de novedades: un enlace firmado con HS512 se rechaza y no cambia nada');
  r = await baja(sinFirma({ id: 'u1', p: 'baja-novedades' }));
  assert(r.status === 400 && bajas.length === 1, 'baja de novedades: un enlace alg=none se rechaza y no cambia nada');
  await auth.cerrar();

  // ── todos los puntos de firma/verificación del código están cubiertos (revisión estática) ──
  const raiz = path.join(__dirname, '..');
  const archivos = []; (function recorrer(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', 'tests'].includes(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? recorrer(p) : /\.js$/.test(e.name) && archivos.push(p); } })(raiz);
  const firmas = []; const verificaciones = [];
  for (const f of archivos) {
    const src = fs.readFileSync(f, 'utf8');
    if (/algorithm\s*:/.test(src.replace(/algorithms\s*:/g, ''))) firmas.push(path.relative(raiz, f) + ' firma con otro algoritmo');
    for (const m of src.matchAll(/\.verify\(([^;]*?)\);?/g)) if (/jwt|jsonwebtoken/i.test(src) && /JWT_SECRET|secret/i.test(m[1]) && !/algorithms/.test(m[1])) verificaciones.push(path.relative(raiz, f) + ': ' + m[0].slice(0, 80));
  }
  assert(firmas.length === 0, 'ningún archivo del backend firma con un algoritmo distinto de HS256 (' + (firmas.join(', ') || 'ninguno') + ')');
  assert(verificaciones.length === 0, 'todo jwt.verify del backend fija algorithms: ' + (verificaciones.join(' | ') || 'ninguno sin fijar'));

  console.log('\n✅ Todos los tests de algoritmo de JWT pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
