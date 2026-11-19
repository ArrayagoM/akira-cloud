// tests/datos-negocio.test.js — "datos de mi negocio en el celular": la PC sube agenda, caja, clientes y catálogo; el servidor valida, guarda
// CIFRADO y solo se los devuelve a la cuenta dueña. Rutas reales con modelos de mentira (sin base de datos).
'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.LICENSE_JWT_SECRET = 'y'.repeat(40);
process.env.ENCRYPTION_KEY = 'clave-de-prueba-solo-para-test-1234567890';
process.env.FRONTEND_URL = 'https://akiracloud.lat';
const { assert, inyectar, logCapturado } = require('./_ayuda');

// ── base de mentira ──
const dispositivos = []; const guardados = [];
let idsDatos = 0;
const cadena = (valor) => { const p = Promise.resolve(valor); p.select = () => p; return p; };
class FakeDevice {
  static findOne(q) { return Promise.resolve(dispositivos.find((d) => String(d.userId) === String(q.userId) && d.deviceId === q.deviceId) || null); }
  static find(q) { return Promise.resolve(dispositivos.filter((d) => String(d.userId) === String(q.userId) && d.activo === q.activo && d.revocado === q.revocado)); }
  static updateOne() { return { matchedCount: 1 }; }
}
const igual = (d, q) => Object.keys(q).every((k) => (q[k] && q[k].$in ? q[k].$in.includes(d[k]) : String(d[k]) === String(q[k])));
const FakeDatos = {
  findOne: (q) => cadena(guardados.find((d) => igual(d, q)) || null),
  find: (q) => cadena(guardados.filter((d) => igual(d, q))),
  updateOne: async (f, u) => { const d = guardados.find((x) => x._id === f._id); if (d) Object.assign(d, u.$set); },
  findOneAndUpdate: async (q, u) => { let d = guardados.find((x) => igual(x, q)); if (!d) { d = { _id: 'd' + (++idsDatos), ...q }; guardados.push(d); } Object.assign(d, u.$set); return d; },
  deleteMany: async (q) => { for (let i = guardados.length - 1; i >= 0; i--) if (igual(guardados[i], q)) guardados.splice(i, 1); },
};
let limiteOk = true;
inyectar('models/Device.js', FakeDevice);
inyectar('models/DatosNegocio.js', FakeDatos);
inyectar('models/MobileDevice.js', {});
inyectar('models/Log.js', { registrar: async () => {} });
const log = logCapturado();
inyectar('config/logger.js', log);
inyectar('lib/limite.js', { consumir: async () => (limiteOk ? { ok: true } : { ok: false, reintentarEnSeg: 60 }), consumirTodos: async () => ({ ok: true }), mensajeEspera: (s) => `esperá ${s}s` });
inyectar('middleware/auth.js', { requireAuth: (_q, _r, n) => n(), requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });

const DN = require('../lib/datos-negocio');
const licenses = require('../routes/licenses.routes');
const mobile = require('../routes/mobile.routes');

async function llamar(router, metodo, ruta, user, { body, query } = {}) {
  const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
  let status = 200; let json = null; const cab = {};
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, set(k, v) { cab[k] = v; return this; } };
  for (const h of capa.route.stack.map((s) => s.handle)) await h({ user, body, params: {}, query: query || {}, ip: '1.1.1.1', headers: {} }, res, () => {});
  return { status, json, cab };
}

const DIA = new Date(Date.now() + 30 * 86400000);
const ANA = { _id: 'u1', email: 'ana@negocio.com', nombre: 'Ana', rol: 'user', plan: 'pro', planExpira: DIA };
const LUIS = { _id: 'u2', email: 'luis@negocio.com', nombre: 'Luis', rol: 'user', plan: 'pro', planExpira: DIA };
const VENCIDA = { _id: 'u3', email: 'v@negocio.com', nombre: 'Vencida', rol: 'user', plan: 'free', planExpira: new Date(Date.now() - 86400000) };

const AGENDA = { desde: '2026-11-19', hasta: '2026-12-03', turnos: [
  { id: 't1', inicio: '2026-11-19T13:00:00.000Z', fin: '2026-11-19T14:00:00.000Z', cliente: 'María Pérez', telefono: '+54 9 2241 497226', titulo: 'Lavado completo', detalle: 'Camioneta blanca', puesto: 'Box 2', estado: 'confirmado', monto: 12000, cobrado: true, metodo: 'efectivo', secreto: 'x' },
  { id: 't2', inicio: 'no-es-fecha', cliente: 'Sin fecha' },
  { id: 't3', inicio: '2026-11-20T10:00:00.000Z', cliente: 'Juan', estado: 'inventado', monto: 'abc' },
] };
const CAJA = { mes: '2026-11', resumen: { ingresos: 50000, gastos: 20000 }, movimientos: [
  { fecha: '2026-11-03', tipo: 'gasto', monto: -15000, categoria: 'Alquiler', detalle: 'Noviembre', metodo: 'transferencia', origen: 'manual' },
  { fecha: 'ayer', tipo: 'ingreso', monto: 5 },
  { fecha: '2026-11-10', tipo: 'otra-cosa', monto: 7000, categoria: 'Ventas' },
] };
const CLIENTES = { clientes: [{ nombre: 'María Pérez', telefono: '2241497226' }, { nombre: '', telefono: '' }], deudores: [{ nombre: 'Juan', telefono: '224', saldo: 8000, dias: 12 }, { nombre: 'Cero', saldo: 0 }, { nombre: 'Neg', saldo: -5 }], totalDeben: 8000 };
const CATALOGO = { productos: [{ nombre: 'Shampoo', precio: 3500, categoria: 'Insumos', stock: 12, disponible: true, codigo: '779123' }, { nombre: '', precio: 1 }, { nombre: 'Cera', precio: -4, stock: -3, disponible: false }] };

(async () => {
  console.log('\n[datos-negocio] Tests:');

  // ── validación ──
  const a = DN.sanearDatos('agenda', AGENDA);
  assert(a.turnos.length === 2 && a.turnos[0].cliente === 'María Pérez' && a.turnos[0].cobrado === true && a.turnos[0].monto === 12000, 'agenda: queda el turno válido con sus datos y se descarta el de fecha inválida');
  assert(!('secreto' in a.turnos[0]), 'agenda: cualquier campo que no esté en la lista se descarta');
  assert(a.turnos[1].estado === 'pendiente' && a.turnos[1].monto === 0, 'agenda: un estado inventado pasa a pendiente y un monto que no es número a 0');
  const c = DN.sanearDatos('caja', CAJA);
  assert(c.movimientos.length === 2 && c.movimientos[0].monto === 15000 && c.movimientos[0].tipo === 'gasto' && c.movimientos[1].tipo === 'ingreso', 'caja: se descarta el movimiento sin fecha válida; los montos son positivos y el tipo solo puede ser ingreso o gasto');
  assert(c.resumen.resultado === 30000 && c.mes === '2026-11', 'caja: el resultado se calcula (ingresos − gastos)');
  const cl = DN.sanearDatos('clientes', CLIENTES);
  assert(cl.clientes.length === 1 && cl.deudores.length === 1 && cl.deudores[0].saldo === 8000 && cl.deudores[0].dias === 12, 'clientes: no entran filas vacías ni deudores con saldo cero o negativo');
  const ca = DN.sanearDatos('catalogo', CATALOGO);
  assert(ca.productos.length === 2 && ca.productos[1].precio === 0 && ca.productos[1].stock === -1 && ca.productos[1].disponible === false, 'catálogo: sin nombre no entra; precio negativo → 0 y stock negativo → "sin control" (-1)');
  assert(DN.sanearDatos('inventado', {}) === null && DN.sanearDatos('agenda', 'texto') === null && DN.sanearDatos('agenda', [1]) === null && DN.sanearDatos('caja', null) === null, 'un tipo desconocido o un contenido que no es un objeto → nada');
  const enorme = DN.sanearDatos('agenda', { turnos: Array.from({ length: 5000 }, (_, i) => ({ inicio: '2026-11-19T10:00:00.000Z', cliente: 'x'.repeat(5000), id: String(i) })) });
  assert(enorme.turnos.length === DN.MAX.turnos && enorme.turnos[0].cliente.length === 80, 'los largos y las cantidades están acotados (400 turnos, 80 letras por nombre)');
  assert(DN.sanearDatos('clientes', { clientes: [{ nombre: 'A\u0000B\nC' }] }).clientes[0].nombre === 'A B C', 'los caracteres de control se limpian');
  assert(DN.huella(a) === DN.huella(DN.sanearDatos('agenda', AGENDA)) && DN.huella(a) !== DN.huella(c), 'la huella es estable para el mismo contenido y distinta para otro');

  // ── subida desde la PC ──
  dispositivos.push({ userId: 'u1', deviceId: 'pc1', nombre: 'PC Lavadero', activo: true, revocado: false, ultimoHeartbeat: new Date() });
  dispositivos.push({ userId: 'u2', deviceId: 'pc9', nombre: 'PC de Luis', activo: true, revocado: false, ultimoHeartbeat: new Date() });
  dispositivos.push({ userId: 'u3', deviceId: 'pcv', nombre: 'Vencida', activo: true, revocado: false, ultimoHeartbeat: new Date() });
  let r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', datos: { agenda: AGENDA, caja: CAJA, clientes: CLIENTES, catalogo: CATALOGO } } });
  assert(r.status === 200 && r.json.guardados.join() === 'agenda,caja,clientes,catalogo', 'PUT /datos: guarda los cuatro tipos');
  const crudo = JSON.stringify(guardados);
  assert(guardados.length === 4 && !/María|Pérez|Camioneta|Alquiler|Shampoo|2241/.test(crudo), 'lo guardado está CIFRADO: no aparece ningún nombre, teléfono ni detalle en texto');
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', datos: { agenda: AGENDA, caja: { ...CAJA, resumen: { ingresos: 60000, gastos: 20000 } } } } });
  assert(r.json.sinCambios.join() === 'agenda' && r.json.guardados.join() === 'caja' && guardados.length === 4, 'si algo no cambió no se vuelve a guardar; lo que cambió se reemplaza (sigue habiendo un registro por tipo)');
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', datos: { agenda: 'basura', inventado: {} } } });
  assert(r.status === 400 && r.json.invalidos.join() === 'agenda', 'datos inválidos: se rechazan (400) sin guardar nada raro');
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1' } });
  assert(r.status === 400, 'sin datos: 400');
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc9', datos: { agenda: AGENDA } } });
  assert(r.status === 403, 'un equipo de OTRA cuenta no se puede usar (403)');
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc-inexistente', datos: { agenda: AGENDA } } });
  assert(r.status === 403, 'un equipo inexistente: 403');
  r = await llamar(licenses, 'put', '/datos', VENCIDA, { body: { deviceId: 'pcv', datos: { agenda: AGENDA } } });
  assert(r.status === 403 && r.json.vigente === false, 'con la suscripción vencida no se sube nada nuevo');
  limiteOk = false;
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', datos: { agenda: AGENDA } } });
  assert(r.status === 429, 'si se pasa del tope de subidas por hora: 429');
  limiteOk = true;

  // ── lectura desde el celular / .apk ──
  r = await llamar(mobile, 'get', '/datos', ANA, { query: { tipo: 'agenda' } });
  assert(r.status === 200 && r.json.pcs.length === 1 && r.json.pcs[0].nombre === 'PC Lavadero' && r.json.pcs[0].datos.turnos[0].cliente === 'María Pérez', 'GET /mobile/datos: devuelve la agenda descifrada de la PC del usuario');
  assert(r.cab['Cache-Control'] === 'no-store', 'la respuesta no se guarda en cachés (no-store)');
  r = await llamar(mobile, 'get', '/datos', ANA, { query: { tipo: 'caja' } });
  assert(r.json.pcs[0].datos.resumen.ingresos === 60000, 'la caja trae lo último que subió la PC');
  r = await llamar(mobile, 'get', '/datos', LUIS, { query: { tipo: 'agenda' } });
  assert(r.status === 200 && r.json.pcs.length === 0, 'OTRA cuenta no ve nada de Ana (aislamiento entre usuarios)');
  for (const t of ['', 'inventado', '../x', undefined]) {
    r = await llamar(mobile, 'get', '/datos', ANA, { query: { tipo: t } });
    assert(r.status === 400, `tipo ${JSON.stringify(t)}: 400`);
  }
  dispositivos[0].activo = false;
  r = await llamar(mobile, 'get', '/datos', ANA, { query: { tipo: 'agenda' } });
  assert(r.json.pcs.length === 0, 'si el equipo ya no está activo, sus datos no se muestran');
  dispositivos[0].activo = true;

  // ── borrar ──
  r = await llamar(licenses, 'put', '/datos', LUIS, { body: { deviceId: 'pc1', borrar: true } });
  assert(r.status === 403 && guardados.length === 4, 'otra cuenta no puede borrar los datos ajenos');
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', borrar: true } });
  assert(r.status === 200 && r.json.borrado === true && guardados.length === 0, 'borrar:true elimina todo lo de ese equipo');
  r = await llamar(mobile, 'get', '/datos', ANA, { query: { tipo: 'agenda' } });
  assert(r.json.pcs.length === 0, 'después de borrar, el celular no ve nada');

  // quitar solo algunos tipos (el usuario sacó "Agenda" de lo que comparte)
  await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', datos: { agenda: AGENDA, caja: CAJA, catalogo: CATALOGO } } });
  assert(guardados.length === 3, '(se suben tres tipos)');
  r = await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', quitar: ['agenda', 'inventado'] } });
  assert(r.status === 200 && r.json.quitados.join() === 'agenda' && guardados.map((g) => g.tipo).sort().join() === 'caja,catalogo', 'quitar:["agenda"] borra solo la agenda y ignora lo que no es un tipo');
  r = await llamar(licenses, 'put', '/datos', LUIS, { body: { deviceId: 'pc1', quitar: ['caja'] } });
  assert(r.status === 403 && guardados.length === 2, 'otra cuenta no puede quitar datos ajenos');
  r = await llamar(licenses, 'put', '/datos', VENCIDA, { body: { deviceId: 'pcv', quitar: ['caja'] } });
  assert(r.status === 200, 'quitar datos se permite siempre, aunque la suscripción esté vencida');
  await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', borrar: true } });
  await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', datos: { catalogo: CATALOGO } } });

  // desactivar el equipo borra los datos
  await llamar(licenses, 'put', '/datos', ANA, { body: { deviceId: 'pc1', datos: { catalogo: CATALOGO } } });
  assert(guardados.length === 1, '(se vuelve a subir un dato)');
  dispositivos[0].save = async () => {};
  r = await llamar(licenses, 'post', '/deactivate', ANA, { body: { deviceId: 'pc1' } });
  assert(r.status === 200 && guardados.length === 0, 'al desactivar el equipo se borran sus datos del servidor');

  // nunca se loguea el contenido
  assert(!/María|Pérez|Shampoo|Alquiler/.test(log.lineas.join('\n')), 'en los registros del servidor no aparece ningún dato de clientes');
  console.log('✅ datos-negocio: OK');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
