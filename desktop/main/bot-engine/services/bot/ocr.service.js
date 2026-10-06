// services/bot/ocr.service.js
// Lee el texto de fotos (comprobantes, facturas, remitos) con Tesseract, sin
// internet y sin mandar la imagen a ningún servidor: corre en la PC del dueño.
// Los idiomas (español + inglés) vienen empaquetados en ocr-data/.
// Limitación honesta: lee bien texto impreso y capturas de pantalla; la letra
// manuscrita y las fotos torcidas o borrosas salen mal → el dueño corrige a mano.
'use strict';

const path = require('path');

// Dentro del instalador los archivos que Tesseract necesita (hilo, wasm, idiomas)
// viven en app.asar.unpacked, no dentro del .asar.
const fuera = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const DIR_IDIOMAS = fuera(path.join(__dirname, '..', '..', '..', '..', 'ocr-data'));

const TIEMPO_MAX_MS = 90_000;
let workerPromesa = null;
let cola = Promise.resolve(); // una foto a la vez: no saturar la PC

async function obtenerWorker() {
  if (!workerPromesa) {
    workerPromesa = (async () => {
      const { createWorker } = require('tesseract.js');
      // Los idiomas se leen de la carpeta empaquetada como si fuera la "caché" de
      // Tesseract (solo lectura): así nunca intenta bajarlos de internet. (Dentro
      // de Electron trata cualquier "langPath" como una URL y fallaría.)
      return createWorker(['spa', 'eng'], 1, {
        workerPath: fuera(require.resolve('tesseract.js/src/worker-script/node/index.js')),
        cachePath: DIR_IDIOMAS,
        cacheMethod: 'readOnly',
        gzip: false,
      });
    })().catch((e) => { workerPromesa = null; throw e; });
  }
  return workerPromesa;
}

// Devuelve el texto de la imagen ('' si no se pudo leer). Nunca tira.
function leerTexto(buffer) {
  const tarea = cola.then(async () => {
    try {
      const worker = await obtenerWorker();
      const r = await Promise.race([
        worker.recognize(buffer),
        new Promise((_, rej) => setTimeout(() => rej(new Error('OCR_TIMEOUT')), TIEMPO_MAX_MS)),
      ]);
      return String(r?.data?.text || '').replace(/[ \t]+\n/g, '\n').trim().slice(0, 20000);
    } catch (e) {
      if (e.message === 'OCR_TIMEOUT') { try { (await workerPromesa)?.terminate(); } catch {} workerPromesa = null; }
      return '';
    }
  });
  cola = tarea.catch(() => {});
  return tarea;
}

async function cerrar() {
  try { if (workerPromesa) (await workerPromesa).terminate(); } catch { /* nada */ }
  workerPromesa = null;
}

module.exports = { leerTexto, cerrar };
