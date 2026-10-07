// gestion/exportador-profesionales.js — la liquidación de comisiones en Excel (resumen + una hoja por profesional) o CSV.
'use strict';

const seguro = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
const fechaAR = (f) => String(f || '').split('-').reverse().join('/');

// liq: resultado de liquidacion(). detalles: { [idProfesional]: [filas de detalle()] }
async function exportarXlsx(liq, detalles = {}, { negocio = '' } = {}) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Akira';
  const hoja = (nombre, cols) => { const ws = wb.addWorksheet(String(nombre).replace(/[\\/?*[\]:]/g, ' ').slice(0, 30) || 'Hoja', { views: [{ state: 'frozen', ySplit: 1 }] }); ws.columns = cols.map((h, i) => ({ header: h, width: i === 0 ? 28 : 16 })); const c = ws.getRow(1); c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00E87B' } }; return ws; };
  const r = hoja('Resumen', ['Profesional', 'Turnos', 'Facturado', 'Comisión %', 'Comisión a pagar', 'Para el local']);
  for (const p of liq.profesionales) r.addRow([seguro(p.nombre), p.turnos, p.facturado, p.comisionPct, p.comision, p.paraElLocal]);
  if (liq.sinAsignar.turnos) r.addRow(['(Sin asignar a un profesional)', liq.sinAsignar.turnos, liq.sinAsignar.facturado, '', 0, liq.sinAsignar.facturado]);
  r.addRow(['TOTAL', liq.totales.turnos, liq.totales.facturado, '', liq.totales.comision, liq.totales.paraElLocal]).font = { bold: true };
  r.addRow([]); r.addRow([`Período: ${fechaAR(liq.desde)} al ${fechaAR(liq.hasta)}${negocio ? ` — ${seguro(negocio)}` : ''}`]);
  for (const p of liq.profesionales) {
    const filas = detalles[p.id] || []; if (!filas.length) continue;
    const ws = hoja(p.nombre, ['Fecha', 'Cliente', 'Servicio', 'Monto', 'Comisión %', 'Comisión']);
    filas.forEach((f) => ws.addRow([fechaAR(f.fecha), seguro(f.cliente), seguro(f.servicio), f.monto, f.comisionPct, f.comision]));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function exportarCsv(liq) {
  const esc = (v) => { const s = String(seguro(v) ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n = (v) => String(v).replace('.', ',');
  const lineas = [['Profesional', 'Turnos', 'Facturado', 'Comision %', 'Comision a pagar', 'Para el local'].map(esc).join(';')];
  for (const p of liq.profesionales) lineas.push([p.nombre, p.turnos, n(p.facturado), n(p.comisionPct), n(p.comision), n(p.paraElLocal)].map(esc).join(';'));
  if (liq.sinAsignar.turnos) lineas.push(['(Sin asignar)', liq.sinAsignar.turnos, n(liq.sinAsignar.facturado), '', '0', n(liq.sinAsignar.facturado)].map(esc).join(';'));
  lineas.push(['TOTAL', liq.totales.turnos, n(liq.totales.facturado), '', n(liq.totales.comision), n(liq.totales.paraElLocal)].map(esc).join(';'));
  return Buffer.from('﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
}

module.exports = { exportarXlsx, exportarCsv };
