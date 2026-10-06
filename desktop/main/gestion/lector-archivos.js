// gestion/lector-archivos.js
// Convierte lo que el usuario sube (Excel .xlsx, CSV, PDF con texto o una foto de
// una lista de precios) en una tabla simple { columnas, filas } para que el
// asistente de importación la mapee. Todo corre en la PC: nada se sube a internet.
'use strict';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILAS = 5000;

const celdaATexto = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.result !== undefined) return celdaATexto(v.result);           // fórmula
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text);                    // hipervínculo
    if (v.error) return '';
  }
  return typeof v === 'number' ? v : String(v).trim();
};

// Primera fila con datos = encabezados, salvo que sea casi todo numérica (entonces se inventan).
function separarEncabezados(matriz) {
  const filas = matriz.filter((f) => f.some((c) => c !== '' && c != null));
  if (!filas.length) return { columnas: [], filas: [] };
  const ancho = Math.max(...filas.map((f) => f.length));
  const norm = filas.map((f) => Array.from({ length: ancho }, (_, i) => (f[i] === undefined ? '' : f[i])));
  const primera = norm[0];
  const textuales = primera.filter((c) => typeof c === 'string' && c !== '' && Number.isNaN(Number(String(c).replace(/[.,$\s]/g, '')))).length;
  const conDatos = primera.filter((c) => c !== '').length;
  if (conDatos && textuales / conDatos >= 0.6) {
    const columnas = primera.map((c, i) => String(c || `Columna ${i + 1}`));
    return { columnas, filas: norm.slice(1) };
  }
  return { columnas: primera.map((_, i) => `Columna ${i + 1}`), filas: norm };
}

async function leerExcel(buffer) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const hojas = [];
  wb.eachSheet((ws) => {
    const matriz = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = celdaATexto(cell.value); });
      matriz.push(Array.from(vals, (v) => (v === undefined ? '' : v)));
    });
    const { columnas, filas } = separarEncabezados(matriz);
    if (filas.length) hojas.push({ nombre: ws.name, columnas, filas: filas.slice(0, MAX_FILAS) });
  });
  return hojas;
}

// ── CSV ──────────────────────────────────────────────────────
function decodificar(buffer) {
  let t = buffer.toString('utf8');
  if (t.includes('�')) t = buffer.toString('latin1'); // CSV de Excel viejo
  return t.replace(/^﻿/, '');
}

function detectarSeparador(texto) {
  const muestra = texto.split(/\r?\n/).slice(0, 5).join('\n');
  const cuentas = { ';': 0, ',': 0, '\t': 0 };
  let dentro = false;
  for (const ch of muestra) { if (ch === '"') dentro = !dentro; else if (!dentro && ch in cuentas) cuentas[ch]++; }
  return Object.entries(cuentas).sort((a, b) => b[1] - a[1])[0][0];
}

function parsearCsv(texto, sep) {
  const filas = []; let fila = []; let celda = ''; let dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (dentro) {
      if (ch === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else dentro = false; } else celda += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === sep) { fila.push(celda.trim()); celda = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; fila.push(celda.trim()); filas.push(fila); fila = []; celda = ''; }
    else celda += ch;
  }
  if (celda !== '' || fila.length) { fila.push(celda.trim()); filas.push(fila); }
  return filas;
}

function leerCsv(buffer) {
  const texto = decodificar(buffer);
  const matriz = parsearCsv(texto, detectarSeparador(texto));
  const { columnas, filas } = separarEncabezados(matriz);
  return filas.length ? [{ nombre: 'CSV', columnas, filas: filas.slice(0, MAX_FILAS) }] : [];
}

// ── Texto libre (PDF / foto): "Producto ........ $1.500" por línea ──
const RE_LINEA = /^(.{2,90}?)[\s.\-–—:·|_]*?(?:\$|ars|usd|u\$s)?\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*$/i;
const IGNORAR = /^(total|subtotal|iva|fecha|p[aá]gina|pag\.?|lista de precios|tel|cuit|www|http)/i;

function filasDeTexto(texto) {
  const filas = [];
  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.replace(/\s{2,}/g, '  ').trim();
    if (linea.length < 3 || IGNORAR.test(linea)) continue;
    const m = linea.match(RE_LINEA);
    if (!m) continue;
    const nombre = m[1].replace(/[\s.\-–—:·|_$]+$/g, '').trim();
    if (!/[a-zA-ZÀ-ÿ]{2}/.test(nombre) || /^\d+$/.test(nombre)) continue;
    filas.push([nombre, m[2]]);
  }
  return filas;
}

async function leerPdf(buffer) {
  let texto = '';
  try { texto = await require('./pdf-texto').textoDePdf(buffer); } catch { /* PDF ilegible */ }
  if (texto.replace(/\s/g, '').length < 20) return { hojas: [], aviso: 'Este PDF no tiene texto seleccionable (parece una imagen escaneada). Sacale una foto o una captura e importala como imagen.' };
  const filas = filasDeTexto(texto);
  return { hojas: filas.length ? [{ nombre: 'PDF', columnas: ['Producto o servicio', 'Precio'], filas: filas.slice(0, MAX_FILAS) }] : [], aviso: filas.length ? 'Los datos del PDF se leyeron por línea: revisalos en la vista previa.' : 'No encontré líneas con "nombre … precio" en el PDF.' };
}

async function leerImagen(buffer, leerTexto) {
  const texto = await leerTexto(buffer);
  if (!texto) return { hojas: [], aviso: 'No pude leer texto en la imagen. Probá con una foto más nítida y de frente, o importá el Excel/PDF.' };
  const filas = filasDeTexto(texto);
  return { hojas: filas.length ? [{ nombre: 'Foto', columnas: ['Producto o servicio', 'Precio'], filas: filas.slice(0, MAX_FILAS) }] : [], aviso: filas.length ? 'Texto leído de la foto: revisá cada fila, la lectura puede tener errores.' : 'Leí texto pero no encontré líneas con "nombre … precio".' };
}

// Punto de entrada. Devuelve { origen, hojas, aviso } o tira Error con un mensaje para el usuario.
async function leerArchivo({ buffer, nombre = '', mimetype = '' }, { leerTexto } = {}) {
  if (!buffer || !buffer.length) throw new Error('El archivo está vacío');
  if (buffer.length > MAX_BYTES) throw new Error('El archivo es muy pesado (máximo 15 MB)');
  const ext = String(nombre).toLowerCase().split('.').pop();
  const mime = String(mimetype).toLowerCase();

  if (ext === 'xls') throw new Error('Los .xls viejos no se pueden leer. Abrilo en Excel y guardalo como .xlsx o .csv.');
  const esZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK": xlsx
  const esPdf = buffer.slice(0, 4).toString() === '%PDF';
  const esPng = buffer[0] === 0x89 && buffer[1] === 0x50;
  const esJpg = buffer[0] === 0xff && buffer[1] === 0xd8;

  try {
    if (esZip || ext === 'xlsx' || mime.includes('spreadsheetml')) {
      if (!esZip) throw new Error('El archivo no es un .xlsx válido');
      return { origen: 'excel', hojas: await leerExcel(buffer), aviso: '' };
    }
    if (esPdf || ext === 'pdf') return { origen: 'pdf', ...(await leerPdf(buffer)) };
    if (esPng || esJpg || /^(png|jpe?g|webp)$/.test(ext)) {
      if (!leerTexto) throw new Error('La lectura de imágenes no está disponible');
      return { origen: 'imagen', ...(await leerImagen(buffer, leerTexto)) };
    }
    if (ext === 'csv' || ext === 'txt' || mime.includes('csv') || mime.startsWith('text/')) return { origen: 'csv', hojas: leerCsv(buffer), aviso: '' };
  } catch (e) {
    if (/xlsx|\.xls|archivo|imágenes/i.test(e.message)) throw e;
    throw new Error('No pude leer el archivo. ¿Está dañado o protegido con contraseña?');
  }
  throw new Error('Formato no soportado. Usá Excel (.xlsx), CSV, PDF o una foto.');
}

module.exports = { leerArchivo, filasDeTexto, parsearCsv, detectarSeparador, separarEncabezados, MAX_BYTES };
