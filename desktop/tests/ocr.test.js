// tests/ocr.test.js — el OCR local lee comprobantes impresos y NUNCA tumba el
// proceso con imágenes raras (corruptas, diminutas, que no son imágenes).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

process.on('uncaughtException', (e) => { console.error('❌ excepción sin capturar:', e.message); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('❌ promesa rechazada sin capturar:', e && e.message); process.exit(1); });

require('../main/db/store').abrir(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'akira-ocr-')), 'akira.db'));

(async () => {
  console.log('\n[ocr] Tests:');
  const ocr = require('../main/bot-engine/services/bot/ocr.service');
  const { detectarMonto, detectarFecha } = require('../main/bot-engine/services/bot/documentos.service');

  const diminuta = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ/P2QAAAABJRU5ErkJggg==', 'base64');
  assert(typeof (await ocr.leerTexto(diminuta)) === 'string', 'una imagen de 1 píxel no tira error');
  assert((await ocr.leerTexto(Buffer.from('esto no es una imagen'))) === '', 'un archivo que no es imagen devuelve vacío');
  assert((await ocr.leerTexto(Buffer.alloc(0))) === '', 'un archivo vacío devuelve vacío');

  const texto = await ocr.leerTexto(fs.readFileSync(path.join(__dirname, 'fixtures', 'comprobante.png')));
  assert(/transferencia/i.test(texto), 'lee el texto impreso de un comprobante (tras haber fallado antes: se recupera solo)');
  assert(detectarMonto(texto) === 15000, 'del texto leído se extrae el monto $15.000');
  assert(detectarFecha(texto) === '2026-10-05', 'del texto leído se extrae la fecha');

  await ocr.cerrar();
  console.log('\n✅ Todos los tests de ocr pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
