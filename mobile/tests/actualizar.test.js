// mobile/tests/actualizar.test.js — actualización automática del .apk: decisiones puras (src/actualizar.js) y comprobaciones de que el armado
// de GitHub, el aviso de la app y la configuración nativa están en su lugar.
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../src/actualizar');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[mobile/actualizar] Tests:');

// ── versión instalada ──
assert(JSON.stringify(A.versionInstalada({ version: '1.0.2', android: { versionCode: 130 }, extra: { firmaEstable: true } })) === JSON.stringify({ versionCode: 130, versionName: '1.0.2', firmaEstable: true }), 'lee la versión, el código interno y si está firmada con la clave fija');
assert(A.versionInstalada({ version: '1.0.0', android: { versionCode: 1 } }).firmaEstable === false && A.versionInstalada({ extra: { firmaEstable: 'true' } }).firmaEstable === false, 'si no dice que la firma es fija, se asume que NO lo es');
assert(A.versionInstalada(null).versionCode === 0 && A.versionInstalada(undefined).versionName === '' && A.versionInstalada({ android: { versionCode: 'x' } }).versionCode === 0, 'sin datos no rompe');

// ── decisión ──
const inst = { versionCode: 130, firmaEstable: true };
const nueva = { disponible: true, versionCode: 140, versionName: '1.0.3', firmaEstable: true, notas: 'Datos del negocio en el celular', sizeMB: 71.4, url: 'https://akiracloud.lat/api/desktop/download-android' };
let d = A.decidir({ instalada: inst, ultima: nueva, plataforma: 'android' });
assert(d.estado === 'actualizar' && d.versionName === '1.0.3' && d.url.startsWith('https://akiracloud.lat/'), 'versión más nueva y las dos con la clave fija → se actualiza encima');
assert(A.decidir({ instalada: inst, ultima: { ...nueva, versionCode: 130 }, plataforma: 'android' }).estado === 'al-dia' && A.decidir({ instalada: inst, ultima: { ...nueva, versionCode: 120 }, plataforma: 'android' }).estado === 'al-dia', 'la misma versión o una más vieja → al día (nunca ofrece bajar de versión)');
assert(A.decidir({ instalada: { versionCode: 130, firmaEstable: false }, ultima: nueva, plataforma: 'android' }).estado === 'reinstalar', 'instalada con clave de prueba → hay que desinstalar una vez (Android no deja instalar encima)');
assert(A.decidir({ instalada: inst, ultima: { ...nueva, firmaEstable: false }, plataforma: 'android' }).estado === 'reinstalar', 'si la nueva no tiene la clave fija tampoco se puede instalar encima');
assert(A.decidir({ instalada: inst, ultima: nueva, plataforma: 'ios' }).estado === 'no-aplica' && A.decidir({ instalada: inst, ultima: nueva, plataforma: 'web' }).estado === 'no-aplica', 'solo aplica en Android');
for (const rara of [null, undefined, {}, { disponible: false }, { disponible: true }, { disponible: true, versionCode: '140' }, { disponible: true, versionCode: 1.5 }]) {
  assert(A.decidir({ instalada: inst, ultima: rara, plataforma: 'android' }).estado === 'al-dia', `una respuesta rara del servidor (${JSON.stringify(rara)}) no molesta al usuario`);
}

// ── textos ──
let t = A.textoAviso(d);
assert(/versión nueva de Akira 1\.0\.3/.test(t.titulo) && /Datos del negocio en el celular\./.test(t.detalle) && /confirmar la instalación/.test(t.detalle) && /sesión se mantienen/.test(t.detalle) && t.boton === 'Actualizar ahora', 'aviso de actualización: dice cuál es, qué trae y qué va a pasar');
t = A.textoAviso({ estado: 'reinstalar', versionName: '1.0.3' });
assert(/desinstalá Akira/.test(t.detalle) && /se actualiza sola/.test(t.detalle) && /akiracloud\.lat\/descargar/.test(t.detalle) && t.boton === 'Abrir la descarga', 'aviso de reinstalación: explica que es una sola vez y a dónde ir');
assert(A.textoAviso({ estado: 'al-dia' }) === null && A.textoAviso(null) === null, 'sin novedades no hay aviso');
assert(!/[\u{1F300}-\u{1FAFF}]/u.test(JSON.stringify([A.textoAviso(d), A.ERRORES])), 'los textos no llevan emojis');

// ── frecuencia y descarga ──
const ahora = 10_000_000;
assert(A.tocaConsultar(0, ahora) && A.tocaConsultar(null, ahora) && !A.tocaConsultar(ahora - 60_000, ahora) && A.tocaConsultar(ahora - 31 * 60_000, ahora), 'se consulta al abrir y luego como mucho cada 30 minutos');
assert(A.descargaValida({ status: 200, size: 70 * 1048576 }) && !A.descargaValida({ status: 404, size: 70 * 1048576 }) && !A.descargaValida({ status: 200, size: 2000 }) && !A.descargaValida({ status: 200, size: NaN }), 'solo se instala un archivo que llegó completo (200) y con tamaño razonable (no una página de error)');
assert(Object.values(A.ERRORES).every((m) => m.length > 20 && /\.$/.test(m)), 'los mensajes de error son frases completas');

// ── cableado ──
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const aviso = leer('src', 'AvisoActualizacion.js');
assert(/android\.intent\.action\.VIEW/.test(aviso) && /application\/vnd\.android\.package-archive/.test(aviso) && /getContentUriAsync/.test(aviso), 'abre el instalador de Android con el .apk descargado');
assert(/Platform\.OS !== 'android'/.test(aviso) && /catch \{ \/\* sin conexión/.test(aviso), 'solo en Android, y si la consulta falla no muestra nada');
const app = leer('App.js');
assert((app.match(/<AvisoActualizacion \/>/g) || []).length === 2, 'el aviso está tanto en la pantalla de ingreso como dentro de la app (quien no puede entrar también se entera)');
assert(/leerUltimaVersionApp = \(\) => pedir\('\/mobile\/android', \{ conSesion: false \}\)/.test(leer('src', 'api.js')), 'consulta /mobile/android sin sesión');
const cfg = JSON.parse(leer('app.json')).expo;
assert(cfg.android.permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES'), 'app.json pide el permiso para abrir el instalador');
const pkg = JSON.parse(leer('package.json')).dependencies; const lock = JSON.parse(leer('package-lock.json')).packages;
assert(pkg['expo-file-system'] && pkg['expo-intent-launcher'] && lock['node_modules/expo-file-system'] && lock['node_modules/expo-intent-launcher'], 'las dos librerías están en package.json y en package-lock.json (el armado usa npm ci)');

// ── el armado de GitHub ──
const wf = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'android.yml'), 'utf8').replace(/\r\n/g, '\n');
assert(/CLAVE_B64: \$\{\{ secrets\.ANDROID_KEYSTORE_B64 \}\}/.test(wf) && /secrets\.ANDROID_KEYSTORE_PASSWORD/.test(wf) && /secrets\.ANDROID_KEY_ALIAS/.test(wf) && /secrets\.ANDROID_KEY_PASSWORD/.test(wf), 'el armado lee los 4 secretos de la clave fija');
assert(/if: env\.CLAVE_B64 != ''/.test(wf) && /apksigner" sign --ks "\$RUNNER_TEMP\/akira\.p12" --ks-type PKCS12/.test(wf), 'firma con la clave fija solo si está cargada');
assert(/rm -f "\$RUNNER_TEMP\/akira\.p12"/.test(wf) && !/echo "\$CLAVE_PASS|echo \$CLAVE_PASS|cat .*p12/.test(wf), 'borra la clave del servidor de armado y no imprime ninguna contraseña');
assert(/Number of signers: 1/.test(wf) && /package: name='lat\.akiracloud\.app'/.test(wf), 'después de firmar verifica que haya una sola firma y que sea el paquete de Akira');
assert(/versionCode: Number\(process\.env\.RUN\) \+ 100/.test(wf) && /firmaEstable: process\.env\.CLAVE_B64 !== ''/.test(wf), 'el versionCode sube solo con cada armado y se marca si la firma es la fija');
assert(wf.indexOf('gh release upload android-actual Akira-android.apk --clobber') > 0 && wf.indexOf('gh release upload android-actual Akira-android.apk --clobber') < wf.indexOf('gh release upload android-actual android-version.json --clobber'), 'sube a la release fija "android-actual" primero el .apk y después el archivo de versión');
assert(wf.indexOf('Fijar la versión interna') < wf.indexOf('Generar el proyecto Android') && wf.indexOf('Firmar con la clave fija') > wf.indexOf('Preparar el archivo') && wf.indexOf('Escribir android-version.json') > wf.indexOf('Firmar con la clave fija'), 'el orden de los pasos es el correcto (versión antes de generar, firma después de armar, versión json con el .apk final)');
const gi = fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf8');
assert(/^\*\.p12$/m.test(gi) && /^\*\.jks$/m.test(gi) && /^LEEME-SECRETOS\.txt$/m.test(gi), '.gitignore impide subir claves de firma por error');
console.log('✅ mobile/actualizar: OK');
