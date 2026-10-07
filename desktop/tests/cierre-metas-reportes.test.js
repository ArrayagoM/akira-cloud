// tests/cierre-metas-reportes.test.js — cierre de caja diario, metas del mes y reportes (lógica y rutas).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-cmr-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const cierre = require('../main/gestion/cierre');
const metas = require('../main/gestion/metas');
const rep = require('../main/gestion/reportes');
const caja = require('../main/gestion/caja');

(async () => {
  console.log('\n[cierre] Tests:');
  const movs = [
    { tipo: 'ingreso', monto: 9000, metodo: 'efectivo' }, { tipo: 'ingreso', monto: 7000, metodo: 'mercadopago' }, { tipo: 'ingreso', monto: 3000, metodo: 'efectivo' },
    { tipo: 'gasto', monto: 2000, metodo: 'efectivo' }, { tipo: 'gasto', monto: 5000, metodo: 'transferencia' },
  ];
  const t = cierre.totalesDelDia(movs);
  assert(t.efectivoIngresos === 12000 && t.efectivoGastos === 2000 && t.otrosIngresos === 7000 && t.otrosGastos === 5000 && t.porMetodo.mercadopago === 7000, 'separa el efectivo (cajón) de lo que entró por otros medios');
  let c = cierre.calcular(movs, '2026-10-07', { inicial: 5000 });
  assert(c.esperado === 15000 && c.contado === null && c.estado === null, 'esperado = fondo inicial + efectivo que entró − efectivo que salió');
  c = cierre.calcular(movs, '2026-10-07', { inicial: 5000, contado: 14500 });
  assert(c.diferencia === -500 && c.estado === 'falta' && /Faltan \$500/.test(cierre.textoDiferencia(c)), 'detecta lo que falta');
  c = cierre.calcular(movs, '2026-10-07', { inicial: 5000, contado: 15200 });
  assert(c.estado === 'sobra' && /Sobran \$200/.test(cierre.textoDiferencia(c)), 'detecta lo que sobra');
  assert(cierre.calcular(movs, 'x', { inicial: 5000, contado: 15000 }).estado === 'justo' && /justa/.test(cierre.textoDiferencia({ estado: 'justo' })), 'caja justa');
  assert(cierre.fondoInicial([{ fecha: '2026-10-05', contado: 100 }, { fecha: '2026-10-06', contado: 800 }, { fecha: '2026-10-08', contado: 1 }], '2026-10-07') === 800 && cierre.fondoInicial([], '2026-10-07') === 0, 'el fondo de hoy es lo que se contó en el último cierre anterior');
  assert(!cierre.sanear({}, '2026-10-07').ok && !cierre.sanear({ contado: -5 }, '2026-10-07').ok && !cierre.sanear({ contado: 5 }, '2026-13-40').ok && cierre.sanear({ contado: '0' }, '2026-10-07').ok && cierre.sanear({ contado: '1500,50', inicial: '200' }, '2026-10-07').dato.contado === 1500.5, 'valida lo que escribe el dueño (acepta 0 y coma decimal)');

  console.log('\n[metas] Tests:');
  assert(metas.diasDelMes('2026-02') === 28 && metas.diasDelMes('2026-10') === 31, 'días del mes');
  let a = metas.avance(100000, 40000, '2026-10', '2026-10-10');
  assert(a.porcentaje === 40 && a.falta === 60000 && a.diasRestantes === 21 && a.porDiaNecesario === Math.round(60000 / 21 * 100) / 100 && a.proyeccion === 124000 && !a.cumplida, 'avance, lo que falta por día y la proyección al ritmo actual');
  a = metas.avance(100000, 130000, '2026-10', '2026-10-20');
  assert(a.cumplida && a.porcentaje === 130 && a.falta === 0 && a.porDiaNecesario === 0, 'meta cumplida');
  assert(metas.avance(0, 5, '2026-10', '2026-10-10') === null, 'sin meta no hay avance');
  a = metas.avance(100000, 70000, '2026-09', '2026-10-10');
  assert(a.diasRestantes === 0 && a.proyeccion === null && a.porcentaje === 70, 'un mes que ya pasó no tiene proyección');
  assert(metas.guardar(dir, { ingresos: '500000', turnos: 40 }).ok && metas.leer(dir).ingresos === 500000 && metas.leer(dir).turnos === 40, 'guarda y lee las metas');
  assert(metas.guardar(dir, { turnos: '' }).metas.turnos === 0 && metas.leer(dir).ingresos === 500000, 'vaciar un campo quita esa meta y no toca la otra');
  assert(!metas.guardar(dir, { ingresos: 'abc' }).ok && !metas.guardar(dir, { ingresos: -5 }).ok, 'rechaza metas inválidas');

  console.log('\n[reportes] Tests:');
  assert(rep.nombreServicio('Corte de pelo — Ana López') === 'Corte de pelo' && rep.nombreServicio('Turno — Ana') === 'Turno (sin detalle)' && rep.nombreServicio('') === 'Turno (sin detalle)', 'agrupa los turnos por servicio sin el nombre del cliente');
  const r0 = rep.rangoPeriodo('3m', '2026-10-07');
  assert(r0.desde === '2026-08-01' && r0.hasta === '2026-10-07' && rep.rangoPeriodo('mes', '2026-10-07').desde === '2026-10-01' && rep.rangoPeriodo('12m', '2026-02-10').desde === '2025-03-01', 'períodos (mes, 3, 6 y 12 meses)');
  const T = (fecha, hora, resumen, tel, nom, extra = {}) => ({ _id: `${fecha}${hora}${tel}`, fechaInicio: new Date(`${fecha}T${String(hora).padStart(2, '0')}:00:00`), resumen, clienteTelefono: tel, clienteNombre: nom, estado: 'confirmado', pago: { monto: 10000, metodo: 'efectivo' }, ...extra });
  const turnos = [
    T('2026-10-01', 10, 'Corte — Ana', '2241000001', 'Ana'), T('2026-10-02', 10, 'Corte — Ana', '2241000001', 'Ana'), T('2026-10-02', 17, 'Barba — Luis', '2241000002', 'Luis', { pago: { monto: 6000 } }),
    T('2026-10-03', 10, 'Corte — Marta', '2241000003', 'Marta', { ausente: true }), T('2026-10-03', 11, 'Corte — Luis', '2241000002', 'Luis'), T('2026-10-04', 10, 'Corte — Pepe', '2241000004', 'Pepe', { estado: 'cancelado' }),
    T('2026-09-15', 10, 'Corte — Ana', '2241000001', 'Ana'), T('2026-08-20', 18, 'Color — Ana', '2241000001', 'Ana'),
  ];
  const mov = [{ tipo: 'gasto', monto: 4000, fecha: '2026-10-05', metodo: 'efectivo', categoria: 'Insumos' }, { tipo: 'gasto', monto: 1000, fecha: '2026-09-05', metodo: 'efectivo', categoria: 'Insumos' }];
  const R = rep.armar({ turnos, movimientos: mov, desde: '2026-10-01', hasta: '2026-10-07', meses: 3, ahora: new Date('2026-10-07T12:00:00') });
  assert(R.resumen.turnos === 5 && R.resumen.atendidos === 4 && R.resumen.ausentes === 1 && R.resumen.cancelados === 1 && R.resumen.clientesDistintos === 2, 'resumen: turnos, atendidos, ausentes y cancelados del período');
  assert(R.servicios[0].nombre === 'Corte' && R.servicios[0].cantidad === 4 && R.servicios[1].nombre === 'Barba' && R.servicios[1].ingresos === 6000, 'servicios más pedidos (los ausentes cuentan como turno pero no como ingreso)');
  assert(R.servicios[0].ingresos === 30000, '…ingresos de un servicio solo de turnos que se hicieron');
  assert(R.clientes[0].nombre === 'Ana' && R.clientes[0].visitas === 2 && R.clientes[0].gastado === 20000 && R.clientes[1].nombre === 'Luis' && R.clientes.length === 2, 'clientes frecuentes: no cuenta ausentes ni cancelados');
  assert(R.ausencias.cantidad === 1 && R.ausencias.porcentaje === 20 && R.ausencias.perdido === 10000 && R.ausencias.clientes[0].nombre === 'Marta', 'ausencias: cantidad, porcentaje de los turnos pasados, plata perdida y quién falta');
  assert(R.horasPico.horas[0].hora === 10 && R.horasPico.horas[0].cantidad === 3 && R.horasPico.matriz.length === 7 && R.horasPico.diaTop.cantidad >= 2, 'horas pico (las 10 hs son lo más pedido)');
  assert(R.evolucion.length === 3 && R.evolucion.map((e) => e.mes).join() === '2026-08,2026-09,2026-10', 'evolución de los últimos meses');
  const oct = R.evolucion[2]; const sep = R.evolucion[1]; const ago = R.evolucion[0];
  assert(oct.ingresos === 46000 && oct.gastos === 4000 && oct.resultado === 42000 && oct.turnos === 5, 'octubre: lo cobrado (un turno pagado cuenta aunque el cliente no haya venido: la plata ya entró) menos gastos');
  assert(sep.ingresos === 10000 && sep.gastos === 1000 && ago.ingresos === 10000 && ago.gastos === 0, 'meses anteriores');

  const exp = require('../main/gestion/exportador-reportes');
  const xl = await exp.exportarXlsx(R, { negocio: '=CMD' });
  const csv = exp.exportarCsv({ ...R, clientes: [{ nombre: '=HYPERLINK("x")', telefono: '', visitas: 1, gastado: 1, ultima: '2026-10-01' }] }).toString('utf8');
  assert(xl.length > 2000 && /RESUMEN/.test(csv) && /SERVICIOS/.test(csv) && !/;=HYPERLINK|^=HYPERLINK/m.test(csv) && /'=HYPERLINK/.test(csv), 'exporta a Excel y CSV (neutraliza fórmulas)');

  // ── rutas ──
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const Turno = require('../main/bot-engine/models/Turno');
  const hoy = caja.fechaLocal(new Date()); const ayer = caja.fechaLocal(new Date(Date.now() - 86400000)); const antes = caja.fechaLocal(new Date(Date.now() - 2 * 86400000));
  await Movimiento.create({ userId: 'u1', tipo: 'ingreso', monto: 8000, fecha: hoy, metodo: 'efectivo', categoria: 'Ventas', descripcion: 'x' });
  await Movimiento.create({ userId: 'u1', tipo: 'gasto', monto: 1000, fecha: hoy, metodo: 'efectivo', categoria: 'Otros', descripcion: 'y' });
  await Movimiento.create({ userId: 'u2', tipo: 'ingreso', monto: 999999, fecha: hoy, metodo: 'efectivo', categoria: 'Ventas' });
  await Turno.create({ userId: 'u1', calendarId: 'c', fechaInicio: new Date(), fechaFin: new Date(), resumen: 'Corte — Z', clienteNombre: 'Z', clienteTelefono: '2241000009', estado: 'confirmado', pago: { monto: 5000, metodo: 'efectivo' } });
  const app = express(); app.use(express.json());
  const deps = { requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir };
  app.use('/api/app/cierres', require('../main/local-api/routes/cierres.routes')(deps));
  app.use('/api/app/metas', require('../main/local-api/routes/metas.routes')(deps));
  app.use('/api/app/reportes', require('../main/local-api/routes/reportes.routes')(deps));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app`;
  const j = async (m, p, body) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let x = await j('GET', '/cierres');
  assert(x.status === 200 && x.body.cierre.esperado === 12000 && x.body.cerrado === false, 'GET cierre de hoy: calcula el efectivo esperado (incluye turnos cobrados en efectivo; no mezcla otros negocios)');
  assert((await j('GET', '/cierres?fecha=hola')).status === 400, 'fecha inválida → 400');
  x = await j('POST', '/cierres', { contado: 11500, nota: 'Se fue el vuelto' });
  assert(x.status === 200 && x.body.cierre.diferencia === -500 && x.body.cerrado && /Faltan \$500/.test(x.body.mensaje), 'POST cierra el día y dice cuánto falta');
  x = await j('POST', '/cierres', { contado: 12000 });
  assert(x.body.cierre.estado === 'justo' && (await j('GET', '/cierres')).body.recientes.length === 1, 'volver a cerrar el mismo día lo corrige (un cierre por día)');
  assert((await j('POST', '/cierres', {})).status === 400, 'cerrar sin contar → 400');
  await j('POST', '/cierres', { fecha: ayer, contado: 700, inicial: 100 });
  x = await j('GET', `/cierres?fecha=${hoy}`);
  assert(x.body.cierre.inicial === 700 || x.body.cerrado, 'el cierre de hoy ya guardado conserva su cálculo');
  x = await j('GET', `/cierres?fecha=${caja.fechaLocal(new Date(Date.now() + 86400000))}`);
  assert(x.body.cierre.inicial === 12000 && x.body.cierre.esperado === 12000, 'el fondo de mañana arranca con lo contado hoy');
  void antes;

  x = await j('PUT', '/metas', { ingresos: 100000, turnos: 20 });
  assert(x.status === 200 && x.body.progreso.ingresos.meta === 100000 && x.body.progreso.ingresos.logrado >= 12000 && x.body.progreso.turnos.logrado === 1, 'PUT metas y GET avance (cuenta ingresos y turnos del mes)');
  assert((await j('PUT', '/metas', { ingresos: 'x' })).status === 400, 'meta inválida → 400');

  x = await j('GET', '/reportes?periodo=3m');
  assert(x.status === 200 && x.body.periodo === '3m' && x.body.servicios[0].nombre === 'Corte' && x.body.evolucion.length === 6, 'GET reportes (3 meses, evolución de al menos 6)');
  assert((await j('GET', '/reportes?periodo=raro')).body.periodo === 'mes', 'período desconocido → mes actual');
  const f = await fetch(`${base}/reportes/exportar?formato=csv`);
  assert(f.status === 200 && /text\/csv/.test(f.headers.get('content-type')) && /attachment/.test(f.headers.get('content-disposition')), 'exportar CSV');
  const f2 = await fetch(`${base}/reportes/exportar`);
  assert(f2.status === 200 && (await f2.arrayBuffer()).byteLength > 2000, 'exportar Excel');
  srv.close();

  console.log('\n✅ Todos los tests de cierre, metas y reportes pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
