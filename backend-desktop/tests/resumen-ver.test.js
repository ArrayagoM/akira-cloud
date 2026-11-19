// tests/resumen-ver.test.js — cada usuario elige QUÉ números del resumen del negocio ve (web, celular y .apk).
// La PC manda todos los contadores permitidos; el servidor filtra al responder según lo que eligió. Sin elección = todo, como siempre.
'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);
process.env.FRONTEND_URL = 'https://akiracloud.lat';
const { assert, inyectar, logCapturado, limiteFalso } = require('./_ayuda');

// ── modelos de mentira ──
const usuarios = new Map();
const dispositivos = [];
class FakeDevice {
  static find(q) {
    const r = dispositivos.filter((d) => String(d.userId) === String(q.userId) && d.activo === q.activo && d.revocado === q.revocado);
    const p = Promise.resolve(r); p.select = () => ({ lean: async () => r.map((d) => JSON.parse(JSON.stringify(d))) }); return p;
  }
  static updateOne() { return { matchedCount: 1 }; }
}
inyectar('models/Device.js', FakeDevice);
inyectar('models/MobileDevice.js', {});
inyectar('models/Log.js', { registrar: async () => {} });
inyectar('models/Referido.js', {});
inyectar('models/OAuthCode.js', {});
inyectar('models/Limite.js', limiteFalso());
inyectar('services/email.service.js', {});
inyectar('config/logger.js', logCapturado());
inyectar('lib/limite.js', { consumir: async () => ({ ok: true }), consumirTodos: async () => ({ ok: true }), mensajeEspera: (s) => String(s) });
inyectar('middleware/auth.js', { requireAuth: (_q, _r, n) => n(), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });
const consulta = (v) => { const p = Promise.resolve(v); p.select = () => p; p.lean = () => p; return p; };
inyectar('models/User.js', {
  findByIdAndUpdate: (id, upd) => { const u = usuarios.get(id); Object.assign(u, upd); return consulta(u); },
  findById: (id) => consulta(usuarios.get(id) || null),
  findOne: () => consulta(null),
});

const RV = require('../lib/resumen-negocio');
const comandos = require('../lib/comandos');
const auth = require('../routes/auth.routes');
const mobile = require('../routes/mobile.routes');
const licenses = require('../routes/licenses.routes');

async function llamar(router, metodo, ruta, user, body) {
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  let status = 200; let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  for (const h of capa.route.stack.map((s) => s.handle)) await h({ user, body, params: {}, query: {}, ip: '1.1.1.1', headers: {} }, res, () => {});
  return { status, json };
}

const TODO = { mes: '2026-11', mensajesHoy: 14, turnosHoy: 2, turnosMes: 31, ingresosMes: 250000, gastosMes: 90000, teDeben: 13500, debes: 20000, clientes: 87, documentosPendientes: 3 };

(async () => {
  console.log('\n[resumen-ver] Tests:');

  // ── lógica pura ──
  assert(RV.IDS_GRUPOS.join() === 'mensajes,turnos,caja,deudas,clientes,documentos', 'hay seis grupos de datos, en un orden fijo');
  const todosLosCampos = RV.IDS_GRUPOS.flatMap((id) => RV.GRUPOS[id].campos).sort().join();
  assert(todosLosCampos === [...RV.CAMPOS].sort().join(), 'entre los grupos cubren exactamente los contadores permitidos (no falta ni sobra ninguno)');
  assert(RV.filtrarResumen(TODO, undefined) === TODO && RV.filtrarResumen(TODO, null) === TODO, 'sin elección guardada se muestra todo, tal cual');
  let f = RV.filtrarResumen(TODO, ['caja', 'turnos']);
  assert(Object.keys(f).sort().join() === 'gastosMes,ingresosMes,mes,turnosHoy,turnosMes', 'con caja y turnos elegidos quedan solo esos contadores (más el mes)');
  assert(f.ingresosMes === 250000 && f.turnosHoy === 2 && !('teDeben' in f) && !('clientes' in f) && !('mensajesHoy' in f), 'y el resto desaparece');
  assert(TODO.teDeben === 13500 && Object.keys(TODO).length === 10, 'el original no se modifica');
  assert(Object.keys(RV.filtrarResumen({ mes: '2026-11', mensajesHoy: 3 }, ['caja'])).join() === 'mes', 'si el grupo elegido no tiene datos (PC vieja) queda vacío, sin inventar ceros');
  assert(RV.filtrarResumen(null, ['caja']) === null, 'sin resumen sigue siendo null');
  assert(RV.filtrarResumen(TODO, 'caja') === TODO && RV.filtrarResumen(TODO, [1, 2]) === TODO, 'una elección corrupta no oculta nada por error (se muestra todo)');
  assert(RV.sanearGrupos(['deudas', 'inventado', 'deudas', 'caja']).join() === 'caja,deudas', 'saneo: sin repetidos, sin ids inventados y en orden');
  assert(RV.sanearGrupos('caja') === null && RV.sanearGrupos(null) === null && RV.sanearGrupos([{}]) === null, 'saneo: lo que no es una lista de textos se rechaza');

  // ── preferencia guardada ──
  const U = { _id: 'u1', email: 'a@b.com', nombre: 'Ana', rol: 'user', plan: 'pro', planExpira: new Date(Date.now() + 30 * 86400000) };
  usuarios.set('u1', U);
  let r = await llamar(auth, 'get', '/resumen-ver', U);
  assert(r.status === 200 && r.json.elegido === false && r.json.grupos.length === 6 && r.json.disponibles.length === 6 && r.json.disponibles[2].etiqueta.startsWith('Caja'), 'GET: sin elección devuelve los seis grupos con su texto y "elegido: false"');
  r = await llamar(auth, 'put', '/resumen-ver', U, { grupos: ['caja', 'turnos'] });
  assert(r.status === 200 && r.json.grupos.join() === 'turnos,caja' && r.json.elegido === true && usuarios.get('u1').resumenVer.join() === 'turnos,caja', 'PUT: guarda la elección');
  r = await llamar(auth, 'get', '/resumen-ver', usuarios.get('u1'));
  assert(r.json.grupos.join() === 'turnos,caja' && r.json.elegido === true, 'GET: devuelve lo guardado');
  for (const mala of [{}, { grupos: 'caja' }, { grupos: ['inventado'] }, { grupos: [1] }, { grupos: [['caja']] }, { grupos: null }]) {
    r = await llamar(auth, 'put', '/resumen-ver', U, mala);
    assert(r.status === 400, `PUT con ${JSON.stringify(mala)} se rechaza (400)`);
  }
  r = await llamar(auth, 'put', '/resumen-ver', U, { grupos: [] });
  assert(r.status === 400 && /al menos un dato/.test(r.json.error) && usuarios.get('u1').resumenVer.join() === 'turnos,caja', 'PUT con la lista vacía se rechaza con un mensaje claro y no cambia lo guardado');

  // ── lo que ve cada pantalla ──
  dispositivos.push({ userId: 'u1', deviceId: 'pc1', nombre: 'PC', activo: true, revocado: false, ultimoHeartbeat: new Date(), resumen: { ...TODO }, resumenEn: new Date(), estadoBot: { slots: [] } });
  dispositivos.push({ userId: 'otro', deviceId: 'pcX', nombre: 'Ajena', activo: true, revocado: false, ultimoHeartbeat: new Date(), resumen: { ...TODO }, resumenEn: new Date() });

  r = await llamar(mobile, 'get', '/estado', usuarios.get('u1'));
  assert(r.status === 200 && Object.keys(r.json.pcs[0].resumen).sort().join() === 'gastosMes,ingresosMes,mes,turnosHoy,turnosMes', 'celular y .apk (GET /mobile/estado): solo ven lo elegido');
  r = await llamar(licenses, 'get', '/mine', usuarios.get('u1'));
  assert(r.status === 200 && Object.keys(r.json.devices[0].resumen).sort().join() === 'gastosMes,ingresosMes,mes,turnosHoy,turnosMes', 'web (GET /licenses/mine): solo ve lo elegido');
  assert(dispositivos[0].resumen.teDeben === 13500, 'lo que guarda el servidor no se toca: cambiar la elección vuelve a mostrar el dato sin esperar a la PC');

  const sinEleccion = { _id: 'u2', email: 'c@d.com', nombre: 'Luis', rol: 'user', plan: 'pro', planExpira: U.planExpira }; usuarios.set('u2', sinEleccion);
  dispositivos.push({ userId: 'u2', deviceId: 'pc2', nombre: 'PC2', activo: true, revocado: false, ultimoHeartbeat: new Date(), resumen: { ...TODO }, resumenEn: new Date(), estadoBot: { slots: [] } });
  r = await llamar(mobile, 'get', '/estado', sinEleccion);
  assert(Object.keys(r.json.pcs[0].resumen).length === 10, 'quien nunca eligió sigue viendo todo (nada cambia para los usuarios actuales)');
  r = await llamar(licenses, 'get', '/mine', sinEleccion);
  assert(Object.keys(r.json.devices[0].resumen).length === 10, 'ídem en la web');

  // PC sin resumen (función apagada en la PC): sigue null, la elección no inventa nada
  dispositivos.push({ userId: 'u3', deviceId: 'pc3', nombre: 'PC3', activo: true, revocado: false, ultimoHeartbeat: new Date(), resumen: null, estadoBot: { slots: [] } });
  const u3 = { ...U, _id: 'u3', resumenVer: ['caja'] }; usuarios.set('u3', u3);
  r = await llamar(mobile, 'get', '/estado', u3);
  assert(r.json.pcs[0].resumen === null, 'si la PC no comparte nada, sigue sin resumen (aparece el aviso de activarlo en la PC)');
  r = await llamar(licenses, 'get', '/mine', u3);
  assert(r.json.devices[0].resumen === null, 'ídem en la web');

  // resumirEstado sin tercer parámetro (otros usos): igual que antes
  assert(comandos.resumirEstado({ deviceId: 'a', resumen: { mensajesHoy: 5 }, resumenEn: new Date() }).resumen.mensajesHoy === 5, 'resumirEstado sin elección devuelve el resumen completo');

  console.log('✅ resumen-ver: OK');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
