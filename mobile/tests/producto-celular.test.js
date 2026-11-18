// mobile/tests/producto-celular.test.js — pantalla "Productos" de la app del celular: cámara, linterna, errores y borrador (frontend/src/lib/productoCelular.js).
// Lógica sin pantalla: la cámara se simula con objetos de mentira. Se corre solo (`node tests/producto-celular.test.js`) o junto con estado.test.js (`npm test`).
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const conGlobales = async (g, fn) => {
  const antes = {};
  for (const k of Object.keys(g)) { antes[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: g[k], configurable: true, writable: true }); }
  try { return await fn(); } finally { for (const k of Object.keys(g)) { if (antes[k]) Object.defineProperty(globalThis, k, antes[k]); else delete globalThis[k]; } }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n[mobile/producto-celular] Tests:');
  const P = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/lib/productoCelular.js')).href);

  // ── errores de la cámara: se distingue "no se pudo descargar el lector" de "no pude abrir la cámara (permiso)" ──
  const lector = Object.assign(new Error('x'), { name: 'LectorNoDescargado' });
  const permiso = Object.assign(new Error('x'), { name: 'NotAllowedError' });
  assert(P.clasificarErrorCamara(lector) === 'lector' && P.clasificarErrorCamara(permiso) === 'permiso', 'se clasifican el lector sin descargar y el permiso denegado');
  assert(/descargar el lector/.test(P.mensajeDeCamara(lector)) && /conexión/.test(P.mensajeDeCamara(lector)) && !/permiso/.test(P.mensajeDeCamara(lector)), 'lector sin descargar: pide revisar la conexión y no habla de permisos');
  assert(/No pude abrir la cámara/.test(P.mensajeDeCamara(permiso)) && /permiso/.test(P.mensajeDeCamara(permiso)) && /denegado/.test(P.mensajeDeCamara(permiso)) && !/conexión/.test(P.mensajeDeCamara(permiso)), 'permiso denegado: "no pude abrir la cámara", dice que es el permiso y no habla de conexión');
  assert(P.mensajeDeCamara(lector) !== P.mensajeDeCamara(permiso), 'los dos mensajes son distintos');
  assert(P.clasificarErrorCamara({ name: 'SecurityError' }) === 'permiso' && P.clasificarErrorCamara({ name: 'NotFoundError' }) === 'sin-camara' && P.clasificarErrorCamara(new Error('sin-camara')) === 'sin-camara' && P.clasificarErrorCamara({ name: 'NotReadableError' }) === 'en-uso' && P.clasificarErrorCamara(new Error('otra')) === 'camara' && P.clasificarErrorCamara(null) === 'camara', 'el resto de los errores también se clasifican');
  assert(/otra app/.test(P.mensajeDeCamara({ name: 'NotReadableError' })) && /a mano/.test(P.mensajeDeCamara(null)), 'cámara en uso y error desconocido: mensajes útiles y con la salida manual');
  assert(['lector', 'permiso', 'sin-camara', 'en-uso', 'camara'].every((m, i, a) => a.every((n, j) => i === j || P.mensajeDeCamara({ name: { lector: 'LectorNoDescargado', permiso: 'NotAllowedError', 'sin-camara': 'NotFoundError', 'en-uso': 'NotReadableError', camara: 'Otro' }[m] }) !== P.mensajeDeCamara({ name: { lector: 'LectorNoDescargado', permiso: 'NotAllowedError', 'sin-camara': 'NotFoundError', 'en-uso': 'NotReadableError', camara: 'Otro' }[n] }))), 'cada motivo tiene su propio texto');

  // ── resolución y cámara trasera ──
  const R = P.RESTRICCIONES_CAMARA;
  assert(R.video.width.ideal === 1280 && R.video.facingMode.ideal === 'environment' && R.audio === false, 'se pide cámara trasera con ancho ideal de 1280 y sin audio');
  assert(R.video.width.exact === undefined && R.video.facingMode.exact === undefined, 'son valores "ideales", no exactos: no falla en celulares sin esa resolución');

  // ── linterna ──
  const pista = (caps) => ({ calls: [], getCapabilities() { return caps; }, async applyConstraints(c) { this.calls.push(c); } });
  assert(P.soportaLinterna(pista({ torch: true })) === true && P.soportaLinterna(pista({})) === false && P.soportaLinterna({}) === false && P.soportaLinterna(null) === false && P.soportaLinterna({ getCapabilities() { throw new Error('x'); } }) === false, 'la linterna se ofrece solo si la pista dice que la soporta');
  const t1 = pista({ torch: true });
  await P.aplicarLinterna(t1, true); await P.aplicarLinterna(t1, false);
  assert(JSON.stringify(t1.calls) === JSON.stringify([{ advanced: [{ torch: true }] }, { advanced: [{ torch: false }] }]), 'encender y apagar manda la restricción torch a la cámara');
  let fallo = false; try { await P.aplicarLinterna(pista({}), true); } catch { fallo = true; }
  assert(fallo, 'sin soporte, intentar encenderla tira error (la pantalla lo avisa)');

  // ── iniciarEscaner con una cámara simulada (lector del sistema, tipo Chrome en Android) ──
  const track = pista({ torch: true });
  const stream = { getVideoTracks: () => [track], getTracks: () => [track], paradas: 0 };
  track.stop = () => { stream.paradas++; };
  let pedidas = null;
  const nav = { mediaDevices: { getUserMedia: async (c) => { pedidas = c; return stream; } } };
  class Detector { static async getSupportedFormats() { return ['ean_13', 'qr_code']; } async detect() { return [{ rawValue: '7790070411111' }]; } }
  const video = { srcObject: null, async play() {} };
  await conGlobales({ navigator: nav, window: { BarcodeDetector: Detector } }, async () => {
    let leido = null; let listo = null; let error = null;
    const detener = await P.iniciarEscaner(video, (c) => { leido = c; }, (m) => { error = m; }, (l) => { listo = l; });
    await esperar(30);
    assert(pedidas.video.width.ideal === 1280 && pedidas.video.facingMode.ideal === 'environment', 'la cámara se pidió con 1280 de ancho ideal y trasera');
    assert(listo && listo.linterna === true && typeof listo.alternarLinterna === 'function', 'al estar lista avisa que hay linterna');
    await listo.alternarLinterna(true);
    assert(track.calls.length === 1 && track.calls[0].advanced[0].torch === true, 'el botón de linterna prende la linterna de la pista');
    assert(leido === '7790070411111' && error === null, 'sigue leyendo el código igual que antes');
    assert(stream.paradas === 1 && typeof detener === 'function', 'al leer el código apaga la cámara');
  });

  // sin linterna (iPhone): avisa linterna=false y no ofrece el botón
  const pistaSin = pista({}); const streamSin = { getVideoTracks: () => [pistaSin], getTracks: () => [pistaSin] }; pistaSin.stop = () => {};
  await conGlobales({ navigator: { mediaDevices: { getUserMedia: async () => streamSin } }, window: { BarcodeDetector: Detector } }, async () => {
    let listo = null;
    await P.iniciarEscaner({ srcObject: null, async play() {} }, () => {}, () => {}, (l) => { listo = l; });
    assert(listo && listo.linterna === false, 'sin soporte de linterna: no se ofrece');
  });

  // permiso denegado y sin cámara: el mensaje y el motivo llegan a la pantalla
  await conGlobales({ navigator: { mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } }, window: { BarcodeDetector: Detector } }, async () => {
    let m = null; let motivo = null;
    await P.iniciarEscaner({ srcObject: null, async play() {} }, () => {}, (mm, mo) => { m = mm; motivo = mo; });
    assert(motivo === 'permiso' && /permiso/.test(m) && /No pude abrir la cámara/.test(m), 'permiso denegado: llega el mensaje de permiso y el motivo "permiso"');
  });
  await conGlobales({ navigator: {}, window: {} }, async () => {
    let motivo = null;
    await P.iniciarEscaner({ srcObject: null }, () => {}, (mm, mo) => { motivo = mo; });
    assert(motivo === 'sin-camara', 'navegador sin cámara: motivo "sin-camara"');
  });

  // ── borrador del formulario ──
  const AHORA = Date.UTC(2026, 10, 17, 15, 0, 0);
  const lleno = { nombre: 'Yerba 500 g', precio: '2500', categoria: 'Almacén', stock: '', descripcion: '', codigo: '7790070411111' };
  const b = P.armarBorrador(lleno, AHORA);
  assert(b && b.v === 1 && b.en === AHORA && b.form.nombre === 'Yerba 500 g' && b.form.precio === '2500' && b.form.codigo === '7790070411111', 'el borrador guarda nombre, precio y código');
  assert(!('foto' in b) && !('foto' in b.form) && !/base64|data:image/.test(JSON.stringify(b)), 'el borrador no lleva la foto');
  assert(P.armarBorrador({ nombre: '', precio: '', categoria: 'Almacén', stock: '', descripcion: '', codigo: '' }, AHORA) === null && P.armarBorrador({ nombre: '   ', precio: '' }, AHORA) === null && P.armarBorrador(null, AHORA) === null, 'sin nada escrito (o solo la categoría) no hay borrador');
  assert(P.armarBorrador({ codigo: '123' }, AHORA).form.codigo === '123', 'con solo el código escaneado ya hay borrador');
  assert(P.armarBorrador({ nombre: 'x'.repeat(500) }, AHORA).form.nombre.length === 120 && P.armarBorrador({ descripcion: 'y'.repeat(900) }, AHORA).form.descripcion.length === 500, 'se respetan los largos máximos del formulario');
  const ida = P.leerBorrador(JSON.stringify(b), AHORA + 60000);
  assert(ida && ida.form.nombre === 'Yerba 500 g' && ida.form.precio === '2500' && ida.form.codigo === '7790070411111' && ida.en === AHORA, 'se recupera lo guardado (ida y vuelta)');
  assert(P.leerBorrador(JSON.stringify(b), AHORA + 8 * 24 * 3600 * 1000) === null && P.leerBorrador(JSON.stringify(b), AHORA + 6 * 24 * 3600 * 1000) !== null, 'un borrador de más de 7 días se descarta');
  assert(P.leerBorrador('no es json', AHORA) === null && P.leerBorrador(null, AHORA) === null && P.leerBorrador(JSON.stringify({ v: 2, en: AHORA, form: lleno }), AHORA) === null && P.leerBorrador(JSON.stringify({ v: 1, en: 'x', form: lleno }), AHORA) === null && P.leerBorrador(JSON.stringify({ v: 1, en: AHORA, form: 'x' }), AHORA) === null, 'datos rotos o de otra versión se ignoran');
  assert(P.leerBorrador(JSON.stringify({ v: 1, en: AHORA, form: { nombre: 5, precio: { a: 1 }, extra: 'hack' } }), AHORA).form.nombre === '5' && !('extra' in P.leerBorrador(JSON.stringify({ v: 1, en: AHORA, form: { nombre: 'a', extra: 'hack' } }), AHORA).form), 'al recuperar solo se aceptan los campos del formulario, como texto');
  assert(P.leerBorrador(JSON.stringify({ v: 1, en: AHORA + 3600000, form: lleno }), AHORA) === null, 'un borrador con fecha del futuro se ignora');
  assert(P.CLAVE_BORRADOR === 'akira.celular.borradorProducto', 'clave del borrador');

  console.log('\n✅ mobile/producto-celular OK\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
