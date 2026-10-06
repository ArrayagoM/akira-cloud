// tests/gestion.test.js — importar/exportar productos y servicios: lectura de
// Excel/CSV/PDF-texto, detección de columnas, precios en formato argentino,
// validación fila por fila y combinación con lo existente.
'use strict';
const m = require('../main/gestion/mapeo');
const { leerArchivo, filasDeTexto } = require('../main/gestion/lector-archivos');
const { exportarXlsx, exportarCsv } = require('../main/gestion/exportador');

function assert(c, msg) { if (!c) throw new Error('FAIL: ' + msg); console.log('  ✅ ' + msg); }

(async () => {
  console.log('\n[gestion] Tests:');

  // ── precios, stock, duraciones ──
  assert(m.parsearPrecio('$ 1.234,50') === 1234.5, 'precio "$ 1.234,50" → 1234.5');
  assert(m.parsearPrecio('1.500') === 1500, 'precio "1.500" → 1500 (punto de miles)');
  assert(m.parsearPrecio('1,234.50') === 1234.5, 'precio "1,234.50" → 1234.5');
  assert(m.parsearPrecio('8500') === 8500 && m.parsearPrecio(8500) === 8500, 'precio simple y numérico');
  assert(m.parsearPrecio('12,5') === 12.5, 'precio "12,5" → 12.5');
  assert(m.parsearPrecio('USD 15') === 15, 'precio con texto "USD 15" → 15');
  assert(m.parsearPrecio('') === null && m.parsearPrecio('gratis') === null && m.parsearPrecio('-5') === null, 'precio vacío, texto o negativo → null');
  assert(m.parsearDuracion('45') === 45 && m.parsearDuracion('45 min') === 45, 'duración "45" y "45 min"');
  assert(m.parsearDuracion('1h 30') === 90 && m.parsearDuracion('1,5 h') === 90 && m.parsearDuracion('01:30') === 90, 'duración "1h 30", "1,5 h" y "01:30" → 90');
  assert(m.parsearDuracion('') === null && m.parsearDuracion('rápido') === null, 'duración vacía o texto → null');

  // ── detección de columnas ──
  const cols = ['Artículo', 'Precio venta', 'Rubro', 'Cant.', 'Obs'];
  const filas = [['Shampoo', '8.500', 'Capilar', 12, ''], ['Cera', '6.200', 'Styling', 5, '']];
  const map = m.sugerirMapeo('productos', cols, filas);
  assert(map.nombre === 0 && map.precio === 1 && map.categoria === 2, 'reconoce Artículo→nombre, Precio venta→precio, Rubro→categoría');
  const sinEncabezado = m.sugerirMapeo('productos', ['Columna 1', 'Columna 2'], [['Corte', '7000'], ['Barba', '3000'], ['Tintura', '15000']]);
  assert(sinEncabezado.nombre === 0 && sinEncabezado.precio === 1, 'sin encabezados: adivina por el contenido (texto → nombre, números → precio)');
  assert(m.sugerirTipo(['Servicio', 'Precio', 'Duración']) === 'servicios' && m.sugerirTipo(['Producto', 'Precio', 'Stock']) === 'productos', 'distingue planilla de servicios y de productos');

  // ── validación y combinación ──
  const existentes = [{ nombre: 'Shampoo', precio: 5000, categoria: 'Viejo', stock: 3, descripcion: 'x', moneda: 'ARS', fuente: 'wa_catalog', waProductId: 'abc' }];
  const crudas = [['shampoo', '8.500', 'Capilar', '12', ''], ['Cera', '6.200', 'Styling', '', ''], ['', '100', '', '', ''], ['Gel', 'consultar', '', '', ''], ['Cera', '6.500', '', '', ''], ['', '', '', '', '']];
  const fs = m.construirFilas('productos', crudas, { nombre: 0, precio: 1, categoria: 2, stock: 3, descripcion: 4 }, existentes);
  const est = fs.map((f) => f.estado).join(',');
  assert(est === 'actualiza,duplicado,error,error,nuevo', 'estados: shampoo existe→actualiza, cera repetida→duplicado, sin nombre→error, precio inválido→error, última cera→nuevo (la fila vacía se ignora). Salió: ' + est);
  assert(m.resumen(fs).errores === 2 && m.resumen(fs).actualizan === 1, 'el resumen cuenta bien errores y actualizaciones');

  const r = m.aplicarImportacion('productos', existentes, fs);
  assert(r.lista.length === 2 && r.actualizados === 1 && r.agregados === 1, 'agregar: actualiza Shampoo y suma Cera');
  assert(r.omitidos === 3, 'se omiten los 2 errores y el duplicado reemplazado por la última fila');
  const sh = r.lista.find((p) => p.nombre === 'shampoo');
  assert(sh.precio === 8500 && sh.waProductId === 'abc' && sh.fuente === 'wa_catalog', 'actualizar conserva los datos que no vienen en la planilla (id de WhatsApp, fuente)');
  assert(r.lista.find((p) => p.nombre === 'Cera').precio === 6500, 'ante una fila repetida queda la última');
  const rr = m.aplicarImportacion('productos', existentes, fs, { modo: 'reemplazar' });
  assert(!rr.lista.some((p) => p.categoria === 'Viejo') && rr.lista.length === 2, 'reemplazar descarta lo anterior y usa solo lo importado');
  const rx = m.aplicarImportacion('productos', existentes, fs, { excluir: [5] });
  assert(!rx.lista.some((p) => p.nombre === 'Cera' && p.precio === 6500), 'se pueden excluir filas puntuales');

  const serv = m.construirFilas('servicios', [['Corte', '7000', '30'], ['Tintura', '28.000', '1h 30'], ['Barba', '3000', '']], { nombre: 0, precio: 1, duracion: 2 }, []);
  assert(serv[0].dato.duracion === 30 && serv[1].dato.duracion === 90 && serv[2].dato.duracion === 60, 'servicios: duración en minutos, 60 por defecto');

  // ── texto de PDF / foto ──
  const f = filasDeTexto('LISTA DE PRECIOS 2026\nCorte de pelo ........ $ 7.000\nBarba    3.500\nTintura completa - 28.000,00\nTel: 2241 123456\nTotal 38500\nsolo texto sin precio');
  assert(f.length === 3 && f[0][0] === 'Corte de pelo' && f[0][1] === '7.000' && f[2][1] === '28.000,00', 'del texto de un PDF/foto saca "nombre … precio" por línea y descarta títulos, teléfonos y totales. Salió: ' + JSON.stringify(f));

  // ── PDF real (lista de precios) ──
  const pdf = await leerArchivo({ buffer: require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'lista-precios.pdf')), nombre: 'precios.pdf' });
  assert(pdf.origen === 'pdf' && pdf.hojas[0].filas.length === 3 && pdf.hojas[0].filas[0][0] === 'Corte de pelo' && pdf.hojas[0].filas[2][1] === '28.000,00', 'lee una lista de precios en PDF real: 3 ítems, sin título ni teléfono');
  const filasPdf = m.construirFilas('servicios', pdf.hojas[0].filas, { nombre: 0, precio: 1 }, []);
  assert(filasPdf.every((x) => x.estado === 'nuevo') && filasPdf[2].dato.precio === 28000, 'los precios del PDF quedan como números válidos');
  const docs = require('../main/gestion/pdf-texto');
  const comp = await docs.textoDePdf(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'comprobante.pdf')));
  assert(/Importe: \$ 15\.000,00/.test(comp), 'conserva las líneas de un comprobante en PDF');
  let errPdf = ''; try { await leerArchivo({ buffer: Buffer.from('%PDF-1.4 roto'), nombre: 'x.pdf' }); } catch (e) { errPdf = e.message; }
  assert(errPdf === '' || /PDF|archivo/i.test(errPdf), 'un PDF dañado no rompe nada');

  // ── ida y vuelta Excel / CSV ──
  const lista = [{ nombre: 'Shampoo "pro"', precio: 8500.5, categoria: 'Capilar; cuidado', stock: 12, descripcion: 'Línea\nprofesional' }, { nombre: '=SUMA(1)', precio: 100, categoria: '', stock: -1, descripcion: '' }];
  const xlsx = await exportarXlsx('productos', lista);
  const leido = await leerArchivo({ buffer: xlsx, nombre: 'productos.xlsx' });
  const hoja = leido.hojas[0];
  assert(leido.origen === 'excel' && hoja.columnas[0] === 'Nombre' && hoja.filas.length === 2, 'lo exportado a .xlsx se puede volver a leer');
  const mp = m.sugerirMapeo('productos', hoja.columnas, hoja.filas);
  const vuelta = m.construirFilas('productos', hoja.filas, mp, []);
  assert(vuelta[0].dato.precio === 8500.5 && vuelta[0].dato.stock === 12 && vuelta[1].dato.stock === -1, 'ida y vuelta por Excel conserva precios, stock y "sin control"');
  assert(vuelta[0].dato.nombre === 'Shampoo "pro"' && vuelta[0].dato.categoria === 'Capilar; cuidado', 'conserva comillas y punto y coma');

  const csv = exportarCsv('productos', lista);
  assert(csv.toString('utf8').startsWith('﻿Nombre;Precio;Categor'), 'el CSV lleva BOM, separador ";" y encabezados');
  assert(csv.toString('utf8').includes("'=SUMA(1)"), 'el CSV neutraliza celdas que empiezan con "=" (inyección de fórmulas)');
  const lc = await leerArchivo({ buffer: csv, nombre: 'productos.csv' });
  assert(lc.origen === 'csv' && lc.hojas[0].filas.length === 2 && lc.hojas[0].filas[0][0] === 'Shampoo "pro"', 'el CSV exportado se vuelve a leer (comillas, saltos de línea y ";" dentro de celdas)');

  const latin = Buffer.from('Producto;Precio\r\nCafé;1500\r\nPiña;2.000\r\n', 'latin1');
  const ll = await leerArchivo({ buffer: latin, nombre: 'viejo.csv' });
  assert(ll.hojas[0].filas[0][0] === 'Café' && ll.hojas[0].filas[1][0] === 'Piña', 'lee CSV viejos en codificación Latin-1 con tildes');

  const plantilla = await exportarXlsx('servicios', [], { plantilla: true });
  const lp = await leerArchivo({ buffer: plantilla, nombre: 'plantilla.xlsx' });
  assert(lp.hojas.length === 2 && lp.hojas[0].filas.length === 2, 'la plantilla trae ejemplos y una hoja de ayuda');

  // ── errores entendibles ──
  for (const [buf, nom, patron] of [[Buffer.from('x'), 'a.xls', /xls viejos/], [Buffer.from('hola'), 'a.exe', /Formato no soportado/], [Buffer.alloc(0), 'a.csv', /vacío/], [Buffer.from('PK\u0003\u0004basura'), 'a.xlsx', /No pude leer/]]) {
    let err = ''; try { await leerArchivo({ buffer: buf, nombre: nom }); } catch (e) { err = e.message; }
    assert(patron.test(err), `error claro para ${nom}: "${err}"`);
  }

  console.log('\n✅ Todos los tests de gestion pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
