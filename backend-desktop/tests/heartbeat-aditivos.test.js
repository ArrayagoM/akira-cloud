// tests/heartbeat-aditivos.test.js — datos opcionales del escritorio en el latido (ultimoError, cabeceras x-akira-version / x-akira-canal) y
// versionMinima / versionRecomendada (variables de entorno) en el latido y en /api/desktop/latest. Todo aditivo: sin estos datos, o con basura,
// el latido responde igual que antes y nunca falla.
'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);
delete process.env.DESKTOP_VERSION_MINIMA; delete process.env.DESKTOP_VERSION_RECOMENDADA;
const { assert, inyectar } = require('./_ayuda');

class FakeDevice {
  constructor(d) { Object.assign(this, { activo: true, revocado: false, ultimoHeartbeat: new Date(0), version: '', canal: null, ...d }); }
  async save() { this.guardado = (this.guardado || 0) + 1; return this; }
}
let dispositivo;
FakeDevice.findOne = () => Promise.resolve(dispositivo);
inyectar('models/Device.js', FakeDevice);
inyectar('models/User.js', {});
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('middleware/auth.js', { requireAuth: (_q, _r, n) => n(), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
inyectar('config/logger.js', { info() {}, warn() {}, error() {} });

const V = require('../lib/version-app');
const licencias = require('../routes/licenses.routes');
const escritorio = require('../routes/desktop.routes');

async function llamar(router, metodo, ruta, { user, body, headers } = {}) {
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  let status = 200; let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, set() { return this; } };
  const req = { user, body, headers, ip: '1.1.1.1' };
  for (const h of capa.route.stack.map((s) => s.handle)) await h(req, res, () => {});
  return { status, json };
}
const usuario = { _id: 'u1', rol: 'user', plan: 'pro', planExpira: new Date(Date.now() + 30 * 86400000) };
const latido = (body, headers) => llamar(licencias, 'post', '/heartbeat', { user: usuario, body: { deviceId: 'pc-A', ...body }, headers });
const nuevo = () => { dispositivo = new FakeDevice({ userId: 'u1', deviceId: 'pc-A' }); return dispositivo; };

(async () => {
  console.log('\n[heartbeat-aditivos] Tests:');

  // ── piezas puras ──
  assert(JSON.stringify(V.leerCabeceras({ 'x-akira-version': '1.0.36', 'x-akira-canal': 'store' })) === '{"version":"1.0.36","canal":"store"}', 'leerCabeceras: versión y canal válidos');
  assert(V.leerCabeceras({ 'x-akira-canal': ' EXE ' }).canal === 'exe', 'leerCabeceras: el canal se normaliza (minúsculas, sin espacios)');
  let c = V.leerCabeceras({ 'x-akira-version': '1.0.36; DROP', 'x-akira-canal': 'otro' });
  assert(c.version === null && c.canal === null, 'leerCabeceras: versión con basura y canal desconocido → null');
  c = V.leerCabeceras({ 'x-akira-version': ['1.0.1'], 'x-akira-canal': 5 });
  assert(c.version === null && c.canal === null, 'leerCabeceras: tipos raros → null');
  assert(V.leerCabeceras(undefined).version === null && V.leerCabeceras(null).canal === null, 'leerCabeceras: sin cabeceras no rompe');
  const ahora = Date.UTC(2026, 10, 17, 12);
  const ok = V.sanearUltimoError({ motivo: 'token_vencido', status: 401, en: '2026-11-17T11:00:00.000Z' }, ahora);
  assert(ok && ok.motivo === 'token_vencido' && ok.status === 401 && ok.en.toISOString() === '2026-11-17T11:00:00.000Z' && ok.recibidoEn.getTime() === ahora, 'sanearUltimoError: válido → motivo, status, en y recibidoEn');
  assert(V.sanearUltimoError({ motivo: 'sin_red', status: null, en: '2026-11-17T11:00:00Z' }).status === null, 'sanearUltimoError: status null es válido');
  assert(V.sanearUltimoError({ motivo: 'a'.repeat(80), status: 0, en: '2026-11-17T11:00:00Z' }).motivo.length === 40, 'sanearUltimoError: el motivo se trunca a 40 caracteres');
  assert(V.sanearUltimoError({ motivo: 'Token-Vencido 12!', status: 1, en: '2026-11-17T11:00:00Z' }).motivo === 'tokenvencido', 'sanearUltimoError: del motivo solo quedan minúsculas y guion bajo');
  const malos = [null, undefined, 'texto', 5, [], {}, { motivo: 5, status: 1, en: '2026-11-17T11:00:00Z' }, { motivo: '123!', status: 1, en: '2026-11-17T11:00:00Z' }, { motivo: 'x', status: '401', en: '2026-11-17T11:00:00Z' },
    { motivo: 'x', status: 600, en: '2026-11-17T11:00:00Z' }, { motivo: 'x', status: -1, en: '2026-11-17T11:00:00Z' }, { motivo: 'x', status: 40.5, en: '2026-11-17T11:00:00Z' },
    { motivo: 'x', status: 1, en: 'ayer' }, { motivo: 'x', status: 1, en: '5' }, { motivo: 'x', status: 1 }, { motivo: 'x', status: 1, en: 1731841200000 }];
  assert(malos.every((m) => V.sanearUltimoError(m) === null), `sanearUltimoError: ${malos.length} formas mal formadas se ignoran (null)`);
  const trampa = { get motivo() { throw new Error('boom'); } };
  assert(V.sanearUltimoError(trampa) === null, 'sanearUltimoError: un objeto que tira error al leerlo se ignora, no propaga');
  assert(JSON.stringify(V.versionesDeEntorno({})) === '{"versionMinima":null,"versionRecomendada":null}', 'versionesDeEntorno: sin variables → null y null');
  assert(V.versionesDeEntorno({ DESKTOP_VERSION_MINIMA: '1.0.30', DESKTOP_VERSION_RECOMENDADA: ' 1.0.36 ' }).versionRecomendada === '1.0.36', 'versionesDeEntorno: lee y limpia las dos variables');
  assert(V.versionesDeEntorno({ DESKTOP_VERSION_MINIMA: 'cualquier cosa' }).versionMinima === null, 'versionesDeEntorno: un valor mal escrito → null');

  // ── el modelo real acepta los campos nuevos y los viejos siguen igual ──
  delete require.cache[require.resolve('../models/Device.js')];
  const Real = (() => { const f = require.resolve('../models/Device.js'); delete require.cache[f]; return require('../models/Device.js'); })();
  const d0 = new Real({ userId: '66f1a2b3c4d5e6f7a8b9c0d1', deviceId: 'x' });
  assert(d0.canal === null && d0.ultimoErrorLicencia === null && d0.version === '' && d0.validateSync() === undefined, 'modelo Device: un equipo sin los campos nuevos sigue siendo válido (canal y ultimoErrorLicencia en null)');
  d0.canal = 'store'; d0.ultimoErrorLicencia = ok;
  assert(d0.validateSync() === undefined && d0.ultimoErrorLicencia.motivo === 'token_vencido' && d0.ultimoErrorLicencia.status === 401, 'modelo Device: guarda canal y ultimoErrorLicencia { motivo, status, en, recibidoEn }');
  inyectar('models/Device.js', FakeDevice);

  // ── latido SIN los datos nuevos: igual que antes ──
  let d = nuevo(); let r = await latido({ version: '1.0.35' }, undefined);
  assert(r.status === 200 && typeof r.json.licenseToken === 'string' && r.json.plan === 'pro' && r.json.vigente === true && 'features' in r.json && 'slotsMax' in r.json && 'expira' in r.json, 'sin datos nuevos y sin cabeceras (req.headers undefined): 200 con la respuesta de siempre');
  assert(d.version === '1.0.35' && d.canal === null && d.ultimoErrorLicencia === undefined && d.guardado === 1, 'sin datos nuevos: la versión del cuerpo se guarda, canal y error quedan como estaban');
  assert(r.json.versionMinima === null && r.json.versionRecomendada === null, 'sin variables de entorno: versionMinima y versionRecomendada llegan en null (campos aditivos)');
  d = nuevo(); r = await latido({}, {});
  assert(r.status === 200 && d.version === '', 'latido vacío (como el de un cliente viejo): 200 y nada cambia');

  // ── cabeceras ──
  d = nuevo(); r = await latido({}, { 'x-akira-version': '1.0.36', 'x-akira-canal': 'store' });
  assert(r.status === 200 && d.version === '1.0.36' && d.canal === 'store', 'cabeceras válidas: se guardan versión (porque el cuerpo no la trajo) y canal');
  d = nuevo(); r = await latido({ version: '1.0.35' }, { 'x-akira-version': '1.0.36', 'x-akira-canal': 'exe' });
  assert(d.version === '1.0.35' && d.canal === 'exe', 'si el cuerpo trae versión, esa manda; la cabecera es solo respaldo');
  d = nuevo(); d.canal = 'store'; r = await latido({}, { 'x-akira-version': 'abc', 'x-akira-canal': 'tienda' });
  assert(r.status === 200 && d.version === '' && d.canal === 'store', 'cabeceras con basura: se ignoran, sin error y sin pisar lo guardado');
  d = nuevo(); r = await latido({ version: 'basura' }, { 'x-akira-version': '2.0.1' });
  assert(d.version === '2.0.1', 'versión del cuerpo inválida: se usa la de la cabecera');

  // ── ultimoError ──
  d = nuevo(); r = await latido({ ultimoError: { motivo: 'sin_conexion', status: null, en: '2026-11-17T10:00:00.000Z' } }, {});
  assert(r.status === 200 && d.ultimoErrorLicencia.motivo === 'sin_conexion' && d.ultimoErrorLicencia.status === null && d.ultimoErrorLicencia.en instanceof Date && d.ultimoErrorLicencia.recibidoEn instanceof Date, 'ultimoError válido: queda en el equipo como ultimoErrorLicencia con recibidoEn');
  for (const basura of ['x', 5, [], { motivo: 5 }, { motivo: 'x', status: 'z', en: 'nunca' }, { motivo: 'x', status: 1000, en: '2026-11-17T10:00:00Z' }, null]) {
    d = nuevo(); r = await latido({ ultimoError: basura }, {});
    assert(r.status === 200 && d.ultimoErrorLicencia === undefined && r.json.licenseToken, `ultimoError mal formado (${JSON.stringify(basura)}): se ignora y el latido responde 200 con licencia`);
  }
  d = nuevo(); r = await latido({ ultimoError: { motivo: 'a'.repeat(300), status: 599, en: '2026-11-17T10:00:00Z' } }, {});
  assert(d.ultimoErrorLicencia.motivo.length === 40 && d.ultimoErrorLicencia.status === 599, 'ultimoError con motivo larguísimo: se trunca a 40');

  // ── el control de licencia no cambia ──
  dispositivo = new FakeDevice({ userId: 'u1', deviceId: 'pc-A', revocado: true });
  r = await latido({ ultimoError: { motivo: 'x', status: 1, en: '2026-11-17T10:00:00Z' } }, { 'x-akira-canal': 'store' });
  assert(r.status === 403 && r.json.revocado === true && dispositivo.canal === null && dispositivo.ultimoErrorLicencia === undefined, 'equipo revocado: sigue dando 403 y no se guarda nada');
  dispositivo = new FakeDevice({ userId: 'u1', deviceId: 'pc-A' });
  r = await llamar(licencias, 'post', '/heartbeat', { user: { ...usuario, planExpira: new Date(Date.now() - 1000) }, body: { deviceId: 'pc-A' }, headers: {} });
  assert(r.status === 403 && r.json.vigente === false && !('versionMinima' in r.json), 'suscripción vencida: sigue dando 403 con la respuesta de siempre');

  // ── versionMinima / versionRecomendada con variables definidas ──
  process.env.DESKTOP_VERSION_MINIMA = '1.0.30'; process.env.DESKTOP_VERSION_RECOMENDADA = '1.0.36';
  nuevo(); r = await latido({}, {});
  assert(r.status === 200 && r.json.versionMinima === '1.0.30' && r.json.versionRecomendada === '1.0.36' && r.json.vigente === true, 'latido con las variables definidas: devuelve versionMinima y versionRecomendada, y NO bloquea (vigente true)');
  process.env.DESKTOP_VERSION_MINIMA = 'xx';
  nuevo(); r = await latido({}, {});
  assert(r.json.versionMinima === null && r.json.versionRecomendada === '1.0.36', 'una variable mal escrita se informa como null');

  // ── /api/desktop/latest ──
  r = await llamar(escritorio, 'get', '/latest', {});
  assert(r.json.versionMinima === null && r.json.versionRecomendada === '1.0.36' && 'disponible' in r.json && 'version' in r.json && 'url' in r.json && 'android' in r.json && 'mac' in r.json && r.json.plataforma === 'windows', '/api/desktop/latest: suma los dos campos y conserva todos los anteriores');
  delete process.env.DESKTOP_VERSION_MINIMA; delete process.env.DESKTOP_VERSION_RECOMENDADA;
  r = await llamar(escritorio, 'get', '/latest', {});
  assert(r.json.versionMinima === null && r.json.versionRecomendada === null, '/api/desktop/latest sin variables: ambos null');

  console.log('\n✅ Todos los tests de los aditivos del latido pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
