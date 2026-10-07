// gestion/exportador-reportes.js — exporta los reportes a Excel (una hoja por tema) o CSV (todo en una hoja de texto).
'use strict';

const seguro = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fechaAR = (f) => (f ? f.split('-').reverse().join('/') : '');

// Secciones: [{ titulo, columnas: [..], filas: [[..]] }]
function secciones(r) {
  return [
    { titulo: 'Resumen', columnas: ['Dato', 'Valor'], filas: [['Período', `${fechaAR(r.desde)} al ${fechaAR(r.hasta)}`], ['Turnos', r.resumen.turnos], ['Atendidos', r.resumen.atendidos], ['Ausentes', r.resumen.ausentes], ['Cancelados', r.resumen.cancelados], ['Clientes distintos', r.resumen.clientesDistintos], ['% de ausencias', r.ausencias.porcentaje], ['Plata perdida por ausencias', r.ausencias.perdido]] },
    { titulo: 'Servicios', columnas: ['Servicio', 'Veces', 'Ingresos'], filas: r.servicios.map((s) => [s.nombre, s.cantidad, s.ingresos]) },
    { titulo: 'Clientes frecuentes', columnas: ['Cliente', 'Teléfono', 'Visitas', 'Gastó', 'Última visita'], filas: r.clientes.map((c) => [c.nombre, c.telefono, c.visitas, c.gastado, fechaAR(c.ultima)]) },
    { titulo: 'Horas pico', columnas: ['Día', 'Turnos'], filas: r.horasPico.dias.map((d) => [d.dia, d.cantidad]) },
    { titulo: 'Ausencias', columnas: ['Cliente', 'Teléfono', 'Faltas'], filas: r.ausencias.clientes.map((c) => [c.nombre, c.telefono, c.faltas]) },
    { titulo: 'Mes a mes', columnas: ['Mes', 'Ingresos', 'Gastos', 'Resultado', 'Turnos'], filas: r.evolucion.map((e) => [nombreMes(e.mes), e.ingresos, e.gastos, e.resultado, e.turnos]) },
  ];
}

async function exportarXlsx(reporte, { negocio = '' } = {}) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Akira';
  for (const s of secciones(reporte)) {
    const ws = wb.addWorksheet(s.titulo.slice(0, 30), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = s.columnas.map((h, i) => ({ header: h, width: i === 0 ? 30 : 16 }));
    s.filas.forEach((f) => ws.addRow(f.map(seguro)));
    const cab = ws.getRow(1); cab.font = { bold: true }; cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00E87B' } };
  }
  if (negocio) wb.getWorksheet('Resumen').addRow(['Negocio', seguro(negocio)]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function exportarCsv(reporte) {
  const esc = (v) => { const s = String(seguro(v) ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lineas = [];
  for (const s of secciones(reporte)) { lineas.push(esc(s.titulo.toUpperCase())); lineas.push(s.columnas.map(esc).join(';')); s.filas.forEach((f) => lineas.push(f.map((v) => esc(typeof v === 'number' ? String(v).replace('.', ',') : v)).join(';'))); lineas.push(''); }
  return Buffer.from('﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
}

module.exports = { exportarXlsx, exportarCsv, secciones };
