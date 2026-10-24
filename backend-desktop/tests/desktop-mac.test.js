// tests/desktop-mac.test.js — enlaces de descarga: Windows sigue igual y Mac solo aparece si está subido.
'use strict';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
const router = require('../routes/desktop.routes');
function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
async function llamar(ruta, query = {}) {
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods.get);
  let status = 200; let json = null; let redirigido = null;
  const res = { set() { return this; }, status(s) { status = s; return this; }, json(j) { json = j; return this; }, redirect(c, u) { status = c; redirigido = u; return this; } };
  await capa.route.stack[0].handle({ query, headers: {}, method: 'GET' }, res); // los handlers de descarga cuentan antes de redirigir
  return { status, json, redirigido };
}
(async () => {
['DESKTOP_DOWNLOAD_URL', 'DESKTOP_MAC_ARM64_URL', 'DESKTOP_MAC_X64_URL', 'DESKTOP_MAC_SIZE_MB'].forEach((k) => delete process.env[k]);
console.log('\n[desktop-mac] Tests:');
let r = (await llamar('/latest'));
assert(r.json.disponible === false && r.json.mac.disponible === false && r.json.mac.arm64 === null && r.json.mac.x64 === null, 'sin nada subido, ni Windows ni Mac figuran como disponibles');
assert((await llamar('/download-mac', { arch: 'arm64' })).status === 404, 'pedir el Mac sin archivo → 404 claro');
process.env.DESKTOP_DOWNLOAD_URL = 'https://blob.example/AkiraCloud.exe';
r = (await llamar('/latest'));
assert(r.json.disponible === true && r.json.url === 'https://akiracloud.lat/api/desktop/download' && r.json.plataforma === 'windows' && r.json.mac.disponible === false, 'Windows sigue igual y Mac sigue sin figurar');
process.env.DESKTOP_MAC_ARM64_URL = 'https://blob.example/AkiraCloud-mac-arm64.dmg';
process.env.DESKTOP_MAC_SIZE_MB = '120';
r = (await llamar('/latest'));
assert(r.json.mac.disponible === true && r.json.mac.arm64.endsWith('arch=arm64') && r.json.mac.x64 === null && r.json.mac.sizeMB === 120, 'con solo el archivo de Apple Silicon, ofrece solo ese');
process.env.DESKTOP_MAC_X64_URL = 'http://inseguro/x.dmg';
assert((await llamar('/latest')).json.mac.x64 === null, 'una URL que no es https se ignora');
process.env.DESKTOP_MAC_X64_URL = 'https://blob.example/AkiraCloud-mac-x64.dmg?v=1';
assert((await llamar('/latest')).json.mac.x64 !== null, 'el archivo para Mac Intel aparece cuando se sube');
let d = (await llamar('/download-mac', { arch: 'x64' }));
assert(d.status === 302 && d.redirigido === 'https://blob.example/AkiraCloud-mac-x64.dmg?v=1&download=1', 'la descarga Intel redirige al archivo');
d = (await llamar('/download-mac', { arch: 'cualquiera' }));
assert(d.status === 302 && d.redirigido.includes('arm64'), 'un chip desconocido cae en Apple Silicon');
// ── Android ──
delete process.env.DESKTOP_ANDROID_URL; delete process.env.DESKTOP_ANDROID_SIZE_MB;
let a = (await llamar('/latest'));
assert(a.json.android.disponible === false && a.json.android.url === null, 'sin .apk subido, Android no figura como disponible');
assert((await llamar('/download-android')).status === 404, 'pedir el .apk sin archivo → 404 claro');
process.env.DESKTOP_ANDROID_URL = 'http://inseguro/akira.apk';
assert((await llamar('/latest')).json.android.disponible === false, 'una URL que no es https se ignora');
process.env.DESKTOP_ANDROID_URL = 'https://github.com/x/y/releases/download/android-prueba-1/Akira-android.apk';
process.env.DESKTOP_ANDROID_SIZE_MB = '60';
a = (await llamar('/latest'));
assert(a.json.android.disponible === true && a.json.android.url === 'https://akiracloud.lat/api/desktop/download-android' && a.json.android.sizeMB === 60, 'con el .apk subido, ofrece el enlace de nuestro dominio y el tamaño');
assert(a.json.mac.disponible === true && a.json.plataforma === 'windows', 'Windows y Mac siguen igual');
d = (await llamar('/download-android'));
assert(d.status === 302 && d.redirigido === process.env.DESKTOP_ANDROID_URL, 'la descarga redirige al archivo');
console.log('\n✅ Todos los tests de descarga (Mac y Android) pasaron.\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
