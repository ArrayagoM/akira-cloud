// mobile/tests/google.test.js — ingreso con Google en la app de Android: piezas puras (lógica sin pantalla, corre con Node).
// Además comprueba que el esquema akira:// esté declarado y que el botón y el plugin estén en su lugar.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REDIRECCION, verificadorDe, urlInicio, codigoDe, urlCanje } = require('../src/google');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[mobile/google] Tests:');

const bytes = crypto.randomBytes(32);
const ver = verificadorDe(bytes);
assert(/^[a-f0-9]{64}$/.test(ver) && ver === bytes.toString('hex'), 'el verificador son 32 bytes al azar en hexadecimal (64 caracteres)');
assert(verificadorDe(new Uint8Array([255, 0, 16, ...new Array(29).fill(1)])).startsWith('ff0010'), 'cada byte ocupa dos caracteres (sin perder ceros a la izquierda)');
let corto = false; try { verificadorDe(new Uint8Array(8)); } catch { corto = true; }
assert(corto, 'con pocos bytes al azar se niega a generar el verificador (no se usa uno débil)');

const desafio = crypto.createHash('sha256').update(ver).digest('hex');
const u = urlInicio('https://akira-licencias.vercel.app/api/', desafio);
assert(u === `https://akira-licencias.vercel.app/api/auth/google?mobile_challenge=${desafio}`, 'la dirección de inicio apunta a /api/auth/google con el desafío (sin barras dobles)');
let malo = false; try { urlInicio('https://x/api', 'no-es-hexa'); } catch { malo = true; }
assert(malo, 'un desafío que no es sha256 en hexadecimal no se manda');

assert(REDIRECCION === 'akira://oauth', 'la app vuelve por akira://oauth');
const cod = 'a'.repeat(64);
assert(codigoDe(`akira://oauth?code=${cod}`) === cod, 'lee el código de la vuelta');
assert(codigoDe(`akira://oauth/?foo=1&code=${cod}&x=2`) === cod, 'lo lee aunque haya otros parámetros o una barra');
assert(codigoDe(`akira://oauth?code=${cod}#fragmento`) === cod, 'lo lee antes de un fragmento');
assert(codigoDe('akira://oauth') === null && codigoDe('akira://oauth?error=access_denied') === null && codigoDe('') === null && codigoDe(null) === null, 'sin código (cancelado o con error) devuelve null');
assert(codigoDe(`https://akiracloud.lat/oauth-callback?code=${cod}`) === null && codigoDe(`akira://otra?code=${cod}`) === null, 'solo acepta la vuelta de akira://oauth, no otra dirección');
assert(codigoDe('akira://oauth?code=<script>') === null && codigoDe('akira://oauth?code=../../x') === null, 'un código con caracteres raros se rechaza');
assert(urlCanje(cod, ver) === `/auth/oauth-token?code=${cod}&verifier=${ver}`, 'el canje manda el código y el verificador');

// ── la configuración y la pantalla (comprobación de código) ──
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const app = JSON.parse(leer('app.json')).expo;
assert(app.scheme === 'akira', 'el esquema "akira" está declarado (Android lo registra solo para volver a la app)');
assert(app.plugins.includes('expo-web-browser'), 'el plugin del navegador integrado está en app.json');
const pkg = JSON.parse(leer('package.json')).dependencies;
assert(pkg['expo-web-browser'] && pkg['expo-crypto'], 'las dos librerías están en package.json');
const lock = JSON.parse(leer('package-lock.json')).packages;
assert(lock['node_modules/expo-web-browser'] && lock['node_modules/expo-crypto'], 'y también en package-lock.json (el armado usa npm ci: si faltaran, falla)');
const login = leer('src', 'pantallas', 'Login.js');
assert(/titulo="Continuar con Google"/.test(login) && /iniciarConGoogle/.test(login), 'la pantalla de ingreso tiene el botón "Continuar con Google"');
assert(/Esta cuenta entra con Google/.test(login) && /OAuth/.test(login), 'si la cuenta es de Google y prueba con contraseña, le dice que toque el botón de Google (no "contraseña incorrecta")');
assert(!/Creá una contraseña desde/.test(login), 'ya no pide crear una contraseña para entrar con Google');
const api = leer('src', 'api.js');
assert(/openAuthSessionAsync\(urlInicio\(URL_BASE, desafio\), REDIRECCION\)/.test(api) && /sha256|SHA256/i.test(api), 'api.js abre el navegador con el desafío SHA-256 y espera la vuelta a akira://oauth');
console.log('✅ mobile/google: OK');
