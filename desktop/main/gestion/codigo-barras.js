// gestion/codigo-barras.js
// Códigos de barras de los productos: limpieza del código, códigos propios para lo que no trae uno, y etiquetas imprimibles
// (Code 128, que cualquier lector USB entiende). Los lectores escriben el código como si fuera un teclado: la venta rápida lo
// reconoce y suma el producto. Probado en tests/codigo-barras.test.js.
'use strict';

// Anchos (barra, espacio, barra, espacio, barra, espacio) de los 107 símbolos de Code 128: 0..102 datos, 103-105 inicios A/B/C, 106 fin (7 elementos).
const PATRONES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const INICIO_B = 104; const FIN = 106;
const MAX_LARGO = 40;

// Solo caracteres imprimibles (Code 128 set B: ASCII 32 a 126). Devuelve '' si no sirve.
function sanear(c) {
  const t = String(c ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_LARGO);
  return /^[\x20-\x7e]*$/.test(t) ? t : '';
}

// → [anchos alternados barra/espacio…] para el texto, o null si no se puede codificar.
function codificar(texto) {
  const t = sanear(texto);
  if (!t || t !== String(texto).trim()) return null;
  const valores = [INICIO_B, ...[...t].map((ch) => ch.charCodeAt(0) - 32)];
  const suma = valores.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0);
  valores.push(suma % 103, FIN);
  return valores.flatMap((v) => PATRONES[v].split('').map(Number));
}

// Código propio ("AK000123") que no choque con ninguno existente.
function generar(existentes, prefijo = 'AK') {
  const usados = new Set((existentes || []).map((c) => String(c || '').toUpperCase()));
  let n = (existentes || []).reduce((m, c) => { const x = new RegExp(`^${prefijo}(\\d+)$`, 'i').exec(String(c || '')); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  let c; do { n++; c = `${prefijo}${String(n).padStart(6, '0')}`; } while (usados.has(c));
  return c;
}

// Les pone código a los productos que no tienen (sin tocar los que ya tienen). → { catalogo, asignados }
function completar(catalogo) {
  const existentes = (catalogo || []).map((p) => p.codigo).filter(Boolean);
  let asignados = 0;
  const nuevo = (catalogo || []).map((p) => {
    if (sanear(p.codigo)) return p;
    const c = generar(existentes); existentes.push(c); asignados++;
    return { ...p, codigo: c };
  });
  return { catalogo: nuevo, asignados };
}

// Busca un producto por el código que leyó el lector (sin importar mayúsculas ni espacios de más).
const buscarPorCodigo = (catalogo, leido) => { const k = sanear(leido).toLowerCase(); return k ? (catalogo || []).find((p) => sanear(p.codigo).toLowerCase() === k) || null : null; };

// Dibuja el código de barras en un PDF de pdfkit. → ancho usado
function dibujar(doc, texto, x, y, { anchoMax = 150, alto = 28, color = '#000' } = {}) {
  const anchos = codificar(texto);
  if (!anchos) return 0;
  const modulos = anchos.reduce((a, b) => a + b, 0);
  const m = Math.min(1.4, anchoMax / (modulos + 20)); // 10 módulos de margen a cada lado
  let cx = x + 10 * m;
  anchos.forEach((w, i) => { if (i % 2 === 0) doc.rect(cx, y, w * m, alto).fill(color); cx += w * m; });
  return modulos * m + 20 * m;
}

// PDF con etiquetas: 3 columnas × 8 filas por hoja A4. productos: [{ nombre, precio, codigo }]
function generarEtiquetas(productos, { negocio = '' } = {}) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Etiquetas de productos', Author: negocio || 'Akira' } });
    const partes = []; doc.on('data', (p) => partes.push(p)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    const COLS = 3; const FILAS = 8; const W = doc.page.width / COLS; const H = doc.page.height / FILAS;
    const lista = productos.filter((p) => codificar(p.codigo));
    lista.forEach((p, i) => {
      if (i > 0 && i % (COLS * FILAS) === 0) doc.addPage();
      const k = i % (COLS * FILAS); const x = (k % COLS) * W; const y = Math.floor(k / COLS) * H;
      doc.rect(x + 6, y + 6, W - 12, H - 12).lineWidth(0.4).strokeColor('#bbbbbb').stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(String(p.nombre || '').slice(0, 34), x + 12, y + 12, { width: W - 24, height: 12, ellipsis: true });
      if (p.precio > 0) doc.font('Helvetica').fontSize(11).fillColor('#111').text(`$ ${Number(p.precio).toLocaleString('es-AR')}`, x + 12, y + 25, { width: W - 24 });
      dibujar(doc, p.codigo, x + 8, y + 42, { anchoMax: W - 16, alto: 30 });
      doc.font('Helvetica').fontSize(8).fillColor('#333').text(p.codigo, x + 8, y + 75, { width: W - 16, align: 'center' });
    });
    if (!lista.length) doc.font('Helvetica').fontSize(12).text('No hay productos con código de barras.', 40, 40);
    doc.end();
  });
}

module.exports = { PATRONES, sanear, codificar, generar, completar, buscarPorCodigo, dibujar, generarEtiquetas, MAX_LARGO };
