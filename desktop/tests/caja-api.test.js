// tests/caja-api.test.js — rutas de la Caja contra la base local: mes con turnos
// cobrados + movimientos manuales, validaciones, vínculo con documentos,
// importación desde Excel con deshacer, exportación y aislamiento entre usuarios.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-caja-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[caja-api] Tests:');
  const Turno = require('../main/bot-engine/models/Turno');
  const Documento = require('../main/bot-engine/models/Documento');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const ExcelJS = require('exceljs');

  let usuario = 'u1';
  const sesion = (req, _r, next) => { req.user = { _id: usuario }; next(); };
  const app = express();
  const jsonGeneral = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path === '/api/gestion/analizar' ? next() : jsonGeneral(req, res, next)));
  const deps = { botService: { recargarConfig: () => true }, requerirSesion: sesion, userDataDir: dir };
  app.use('/api/caja', require('../main/local-api/routes/caja.routes')(deps));
  app.use('/api/gestion', require('../main/local-api/routes/gestion.routes')(deps));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (p, body, method) => { const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})), r }; };

  const hoy = new Date(); const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`;
  const turno = (extra) => Turno.create({ userId: 'u1', calendarId: 'principal', fechaInicio: new Date(hoy.getFullYear(), hoy.getMonth(), 15, 10, 0), fechaFin: new Date(hoy.getFullYear(), hoy.getMonth(), 15, 11, 0), resumen: 'Turno — Ana', clienteNombre: 'Ana', clienteTelefono: '5492241111111', ...extra });
  await turno({ estado: 'confirmado', pago: { monto: 7000, metodo: 'mercadopago' } });
  await Turno.create({ userId: 'u1', calendarId: 'principal', fechaInicio: new Date(hoy.getFullYear() + 1, 0, 10, 10), fechaFin: new Date(hoy.getFullYear() + 1, 0, 10, 11), resumen: 'Turno — Luis', clienteNombre: 'Luis', estado: 'pendiente', pago: { monto: 3000, metodo: 'mercadopago' } });

  let r = await j(`/caja?mes=${mes}`);
  assert(r.status === 200 && r.body.resumen.ingresos === 7000 && r.body.movimientos.length === 1 && r.body.movimientos[0].origen === 'turno', 'el mes arranca con el ingreso del turno cobrado');
  assert(r.body.porCobrar.total === 3000, 'muestra lo que falta cobrar (turno pendiente a futuro)');
  assert(r.body.categorias.gasto.includes('Alquiler'), 'ofrece categorías de gasto sugeridas');

  r = await j('/caja/movimiento', { tipo: 'gasto', monto: 15000.5, fecha: dia(5), categoria: 'Alquiler', descripcion: 'Octubre', metodo: 'transferencia' });
  assert(r.status === 200 && r.body.movimiento._id, 'carga un gasto manual');
  const idGasto = r.body.movimiento._id;
  await j('/caja/movimiento', { tipo: 'ingreso', monto: 2000, fecha: dia(6), categoria: 'Ventas', metodo: 'efectivo' });
  r = await j(`/caja?mes=${mes}`);
  assert(r.body.resumen.ingresos === 9000 && r.body.resumen.gastos === 15000.5 && r.body.resumen.resultado === -6000.5, 'el resumen suma turnos + movimientos manuales');
  assert(r.body.movimientos[0].fecha >= r.body.movimientos[r.body.movimientos.length - 1].fecha, 'los movimientos vienen ordenados del más nuevo al más viejo');
  assert((await j('/caja?mes=2020-01')).body.movimientos.length === 0, 'otro mes sin datos viene vacío');
  assert((await j('/caja?mes=basura')).body.mes === mes, 'un mes inválido cae al mes actual');

  assert((await j('/caja/movimiento', { tipo: 'gasto', monto: 0 })).status === 400, 'rechaza un monto en cero');
  assert((await j('/caja/movimiento', { tipo: 'gasto', monto: 5, fecha: '2026-02-30' })).status === 400, 'rechaza una fecha imposible');

  r = await j(`/caja/movimiento/${idGasto}`, { monto: 16000, descripcion: 'Octubre (ajustado)' }, 'PUT');
  assert(r.status === 200 && (await Movimiento.findById(idGasto).lean()).monto === 16000, 'edita un movimiento manual');
  const idTurno = (await j(`/caja?mes=${mes}`)).body.movimientos.find((m) => m.origen === 'turno')._id;
  assert((await j(`/caja/movimiento/${idTurno}`, { monto: 1 }, 'PUT')).status === 400 && (await j(`/caja/movimiento/${idTurno}`, null, 'DELETE')).status === 400, 'un ingreso de turno no se edita ni se borra desde la Caja');

  // desde un comprobante de la bandeja
  const doc = await Documento.create({ userId: 'u1', jid: 'a@s', nombreOriginal: 'c.png', mimetype: 'image/png', ruta: 'x', estado: 'nuevo', tipo: 'comprobante' });
  r = await j('/caja/movimiento', { tipo: 'ingreso', monto: 4500, fecha: dia(7), categoria: 'Ventas', metodo: 'transferencia', documentoId: String(doc._id) });
  assert(r.status === 200 && (await Documento.findById(doc._id).lean()).estado === 'revisado', 'registrar un comprobante en la Caja lo marca como revisado');
  assert((await j('/caja/movimiento', { tipo: 'ingreso', monto: 4500, fecha: dia(7), documentoId: String(doc._id) })).status === 409, 'el mismo comprobante no se puede registrar dos veces');
  assert((await j('/caja/movimiento', { tipo: 'ingreso', monto: 1, documentoId: 'inexistente' })).status === 404, 'un documento que no existe se rechaza');
  const ajeno = await Documento.create({ userId: 'otro', jid: 'b@s', nombreOriginal: 'c.png', mimetype: 'image/png', ruta: 'x', estado: 'nuevo' });
  assert((await j('/caja/movimiento', { tipo: 'ingreso', monto: 1, documentoId: String(ajeno._id) })).status === 404, 'no se puede usar el documento de otro usuario');

  // importar gastos desde Excel
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Gastos');
  ws.addRows([['Fecha', 'Detalle', 'Importe', 'Forma de pago'], [dia(10), 'Luz', '$ 8.200,50', 'Transferencia'], [dia(11), 'Café', 1200, 'Efectivo'], ['32/13/2026', 'Mal', 5, ''], [dia(5), 'Octubre (ajustado)', 16000, 'transferencia']]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  r = await j('/gestion/analizar', { nombre: 'gastos.xlsx', base64: buf.toString('base64') });
  const { importacionId } = r.body; const mapeo = { ...r.body.hojas[0].mapeoSugerido.movimientos, tipoPorDefecto: 'gasto' };
  assert(mapeo.fecha === 0 && mapeo.monto === 2, 'el asistente detecta Fecha e Importe en la planilla de gastos');
  r = await j('/gestion/previsualizar', { importacionId, hoja: 0, tipo: 'movimientos', mapeo });
  assert(r.body.resumen.nuevos === 2 && r.body.resumen.errores === 1 && r.body.resumen.duplicados === 1, 'vista previa: 2 nuevos, 1 error de fecha y 1 que ya estaba cargado');
  assert((await j('/gestion/previsualizar', { importacionId, hoja: 0, tipo: 'movimientos', mapeo: { fecha: 0 } })).status === 400, 'sin la columna de monto avisa qué falta');
  const antes = (await Movimiento.find({ userId: 'u1' }).lean()).length;
  r = await j('/gestion/confirmar', { importacionId, hoja: 0, tipo: 'movimientos', mapeo, modo: 'reemplazar' });
  assert(r.status === 200 && r.body.agregados === 2, 'confirmar suma los 2 gastos (aunque se pida "reemplazar" nunca borra la Caja)');
  assert((await Movimiento.find({ userId: 'u1' }).lean()).length === antes + 2, 'los movimientos anteriores siguen ahí');
  const deshacerId = r.body.deshacerId;
  r = await j('/gestion/deshacer', { deshacerId });
  assert(r.status === 200 && (await Movimiento.find({ userId: 'u1' }).lean()).length === antes, 'deshacer saca solo lo importado y deja el resto de la Caja intacto');

  // exportar
  const x = await fetch(`${base}/caja/exportar?mes=${mes}&formato=xlsx`);
  const wbx = new ExcelJS.Workbook(); await wbx.xlsx.load(Buffer.from(await x.arrayBuffer()));
  assert(x.status === 200 && wbx.worksheets.map((w) => w.name).join() === 'Movimientos,Resumen' && wbx.getWorksheet('Movimientos').rowCount >= 4, 'Excel con hojas Movimientos y Resumen');
  const c = await fetch(`${base}/caja/exportar?mes=${mes}&formato=csv`); const cbuf = Buffer.from(await c.arrayBuffer()); const csv = cbuf.toString('utf8');
  assert(c.status === 200 && cbuf[0] === 0xef && cbuf[1] === 0xbb && csv.includes('Fecha;Tipo;Categoría') && csv.includes('Alquiler'), 'CSV con BOM, separador ";" y los movimientos del mes');
  const p = await fetch(`${base}/caja/exportar?mes=${mes}&formato=pdf`); const pdf = Buffer.from(await p.arrayBuffer());
  assert(p.status === 200 && pdf.slice(0, 4).toString() === '%PDF' && pdf.length > 1500, 'PDF de resumen mensual válido');
  const txt = await require('../main/gestion/pdf-texto').textoDePdf(pdf);
  assert(/Resumen de caja/.test(txt) && /Alquiler/.test(txt) && /Resultado del mes/.test(txt), 'el PDF trae el título, el resultado y el detalle');

  // aislamiento
  usuario = 'u2';
  r = await j(`/caja?mes=${mes}`);
  assert(r.body.movimientos.length === 0 && r.body.resumen.ingresos === 0, 'otro usuario ve su Caja vacía');
  assert((await j(`/caja/movimiento/${idGasto}`, null, 'DELETE')).status === 404, 'otro usuario no puede borrar mis movimientos');
  usuario = 'u1';
  assert((await j(`/caja/movimiento/${idGasto}`, null, 'DELETE')).status === 200, 'el dueño sí puede borrar su movimiento');

  srv.close();
  console.log('\n✅ Todos los tests de caja-api pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
