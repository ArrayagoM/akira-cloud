// tests/documentos.test.js — bandeja de documentos: lectura de datos de PDFs,
// tipos permitidos, tamaño máximo y asociación con el turno pendiente.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-docs-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[documentos] Tests:');
  const { crearDocumentosService, detectarMonto, detectarFecha, sugerirTipo, parsearMonto, MAX_BYTES } = require('../main/bot-engine/services/bot/documentos.service');
  const Turno = require('../main/bot-engine/models/Turno');
  const Documento = require('../main/bot-engine/models/Documento');

  // ── Lectura de montos/fechas/tipo (formato argentino) ──
  assert(parsearMonto('1.234,56') === 1234.56, 'monto con formato argentino 1.234,56');
  assert(parsearMonto('15.000') === 15000, 'monto con punto de miles 15.000');
  assert(parsearMonto('2500') === 2500, 'monto simple');
  assert(detectarMonto('Transferencia realizada\nImporte: $ 15.000,00\nComisión $ 150') === 15000, 'detecta el importe etiquetado');
  assert(detectarMonto('Total a pagar $8.500') === 8500, 'detecta el total');
  assert(detectarMonto('sin plata acá') === null, 'sin monto devuelve null');
  assert(detectarFecha('Fecha: 05/10/2026 14:33') === '2026-10-05', 'detecta fecha dd/mm/aaaa');
  assert(detectarFecha('31/13/2026') === null, 'rechaza fechas imposibles');
  assert(sugerirTipo('Comprobante de transferencia CBU 000') === 'comprobante', 'reconoce comprobante');
  assert(sugerirTipo('Factura C CUIT 20-1234') === 'factura', 'reconoce factura');
  assert(sugerirTipo('hola') === 'sin_clasificar', 'sin pistas queda sin clasificar');

  // ── Guardado ──
  const USER = 'u1';
  const svc = crearDocumentosService({ userId: USER, dirBase: path.join(dir, 'documentos'), log: () => {} });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');

  const rExe = await svc.guardarRecibido({ jid: 'a@s.whatsapp.net', numero: '5492241111111', buffer: Buffer.from('MZ'), mimetype: 'application/x-msdownload', nombreOriginal: 'virus.exe' });
  assert(!rExe.ok && rExe.motivo === 'tipo', 'rechaza archivos que no son PDF ni imagen');
  const rGrande = await svc.guardarRecibido({ jid: 'a@s.whatsapp.net', numero: '5492241111111', buffer: Buffer.alloc(MAX_BYTES + 1), mimetype: 'application/pdf' });
  assert(!rGrande.ok && rGrande.motivo === 'tamano', 'rechaza archivos de más de 10 MB');

  const r1 = await svc.guardarRecibido({ jid: 'a@s.whatsapp.net', numero: '5492241111111', nombreCliente: 'Ana', buffer: png, mimetype: 'image/png', nombreOriginal: '../../etc/pasa wd.png' });
  assert(r1.ok && fs.existsSync(r1.doc.ruta), 'guarda la imagen en disco');
  assert(path.resolve(r1.doc.ruta).startsWith(path.resolve(dir, 'documentos') + path.sep), 'el nombre del archivo no puede escapar de la carpeta');
  assert(r1.doc.estado === 'nuevo' && r1.doc.tipo === 'sin_clasificar' && !r1.turno, 'sin turno pendiente queda "nuevo / sin clasificar"');

  // ── Comprobante en PDF real: se lee solo el monto y la fecha ──
  const pdfComp = await svc.guardarRecibido({ jid: 'c@s.whatsapp.net', numero: '5492245555555', nombreCliente: 'Luis', buffer: fs.readFileSync(path.join(__dirname, 'fixtures', 'comprobante.pdf')), mimetype: 'application/pdf', nombreOriginal: 'comp.pdf' });
  assert(pdfComp.ok && pdfComp.doc.montoSugerido === 15000 && pdfComp.doc.fechaSugerida === '2026-10-05' && pdfComp.doc.tipo === 'comprobante', 'un comprobante en PDF real: detecta monto $15.000, fecha y tipo');

  // ── Con turno pendiente: se asocia y se sugiere "comprobante" ──
  const t = await Turno.create({ userId: USER, calendarId: 'principal', fechaInicio: new Date(Date.now() + 864e5), fechaFin: new Date(Date.now() + 864e5 + 36e5), clienteNombre: 'Ana', clienteTelefono: '5492241111111', estado: 'pendiente', pago: { monto: 1000, metodo: 'mercadopago' } });
  const r2 = await svc.guardarRecibido({ jid: 'a@s.whatsapp.net', numero: '5492241111111', nombreCliente: 'Ana', buffer: png, mimetype: 'image/jpeg', nombreOriginal: 'IMG-1.jpg' });
  assert(r2.ok && String(r2.doc.turnoId) === String(t._id) && r2.doc.tipo === 'comprobante', 'una foto de quien tiene un turno pendiente se asocia al turno como comprobante');
  assert((await Turno.findById(t._id).lean()).estado === 'pendiente', 'recibir una imagen NO confirma el turno (solo lo hace el dueño o MercadoPago)');

  const otro = await svc.guardarRecibido({ jid: 'b@s.whatsapp.net', numero: '5492249999999', buffer: png, mimetype: 'image/png' });
  assert(otro.ok && !otro.doc.turnoId, 'otro cliente sin turno no queda asociado al turno ajeno');
  assert((await Documento.find({ userId: USER }).lean()).length === 4, 'quedan 4 documentos registrados');

  // ── Lectura de texto de fotos (OCR simulado) ──
  const { ocr } = require('../main/bot-engine/services/bot/documentos.service');
  const real = ocr.leerTexto;
  ocr.leerTexto = async () => 'Comprobante de transferencia\nFecha: 05/10/2026\nImporte: $ 15.000,00';
  await svc.analizarImagen(otro.doc, png);
  const guardado = await Documento.findById(otro.doc._id).lean();
  assert(guardado.montoSugerido === 15000 && guardado.fechaSugerida === '2026-10-05', 'la lectura de la foto completa monto y fecha sugeridos');
  assert(guardado.tipo === 'comprobante' && guardado.ocrHecho === true && /Importe/.test(guardado.textoLeido), 'clasifica la foto y guarda el texto leído');
  await Documento.findOneAndUpdate({ _id: otro.doc._id }, { $set: { montoSugerido: 999 } });
  await svc.analizarImagen({ ...guardado, montoSugerido: 999, tipo: 'otro' }, png);
  const g2 = await Documento.findById(otro.doc._id).lean();
  assert(g2.montoSugerido === 999, 'no pisa un monto ya existente');
  ocr.leerTexto = async () => '';
  const vacio = await svc.analizarImagen(r1.doc, png);
  assert(vacio.ocrHecho === true && !vacio.textoLeido, 'si no se puede leer nada queda marcado como leído y sin texto (el dueño carga el monto)');
  ocr.leerTexto = real;

  console.log('\n✅ Todos los tests de documentos pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
