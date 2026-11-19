// tests/datos-celular.test.js — "ver los datos de mi negocio en el celular": apagado por defecto, qué se arma de cada tipo
// (agenda, caja, clientes y deudores, catálogo), solo del usuario dueño, y que el servicio de envío sube solo lo que cambió.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-datoscel-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[datos-celular] Tests:');
  const dc = require('../main/datos-celular');
  const { crearServicio } = require('../main/datos-celular-vivo');
  const Turno = require('../main/bot-engine/models/Turno');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const CtaCte = require('../main/bot-engine/models/CtaCte');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Config = require('../main/bot-engine/models/Config');

  // ── apagado por defecto y ajustes ──
  assert(dc.activo(dir) === false && dc.enviaAlgo(dir) === false, 'apagado por defecto: no se envía nada');
  assert(dc.tipos(dir).join() === 'agenda,caja,clientes,catalogo', 'sin elección guardada, los cuatro tipos (el usuario los ve tildados al activar)');
  assert(dc.guardar(dir, { activo: true }).activo === true && dc.activo(dir) && dc.enviaAlgo(dir), 'activarla');
  assert(dc.guardar(dir, { tipos: ['caja', 'agenda', 'inventado', 'caja'] }).tipos.join() === 'agenda,caja' && dc.activo(dir) === true, 'guardar tipos: sin repetidos ni inventados, en orden, y no cambia si está activa');
  assert(dc.guardar(dir, { tipos: [] }).tipos.length === 0 && dc.enviaAlgo(dir) === false, 'sin ningún tipo elegido no se envía nada aunque esté activa');
  assert(dc.sanearTipos('caja') === null && dc.sanearTipos(null) === null && dc.sanearTipos([1, {}]).length === 0, 'sanearTipos: lo que no es una lista de textos se rechaza');
  fs.writeFileSync(path.join(dir, 'datos-celular.json'), '{roto');
  assert(dc.activo(dir) === false && dc.tipos(dir).length === 4, 'un archivo de ajustes roto se trata como apagado (nunca como activo)');
  dc.guardar(dir, { activo: true, tipos: ['agenda', 'caja', 'clientes', 'catalogo'] });

  // ── datos de prueba ──
  const U = 'u1'; const ahora = new Date(2026, 10, 19, 12, 0); // 19/11/2026 12:00
  const T = (dia, hora, extra) => ({ userId: U, calendarId: 'primary', fechaInicio: new Date(2026, 10, dia, hora), fechaFin: new Date(2026, 10, dia, hora + 1), resumen: 'Lavado', estado: 'confirmado', clienteNombre: 'Cliente', clienteTelefono: '2241000000', ...extra });
  await Turno.create(T(19, 10, { clienteNombre: 'María Pérez', clienteTelefono: '2241497226', descripcion: 'WhatsApp: +542241497226 | Email: maria@x.com', pago: { monto: 12000, metodo: 'mercadopago' } }));
  await Turno.create(T(19, 15, { clienteNombre: 'Juan Gómez', descripcion: 'Camioneta blanca', calendarId: 'Box 2', precioInformativo: 8000 }));
  await Turno.create(T(20, 9, { estado: 'cancelado', clienteNombre: 'Cancelado' }));
  await Turno.create({ ...T(1, 9, { clienteNombre: 'Lejano' }), fechaInicio: new Date(2026, 11, 20, 9), fechaFin: new Date(2026, 11, 20, 10) });
  await Turno.create({ ...T(1, 9, { clienteNombre: 'Muy viejo' }) });
  await Turno.create({ ...T(19, 11, { clienteNombre: 'De otro usuario' }), userId: 'otro' });
  await Movimiento.create({ userId: U, tipo: 'gasto', monto: 15000, fecha: '2026-11-03', categoria: 'Alquiler', descripcion: 'Alquiler noviembre', metodo: 'transferencia' });
  await Movimiento.create({ userId: U, tipo: 'gasto', monto: 999, fecha: '2026-10-30', categoria: 'Otro mes', descripcion: 'x', metodo: 'efectivo' });
  await Movimiento.create({ userId: 'otro', tipo: 'gasto', monto: 77777, fecha: '2026-11-03', categoria: 'Ajeno', descripcion: 'x', metodo: 'efectivo' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241497226', nombre: 'Ana López', telefono: '2241497226', tipo: 'cargo', monto: 8000, fecha: '2026-11-01' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241000111', nombre: 'Pagó todo', tipo: 'cargo', monto: 500, fecha: '2026-11-01' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241000111', nombre: 'Pagó todo', tipo: 'pago', monto: 500, fecha: '2026-11-02' });
  await CtaCte.create({ userId: U, entidad: 'proveedor', entidadClave: 'prov:1', proveedorId: '1', nombre: 'Proveedor Sur', tipo: 'cargo', monto: 20000, fecha: '2026-11-02' });
  await BotCliente.create({ userId: U, jid: '5492241497226@s.whatsapp.net', nombre: 'María Pérez' });
  await BotCliente.create({ userId: U, jid: '123@lid', nombre: 'Sin teléfono real' });
  await BotCliente.create({ userId: 'otro', jid: '9@s.whatsapp.net', nombre: 'Cliente ajeno' });
  await Config.create({ userId: U, catalogo: [{ nombre: 'Shampoo', precio: 3500, categoria: 'Insumos', stock: 12, disponible: true, codigo: '779123' }, { nombre: 'Cera', precio: 5000, stock: -1, disponible: false }] });

  const d = await dc.calcular(U, ['agenda', 'caja', 'clientes', 'catalogo'], { ahora, general: 'primary' });

  // ── agenda ──
  const nombres = d.agenda.turnos.map((t) => t.cliente);
  assert(nombres.join() === 'María Pérez,Juan Gómez', 'agenda: solo turnos de hoy y próximos 14 días, sin cancelados, sin muy viejos ni lejanos, ordenados por hora');
  const [maria, juan] = d.agenda.turnos;
  assert(maria.cobrado === true && maria.monto === 12000 && maria.metodo === 'mercadopago' && maria.puesto === 'General', 'agenda: turno cobrado con su monto y método; el puesto del bot se llama "General"');
  assert(maria.detalle === '' && !JSON.stringify(maria).includes('maria@x.com'), 'agenda: en los turnos del bot no se manda la descripción (repite teléfono y email)');
  assert(juan.detalle === 'Camioneta blanca' && juan.puesto === 'Box 2' && juan.cobrado === false && juan.monto === 8000, 'agenda: turno manual con su detalle, su puesto y el precio informativo (sin cobrar)');
  assert(d.agenda.desde === '2026-11-18' && d.agenda.hasta === '2026-12-03', 'agenda: indica el rango que cubre');

  // ── caja ──
  assert(d.caja.mes === '2026-11' && d.caja.movimientos.length === 2, 'caja: los movimientos del mes (el gasto cargado y el ingreso del turno cobrado), sin los de otro mes ni de otro usuario');
  assert(d.caja.resumen.ingresos === 12000 && d.caja.resumen.gastos === 15000, 'caja: el resumen coincide con la Caja de la PC (ingresos de turnos cobrados y gastos del mes)');
  assert(d.caja.movimientos.some((m) => m.origen === 'turno' && m.monto === 12000) && !JSON.stringify(d.caja).includes('Ajeno'), 'caja: incluye el ingreso del turno cobrado y nada de otro usuario');

  // ── clientes y deudores ──
  assert(d.clientes.clientes.length === 2 && d.clientes.clientes.find((c) => c.nombre === 'María Pérez').telefono === '5492241497226', 'clientes: los del usuario con su teléfono (si es un número real de WhatsApp)');
  assert(d.clientes.clientes.find((c) => c.nombre === 'Sin teléfono real').telefono === '' && !JSON.stringify(d.clientes).includes('Cliente ajeno'), 'clientes: un id interno (@lid) no se manda como teléfono y no entra nada de otro usuario');
  assert(d.clientes.deudores.length === 1 && d.clientes.deudores[0].nombre === 'Ana López' && d.clientes.deudores[0].saldo === 8000 && d.clientes.totalDeben === 8000, 'deudores: solo quien debe (el que pagó todo no aparece) y los proveedores no se mezclan');

  // ── catálogo ──
  assert(d.catalogo.productos.length === 2 && d.catalogo.productos[0].nombre === 'Shampoo' && d.catalogo.productos[0].stock === 12 && d.catalogo.productos[1].stock === -1 && d.catalogo.productos[1].disponible === false, 'catálogo: productos con precio, stock (-1 = sin control) y si está disponible');

  const solo = await dc.calcular(U, ['caja'], { ahora });
  assert(Object.keys(solo).join() === 'caja', 'solo se arman los tipos pedidos');
  assert(Object.keys(await dc.calcular(U, [], { ahora })).length === 0 && Object.keys(await dc.calcular(U, ['inventado'], { ahora })).length === 0, 'sin tipos o con tipos inventados no se arma nada');
  assert(dc.huella(d.agenda) === dc.huella((await dc.calcular(U, ['agenda'], { ahora, general: 'primary' })).agenda), 'la huella es estable mientras no cambie nada');
  await Turno.create(T(21, 9, { clienteNombre: 'Nuevo' }));
  assert(dc.huella(d.agenda) !== dc.huella((await dc.calcular(U, ['agenda'], { ahora, general: 'primary' })).agenda), 'y cambia cuando cambia la agenda');

  // ── servicio de envío ──
  const enviados = []; let t = 1_000_000; let fallar = false; let miran = false; let contenido = { agenda: { a: 1 }, caja: { b: 1 } }; let elegidos = ['agenda', 'caja']; let prendido = true;
  const s = crearServicio({
    activo: () => prendido, tipos: () => elegidos, obtenerUserId: () => 'u1', calcular: async () => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(contenido).filter(([k]) => elegidos.includes(k))))),
    huella: (c) => JSON.stringify(c), enviar: async (x) => { if (fallar) throw new Error('sin internet'); enviados.push(Object.keys(x.datos).join()); return { mirando: miran }; },
    ahora: () => t, log: () => {},
  });
  let r = await s.tick();
  assert(r.enviado && enviados[0] === 'agenda,caja', 'servicio: el primer ciclo sube todo lo elegido');
  r = await s.tick();
  assert(!r.enviado && r.motivo === 'sin_cambios' && enviados.length === 1, 'servicio: sin cambios no vuelve a subir');
  contenido.caja = { b: 2 }; t += 5000;
  r = await s.tick();
  assert(!r.enviado && r.motivo === 'muy_pronto', 'servicio: hubo un cambio pero es muy pronto (nadie mira): espera');
  t += 61000; r = await s.tick();
  assert(r.enviado && enviados[1] === 'caja', 'servicio: pasado el plazo sube SOLO el tipo que cambió');
  contenido.agenda = { a: 2 }; miran = true; t += 61000; await s.tick(); // este envío responde mirando:true
  contenido.agenda = { a: 3 }; t += 11000; r = await s.tick();
  assert(r.enviado, 'servicio: si alguien está mirando, el plazo baja a 10 segundos');
  contenido.caja = { b: 9 }; fallar = true; t += 61000; r = await s.tick();
  assert(!r.enviado && r.motivo === 'error', 'servicio: si falla el envío no se rompe nada');
  fallar = false; t += 61000; r = await s.tick();
  assert(r.enviado && r.tipos.join() === 'caja', 'servicio: el cambio que no se pudo subir se reintenta y no se pierde');
  t += 6 * 3600 * 1000 + 1; r = await s.tick();
  assert(r.enviado && r.tipos.join() === 'agenda,caja', 'servicio: cada 6 horas reenvía todo aunque no haya cambios (mantiene viva la copia)');
  elegidos = ['caja']; t += 61000; contenido.caja = { b: 10 }; r = await s.tick();
  assert(r.enviado && r.tipos.join() === 'caja', 'servicio: un tipo que el usuario sacó deja de enviarse');
  prendido = false; r = await s.tick();
  assert(!r.enviado && r.motivo === 'apagado', 'servicio: apagada no envía nada');
  prendido = true; elegidos = ['agenda', 'caja']; s.reiniciarEstado(); r = await s.tick();
  assert(r.enviado && r.tipos.join() === 'agenda,caja', 'servicio: al reactivar o cambiar la elección vuelve a subir todo enseguida');
  const sinSesion = crearServicio({ activo: () => true, tipos: () => ['caja'], obtenerUserId: () => null, calcular: async () => ({}), huella: String, enviar: async () => ({}), ahora: () => 1 });
  assert((await sinSesion.tick()).motivo === 'sin_sesion', 'servicio: sin sesión iniciada no envía');
  const roto = crearServicio({ activo: () => true, tipos: () => ['caja'], obtenerUserId: () => 'u1', calcular: async () => { throw new Error('base'); }, huella: String, enviar: async () => ({}), ahora: () => 1, log: () => {} });
  assert((await roto.tick()).motivo === 'error', 'servicio: si falla el cálculo no se rompe');

  // ── cableado (comprobación de código) ──
  const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const server = leer('main', 'local-api', 'server.js');
  assert(/app\.put\('\/api\/app\/datos-celular', sesion\.requerirSesion/.test(server) && /borrarDatosNegocio\(\)\.catch/.test(server), 'server.js: ajustes protegidos por sesión y, al apagar, se borra lo subido');
  assert(/appHooks\.datosCelularVivo = require\('\.\/datos-celular-vivo'\)/.test(leer('main', 'index.js')), 'index.js: el servicio de envío se inicia con la app');
  const perfiles = require('../main/perfiles');
  assert(perfiles.puede('propietario', 'PUT', '/api/app/datos-celular') === true && perfiles.puede('encargado', 'PUT', '/api/app/datos-celular') === false && perfiles.puede('encargado', 'GET', '/api/app/datos-celular') === false && perfiles.puede('empleado', 'GET', '/api/app/datos-celular') === false, 'solo el propietario puede activar o cambiar esta opción (encargado y empleado, no)');
  console.log('✅ datos-celular: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
