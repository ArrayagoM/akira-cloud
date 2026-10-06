// gestion/exportador.js
// Genera Excel (.xlsx) y CSV a partir de productos/servicios, y plantillas con
// ejemplos para que el usuario solo tenga que completarlas.
'use strict';

const COLUMNAS = {
  productos: [
    { header: 'Nombre', key: 'nombre', width: 34 },
    { header: 'Precio', key: 'precio', width: 14, formato: '"$"#,##0.00' },
    { header: 'Categoría', key: 'categoria', width: 20 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Descripción', key: 'descripcion', width: 44 },
  ],
  servicios: [
    { header: 'Nombre', key: 'nombre', width: 34 },
    { header: 'Precio', key: 'precio', width: 14, formato: '"$"#,##0.00' },
    { header: 'Duración (min)', key: 'duracion', width: 16 },
  ],
};

const EJEMPLOS = {
  productos: [
    { nombre: 'Shampoo reparador 500 ml', precio: 8500, categoria: 'Cuidado capilar', stock: 12, descripcion: 'Para cabello dañado' },
    { nombre: 'Cera modeladora', precio: 6200, categoria: 'Styling', stock: '', descripcion: '' },
  ],
  servicios: [
    { nombre: 'Corte de pelo', precio: 7000, duracion: 30 },
    { nombre: 'Coloración completa', precio: 28000, duracion: 120 },
  ],
};

// Antes de volcar a la planilla: stock -1 ("sin control") queda vacío.
const aFila = (tipo, e) => (tipo === 'productos'
  ? { nombre: e.nombre, precio: e.precio, categoria: e.categoria || '', stock: e.stock >= 0 ? e.stock : '', descripcion: e.descripcion || '' }
  : { nombre: e.nombre, precio: e.precio, duracion: e.duracion || 60 });

// Solo para CSV: evita que Excel interprete una celda como fórmula (=, +, -, @) al abrir texto de terceros.
const seguro = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

async function exportarXlsx(tipo, lista, { plantilla = false } = {}) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Akira';
  const ws = wb.addWorksheet(tipo === 'productos' ? 'Productos' : 'Servicios', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNAS[tipo].map(({ header, key, width }) => ({ header, key, width }));
  const filas = plantilla ? EJEMPLOS[tipo] : lista.map((e) => aFila(tipo, e));
  for (const f of filas) ws.addRow(f); // en .xlsx el texto nunca se evalúa como fórmula
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FF000000' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00E87B' } };
  COLUMNAS[tipo].forEach((c, i) => { if (c.formato) ws.getColumn(i + 1).numFmt = c.formato; });
  if (plantilla) {
    const ayuda = wb.addWorksheet('Cómo completar');
    ayuda.getColumn(1).width = 90;
    [
      'Completá una fila por cada ' + (tipo === 'productos' ? 'producto' : 'servicio') + '. Podés borrar las filas de ejemplo.',
      'Nombre y Precio son obligatorios.',
      tipo === 'productos' ? 'Stock: dejalo vacío si no querés controlar la cantidad.' : 'Duración: en minutos (30, 45, 90) o "1h 30". Si la dejás vacía se usan 60 minutos.',
      'Después, en Akira → Catálogo → Importar, elegí este archivo.',
    ].forEach((t) => ayuda.addRow([t]));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// CSV pensado para Excel en español: separador ";" y BOM UTF-8 (para que se vean las tildes).
function exportarCsv(tipo, lista, { plantilla = false } = {}) {
  const cols = COLUMNAS[tipo];
  const esc = (v) => { const s = String(seguro(v) ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = plantilla ? EJEMPLOS[tipo] : lista.map((e) => aFila(tipo, e));
  const lineas = [cols.map((c) => esc(c.header)).join(';'), ...filas.map((f) => cols.map((c) => esc(f[c.key])).join(';'))];
  return Buffer.from('﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
}

module.exports = { exportarXlsx, exportarCsv, COLUMNAS };
