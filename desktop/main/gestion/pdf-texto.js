// gestion/pdf-texto.js
// Extrae el texto de un PDF conservando las líneas (agrupa por posición vertical),
// que es lo que necesitan las listas de precios y los comprobantes. Usa pdf.js
// (el lector de PDF de Firefox): lee PDFs de Word, Excel, Canva, bancos, etc.
// Un PDF escaneado (solo imagen) devuelve '' → el llamador avisa al usuario.
'use strict';

const MAX_PAGINAS = 30;

let pdfjsCache = null;
function cargarPdfjs() {
  if (pdfjsCache) return pdfjsCache;
  // pdf.js avisa por consola que no hay "canvas" (solo hace falta para dibujar páginas, no para leer texto)
  const { log, warn } = console; console.log = () => {}; console.warn = () => {};
  try { pdfjsCache = require('pdfjs-dist/legacy/build/pdf.js'); } finally { console.log = log; console.warn = warn; }
  return pdfjsCache;
}

async function textoDePdf(buffer, { maxPaginas = MAX_PAGINAS } = {}) {
  const pdfjs = cargarPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,   // sin eval: más seguro con archivos de terceros
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const paginas = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPaginas); n++) {
      const pag = await doc.getPage(n);
      const contenido = await pag.getTextContent();
      // línea = mismo "y" (tolerancia 3 pt), de arriba hacia abajo; dentro de la línea, de izquierda a derecha
      const lineas = [];
      for (const it of contenido.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5]; const x = it.transform[4];
        let l = lineas.find((c) => Math.abs(c.y - y) <= 3);
        if (!l) { l = { y, partes: [] }; lineas.push(l); }
        l.partes.push({ x, w: it.width || 0, s: it.str });
      }
      lineas.sort((a, b) => b.y - a.y);
      paginas.push(lineas.map((l) => {
        l.partes.sort((a, b) => a.x - b.x);
        let t = ''; let fin = null;
        for (const p of l.partes) {
          if (fin !== null) t += p.x - fin > 12 ? '  ' : (p.x - fin > 1 ? ' ' : '');
          t += p.s; fin = p.x + p.w;
        }
        return t.trim();
      }).filter(Boolean).join('\n'));
      pag.cleanup();
    }
  } finally {
    try { await doc.destroy(); } catch { /* nada */ }
  }
  return paginas.join('\n').slice(0, 60000);
}

module.exports = { textoDePdf };
