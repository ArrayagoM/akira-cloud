// gestion/exportador-deudas.js
// Exporta la lista de deudores (clientes que deben) y de proveedores (con saldo) a
// Excel, CSV y PDF.
'use strict';

const pesos = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaAR = (f) => (f ? String(f).split('-').reverse().join('/') : '');
const seguro = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

const DEFS = {
  deudores: {
    hoja: 'Deudores', titulo: 'Quién me debe', totalRotulo: 'Total a cobrar',
    cols: [
      { header: 'Cliente', key: 'nombre', width: 30 }, { header: 'Teléfono', key: 'telefono', width: 18 },
      { header: 'Saldo', key: 'saldo', width: 16, moneda: true }, { header: 'Días de atraso', key: 'antiguedadDias', width: 15 },
      { header: 'Último movimiento', key: 'ultimo', width: 18 },
    ],
    fila: (d) => ({ nombre: d.nombre, telefono: d.telefono || '', saldo: d.saldo, antiguedadDias: d.antiguedadDias, ultimo: fechaAR(d.ultimoMovimiento) }),
  },
  proveedores: {
    hoja: 'Proveedores', titulo: 'Proveedores y lo que les debo', totalRotulo: 'Total que debo',
    cols: [
      { header: 'Proveedor', key: 'nombre', width: 30 }, { header: 'Teléfono', key: 'telefono', width: 18 }, { header: 'CUIT', key: 'cuit', width: 16 },
      { header: 'Rubro', key: 'rubro', width: 20 }, { header: 'Les debo', key: 'saldo', width: 16, moneda: true },
      { header: 'Comprado en el mes', key: 'compradoMes', width: 20, moneda: true }, { header: 'Última compra', key: 'ultima', width: 16 }, { header: 'Notas', key: 'notas', width: 36 },
    ],
    fila: (p) => ({ nombre: p.nombre, telefono: p.telefono || '', cuit: p.cuit || '', rubro: p.rubro || '', saldo: p.saldo, compradoMes: p.compradoMes || 0, ultima: fechaAR(p.ultimaCompra), notas: p.notas || '' }),
  },
};

async function xlsx(tipo, { items, total }) {
  const ExcelJS = require('exceljs');
  const def = DEFS[tipo];
  const wb = new ExcelJS.Workbook(); wb.creator = 'Akira';
  const ws = wb.addWorksheet(def.hoja, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = def.cols.map(({ header, key, width }) => ({ header, key, width }));
  items.forEach((x) => ws.addRow(def.fila(x)));
  def.cols.forEach((c, i) => { if (c.moneda) ws.getColumn(i + 1).numFmt = '"$"#,##0.00'; });
  const cab = ws.getRow(1); cab.font = { bold: true }; cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00E87B' } };
  const t = ws.addRow({ nombre: def.totalRotulo, saldo: total }); t.font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csv(tipo, { items }) {
  const def = DEFS[tipo];
  const esc = (v) => { const s = String(seguro(v) ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lineas = [def.cols.map((c) => esc(c.header)).join(';'), ...items.map((x) => { const f = def.fila(x); return def.cols.map((c) => esc(c.moneda ? String(f[c.key]).replace('.', ',') : f[c.key])).join(';'); })];
  return Buffer.from('﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
}

function pdf(tipo, { items, total, negocio = '' }) {
  const PDFDocument = require('pdfkit');
  const def = DEFS[tipo];
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: def.titulo, Author: 'Akira' } });
    const partes = []; doc.on('data', (c) => partes.push(c)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    const ancho = doc.page.width - 80;
    doc.fontSize(18).fillColor('#000').text(def.titulo);
    if (negocio) doc.fontSize(11).fillColor('#555').text(negocio);
    doc.fontSize(9).fillColor('#888').text(`Al ${new Date().toLocaleDateString('es-AR')}`);
    doc.moveDown(0.8);
    doc.fontSize(10).fillColor('#666').text(def.totalRotulo); doc.fontSize(20).fillColor('#b3261e').text(pesos(total)); doc.moveDown(0.8);
    doc.moveTo(40, doc.y).lineTo(40 + ancho, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke(); doc.moveDown(0.4);
    for (const x of items) {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y = doc.y;
      const extra = tipo === 'deudores' ? (x.antiguedadDias ? `${x.antiguedadDias} días de atraso` : 'al día') : (x.rubro || '');
      doc.fontSize(10).fillColor('#222').text(x.nombre, 40, y, { width: ancho - 260, height: 14, ellipsis: true });
      doc.fillColor('#666').text(`${x.telefono || ''}`, 40 + ancho - 260, y, { width: 100 });
      doc.fillColor('#888').fontSize(8).text(extra, 40 + ancho - 260, y + 11, { width: 140 });
      doc.fontSize(10).fillColor('#b3261e').text(pesos(x.saldo), 40 + ancho - 110, y, { width: 110, align: 'right' });
      doc.y = Math.max(doc.y, y + 26);
    }
    doc.fontSize(8).fillColor('#888').text('Generado por Akira', 40, doc.page.height - 50, { align: 'center', width: ancho });
    doc.end();
  });
}

module.exports = { xlsx, csv, pdf };
