// gestion/exportador-caja.js
// Exporta la Caja de un mes: Excel (movimientos + resumen), CSV (movimientos) y
// un PDF de una o dos hojas para llevarle al contador.
'use strict';

const NOMBRES_METODO = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta', otro: 'Otro' };
const pesos = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fechaAR = (f) => f.split('-').reverse().join('/');
const seguro = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

const COLS = [
  { header: 'Fecha', key: 'fecha', width: 12 },
  { header: 'Tipo', key: 'tipo', width: 10 },
  { header: 'Categoría', key: 'categoria', width: 24 },
  { header: 'Descripción', key: 'descripcion', width: 44 },
  { header: 'Cliente', key: 'cliente', width: 22 },
  { header: 'Método', key: 'metodo', width: 15 },
  { header: 'Monto', key: 'monto', width: 16 },
];
const fila = (m) => ({ fecha: fechaAR(m.fecha), tipo: m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', categoria: m.categoria, descripcion: m.descripcion || '', cliente: m.cliente || '', metodo: NOMBRES_METODO[m.metodo] || m.metodo, monto: m.monto });

async function exportarXlsx({ mes, movimientos, resumen, negocio = '' }) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Akira';
  const ws = wb.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLS;
  const orden = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  orden.forEach((m) => ws.addRow(fila(m)));
  ws.getColumn('monto').numFmt = '"$"#,##0.00';
  const cab = ws.getRow(1); cab.font = { bold: true }; cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00E87B' } };

  const rs = wb.addWorksheet('Resumen');
  rs.columns = [{ width: 34 }, { width: 18 }];
  rs.addRow([`Caja — ${nombreMes(mes)}${negocio ? ` — ${negocio}` : ''}`]).font = { bold: true, size: 14 };
  rs.addRow([]);
  rs.addRow(['Ingresos', resumen.ingresos]); rs.addRow(['Gastos', resumen.gastos]);
  const r = rs.addRow(['Resultado', resumen.resultado]); r.font = { bold: true };
  rs.addRow([]); rs.addRow(['Ingresos por método de pago']).font = { bold: true };
  Object.entries(resumen.porMetodo).forEach(([k, v]) => rs.addRow([NOMBRES_METODO[k] || k, v]));
  rs.addRow([]); rs.addRow(['Gastos por categoría']).font = { bold: true };
  Object.entries(resumen.categoriasGasto).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => rs.addRow([k, v]));
  rs.getColumn(2).numFmt = '"$"#,##0.00';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function exportarCsv({ movimientos }) {
  const esc = (v) => { const s = String(seguro(v) ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const orden = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const lineas = [COLS.map((c) => esc(c.header)).join(';'), ...orden.map((m) => { const f = fila(m); return COLS.map((c) => esc(c.key === 'monto' ? String(f.monto).replace('.', ',') : f[c.key])).join(';'); })];
  return Buffer.from('﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
}

function exportarPdf({ mes, movimientos, resumen, negocio = '' }) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Caja ${nombreMes(mes)}`, Author: 'Akira' } });
    const partes = []; doc.on('data', (c) => partes.push(c)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    const ancho = doc.page.width - 80;
    const linea = () => { doc.moveTo(40, doc.y).lineTo(40 + ancho, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke(); doc.moveDown(0.4); };

    doc.fontSize(18).fillColor('#000').text(`Resumen de caja — ${nombreMes(mes)}`);
    if (negocio) doc.fontSize(11).fillColor('#555').text(negocio);
    doc.moveDown(0.8);

    const caja = (rotulo, valor, color) => { doc.fontSize(10).fillColor('#666').text(rotulo, { continued: false }); doc.fontSize(15).fillColor(color).text(pesos(valor)); doc.moveDown(0.3); };
    caja('Ingresos', resumen.ingresos, '#0a7d4b'); caja('Gastos', resumen.gastos, '#b3261e'); caja('Resultado del mes', resumen.resultado, resumen.resultado >= 0 ? '#0a7d4b' : '#b3261e');
    doc.moveDown(0.5);

    const bloque = (titulo, obj) => {
      const items = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      if (!items.length) return;
      doc.fontSize(12).fillColor('#000').text(titulo); linea();
      items.forEach(([k, v]) => { const y = doc.y; doc.fontSize(10).fillColor('#222').text(NOMBRES_METODO[k] || k, 40, y, { width: ancho - 120 }); doc.text(pesos(v), 40 + ancho - 120, y, { width: 120, align: 'right' }); });
      doc.moveDown(0.8);
    };
    bloque('Ingresos por método de pago', resumen.porMetodo);
    bloque('Gastos por categoría', resumen.categoriasGasto);

    doc.fontSize(12).fillColor('#000').text(`Detalle de movimientos (${movimientos.length})`); linea();
    const orden = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const m of orden) {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y = doc.y; const ing = m.tipo === 'ingreso';
      doc.fontSize(9).fillColor('#555').text(fechaAR(m.fecha), 40, y, { width: 58 });
      doc.fillColor('#222').text(`${m.categoria}${m.descripcion ? ` — ${m.descripcion}` : ''}`, 100, y, { width: ancho - 200, height: 24, ellipsis: true });
      doc.fillColor(ing ? '#0a7d4b' : '#b3261e').text(`${ing ? '' : '- '}${pesos(m.monto)}`, 40 + ancho - 100, y, { width: 100, align: 'right' });
      doc.y = Math.max(doc.y, y + 14);
    }
    doc.fontSize(8).fillColor('#888').text(`Generado por Akira el ${new Date().toLocaleDateString('es-AR')}`, 40, doc.page.height - 50, { align: 'center', width: ancho });
    doc.end();
  });
}

module.exports = { exportarXlsx, exportarCsv, exportarPdf, nombreMes };
