// tests/gestion-api.test.js — rutas de gestión: importar (analizar → previsualizar →
// confirmar → deshacer) y exportar productos/servicios contra la base local.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-gest-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[gestion-api] Tests:');
  const Config = require('../main/bot-engine/models/Config');
  const { exportarXlsx } = require('../main/gestion/exportador');

  let recargas = 0;
  const botService = { recargarConfig: () => { recargas++; return true; } };
  let usuario = 'u1';
  const app = express();
  const jsonGeneral = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path === '/api/gestion/analizar' ? next() : jsonGeneral(req, res, next)));
  app.use('/api/gestion', require('../main/local-api/routes/gestion.routes')({ botService, requerirSesion: (req, _r, next) => { req.user = { _id: usuario }; next(); }, userDataDir: dir }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/gestion`;
  const j = async (p, body, method) => { const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})), r }; };

  // catálogo previo con un producto que vino de WhatsApp
  let r = await j('/lista', { tipo: 'productos', lista: [{ nombre: 'Shampoo', precio: 5000, categoria: 'Viejo', fuente: 'wa_catalog', waProductId: 'abc' }] }, 'PUT');
  assert(r.status === 200 && r.body.lista.length === 1 && recargas >= 1, 'guardar la lista recarga el bot en caliente');

  // planilla del usuario con encabezados propios
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Lista');
  ws.addRows([['Artículo', 'Precio venta', 'Rubro', 'Cant.'], ['Shampoo', '$ 8.500', 'Capilar', 12], ['Cera', 6200, 'Styling', ''], ['Gel', 'consultar', '', ''], ['', '', '', '']]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  r = await j('/analizar', { nombre: 'mis precios.xlsx', base64: buf.toString('base64') });
  assert(r.status === 200 && r.body.origen === 'excel' && r.body.hojas[0].totalFilas === 3, 'analiza el Excel y cuenta las filas');
  const { importacionId } = r.body; const mapeo = r.body.hojas[0].mapeoSugerido.productos;
  assert(mapeo.nombre === 0 && mapeo.precio === 1 && mapeo.categoria === 2 && mapeo.stock === 3, 'sugiere las columnas solo (Artículo, Precio venta, Rubro, Cant.)');

  r = await j('/previsualizar', { importacionId, hoja: 0, tipo: 'productos', mapeo });
  assert(r.body.resumen.actualizan === 1 && r.body.resumen.nuevos === 1 && r.body.resumen.errores === 1, 'vista previa: 1 actualiza, 1 nuevo, 1 con error');
  assert(r.body.filas[2].errores[0].includes('consultar'), 'el error dice cuál es el valor inválido');

  r = await j('/previsualizar', { importacionId, hoja: 0, tipo: 'productos', mapeo: { nombre: 0 } });
  assert(r.status === 400 && /precio/i.test(r.body.error), 'sin columna de precio avisa claramente');

  r = await j('/confirmar', { importacionId, hoja: 0, tipo: 'productos', mapeo, modo: 'agregar' });
  assert(r.status === 200 && r.body.agregados === 1 && r.body.actualizados === 1 && r.body.omitidos === 1 && r.body.total === 2, 'confirmar: 1 agregado, 1 actualizado, 1 omitido');
  const deshacerId = r.body.deshacerId;
  let cfg = await Config.findOne({ userId: 'u1' });
  const sh = cfg.catalogo.find((p) => p.nombre === 'Shampoo');
  assert(sh.precio === 8500 && sh.waProductId === 'abc' && cfg.catalogo.length === 2, 'el catálogo del bot quedó actualizado y conserva el id de WhatsApp');
  assert((await j('/confirmar', { importacionId, hoja: 0, tipo: 'productos', mapeo })).status === 410, 'una importación ya confirmada no se puede repetir (410)');

  r = await j('/deshacer', { deshacerId });
  cfg = await Config.findOne({ userId: 'u1' });
  assert(r.status === 200 && cfg.catalogo.length === 1 && cfg.catalogo[0].precio === 5000, 'deshacer devuelve el catálogo a como estaba');
  assert((await j('/deshacer', { deshacerId })).status === 404, 'no se puede deshacer dos veces');

  // otro usuario no puede usar mi importación ni mi lista
  r = await j('/analizar', { nombre: 'a.xlsx', base64: buf.toString('base64') });
  usuario = 'u2';
  assert((await j('/previsualizar', { importacionId: r.body.importacionId, hoja: 0, tipo: 'productos', mapeo })).status === 410, 'otro usuario no puede usar una importación ajena');
  assert((await j('/lista?tipo=productos')).body.lista.length === 0, 'cada usuario ve solo su lista');
  usuario = 'u1';

  // servicios y reemplazo
  const wb2 = new ExcelJS.Workbook(); const w2 = wb2.addWorksheet('S'); w2.addRows([['Servicio', 'Valor', 'Duración'], ['Corte', 7000, '30'], ['Tintura', '28.000', '1h 30']]);
  const b2 = Buffer.from(await wb2.xlsx.writeBuffer());
  r = await j('/analizar', { nombre: 'servicios.xlsx', base64: b2.toString('base64') });
  assert(r.body.tipoSugerido === 'servicios', 'detecta que es una planilla de servicios por la columna Duración');
  const m2 = r.body.hojas[0].mapeoSugerido.servicios;
  r = await j('/confirmar', { importacionId: r.body.importacionId, hoja: 0, tipo: 'servicios', mapeo: m2, modo: 'reemplazar' });
  cfg = await Config.findOne({ userId: 'u1' });
  assert(r.status === 200 && cfg.serviciosList.length === 2 && cfg.serviciosList[1].duracion === 90 && cfg.serviciosList[1].precio === 28000, 'servicios importados con duración en minutos');

  // exportar
  const ex = await fetch(`${base}/exportar?tipo=servicios&formato=xlsx`);
  assert(ex.status === 200 && /spreadsheetml/.test(ex.headers.get('content-type')) && /servicios-\d{4}-\d{2}-\d{2}\.xlsx/.test(ex.headers.get('content-disposition')), 'exporta los servicios a .xlsx con nombre y fecha');
  const exCsv = await fetch(`${base}/exportar?tipo=productos&formato=csv`);
  assert(exCsv.status === 200 && (await exCsv.text()).includes('Nombre;Precio;Categoría;Stock;Descripción'), 'exporta los productos a CSV');
  const pl = await fetch(`${base}/plantilla?tipo=productos&formato=xlsx`);
  assert(pl.status === 200 && /plantilla-productos/.test(pl.headers.get('content-disposition')), 'descarga la plantilla de productos');

  // archivo inválido
  r = await j('/analizar', { nombre: 'virus.exe', base64: Buffer.from('MZ....').toString('base64') });
  assert(r.status === 400 && /Formato no soportado/.test(r.body.error), 'un archivo no soportado se rechaza con un mensaje claro');

  srv.close();
  console.log('\n✅ Todos los tests de gestion-api pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
