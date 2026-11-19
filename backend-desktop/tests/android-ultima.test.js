// tests/android-ultima.test.js — la app de Android se entera sola de que hay una versión nueva: GET /api/mobile/android.
// La versión sale del android-version.json que deja el armado de GitHub en una release de nombre fijo; acá se valida, se guarda en memoria
// 10 minutos y, si GitHub no responde, se sigue con lo último que se supo. Sin salir a internet.
'use strict';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
process.env.JWT_SECRET = 'x'.repeat(40);
const { assert, inyectar, logCapturado } = require('./_ayuda');
inyectar('config/logger.js', logCapturado());
inyectar('models/Device.js', {});
inyectar('models/MobileDevice.js', {});
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('middleware/auth.js', { requireAuth: (_q, _r, n) => n(), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
inyectar('lib/limite.js', { consumir: async () => ({ ok: true }), consumirTodos: async () => ({ ok: true }), mensajeEspera: String });

const AU = require('../lib/android-ultima');
const mobile = require('../routes/mobile.routes');

const BUENO = { versionCode: 125, versionName: '1.0.3', sha256: 'A'.repeat(64), sizeMB: 71.46, notas: 'Agenda, caja,\nclientes y catálogo en el celular', firmaEstable: true, otraCosa: 'x' };

(async () => {
  console.log('\n[android-ultima] Tests:');

  // ── validación del android-version.json ──
  const v = AU.normalizarVersion(BUENO);
  assert(v.versionCode === 125 && v.versionName === '1.0.3' && v.sha256 === 'a'.repeat(64) && v.sizeMB === 71.5 && v.firmaEstable === true && v.notas === 'Agenda, caja, clientes y catálogo en el celular', 'acepta una versión completa y limpia los textos');
  assert(!('otraCosa' in v) && v.urlApk === AU.URL_APK, 'descarta lo que no está en la lista y la dirección del .apk sale del código, no del archivo');
  for (const malo of [null, 'x', [1], {}, { ...BUENO, versionCode: 0 }, { ...BUENO, versionCode: 1.5 }, { ...BUENO, versionCode: 'abc' }, { ...BUENO, versionCode: 3e9 }, { ...BUENO, versionName: '1.0.3<script>' }, { ...BUENO, versionName: '' }]) {
    assert(AU.normalizarVersion(malo) === null, `se rechaza ${JSON.stringify(malo)?.slice(0, 60)}`);
  }
  assert(AU.normalizarVersion({ ...BUENO, sha256: 'zz', sizeMB: -4, firmaEstable: 'si' }).sha256 === null && AU.normalizarVersion({ ...BUENO, sizeMB: -4 }).sizeMB === null && AU.normalizarVersion({ ...BUENO, firmaEstable: 'si' }).firmaEstable === false, 'sha256 mal formado, tamaño absurdo o firmaEstable que no es true: se ignoran (nunca se asume firma estable)');
  assert(AU.URL_APK.startsWith('https://github.com/ArrayagoM/akira-cloud/releases/download/android-actual/') && AU.URL_VERSION.endsWith('android-version.json'), 'las direcciones son fijas y del repositorio oficial');

  // ── consulta con memoria ──
  let t = 1_000_000; let llamadas = 0; let respuesta = { ok: true, json: async () => BUENO };
  const consulta = AU.crearConsulta({ fetchFn: async () => { llamadas++; if (respuesta === 'caido') throw new Error('sin red'); return respuesta; }, ahora: () => t });
  let r = await consulta();
  assert(r.versionCode === 125 && llamadas === 1, 'la primera consulta trae la versión');
  await consulta(); await consulta();
  assert(llamadas === 1, 'durante 10 minutos responde de memoria (no vuelve a consultar GitHub)');
  t += 11 * 60 * 1000; respuesta = { ok: true, json: async () => ({ ...BUENO, versionCode: 126 }) };
  r = await consulta();
  assert(r.versionCode === 126 && llamadas === 2, 'pasados 10 minutos consulta de nuevo y toma la versión nueva');
  t += 11 * 60 * 1000; respuesta = 'caido';
  r = await consulta();
  assert(r.versionCode === 126, 'si GitHub no responde, sigue con lo último que se supo');
  t += 25 * 3600 * 1000;
  assert(await consulta() === null, 'pasado un día sin poder consultar, no afirma nada');
  respuesta = { ok: false, json: async () => ({}) }; assert(await consulta() === null, 'una respuesta con error de GitHub no se toma como versión');
  respuesta = { ok: true, json: async () => ({ versionCode: 'roto' }) }; assert(await consulta() === null, 'un archivo roto tampoco');
  respuesta = { ok: true, json: async () => { throw new Error('no es json'); } }; assert(await consulta() === null, 'ni uno que no sea JSON');
  let simultaneas = 0; const c2 = AU.crearConsulta({ fetchFn: async () => { simultaneas++; await new Promise((x) => setTimeout(x, 20)); return { ok: true, json: async () => BUENO }; } });
  await Promise.all([c2(), c2(), c2()]);
  assert(simultaneas === 1, 'varias consultas a la vez comparten una sola salida a internet');

  // ── la ruta de la app ──
  async function llamar() {
    const capa = mobile.stack.find((l) => l.route && l.route.path === '/android' && l.route.methods.get);
    let json = null; const cab = {};
    await capa.route.stack[0].handle({}, { set(k, x) { cab[k] = x; return this; }, json(j) { json = j; return this; } });
    return { json, cab };
  }
  AU.fijarConsulta(async () => AU.normalizarVersion(BUENO));
  let x = await llamar();
  assert(x.json.disponible === true && x.json.versionCode === 125 && x.json.versionName === '1.0.3' && x.json.firmaEstable === true && x.json.url === 'https://akiracloud.lat/api/desktop/download-android', 'GET /api/mobile/android devuelve la última versión y la dirección de descarga de nuestro dominio');
  assert(!/github\.com/.test(JSON.stringify(x.json)), 'la respuesta no expone la dirección de GitHub (la app descarga siempre desde nuestro dominio)');
  assert(x.cab['Cache-Control'] === 'public, max-age=300', 'se puede guardar 5 minutos en caché');
  AU.fijarConsulta(async () => null);
  x = await llamar();
  assert(x.json.disponible === false && Object.keys(x.json).length === 1, 'sin versión conocida responde disponible:false y nada más');
  AU.fijarConsulta(async () => { throw new Error('inesperado'); });
  x = await llamar();
  assert(x.json.disponible === false, 'si algo falla por dentro, la app recibe disponible:false (nunca un error)');

  console.log('✅ android-ultima: OK');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
