// tests/documentos-api.test.js — rutas de la bandeja de documentos (API local).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-docapi-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[documentos-api] Tests:');
  const Turno = require('../main/bot-engine/models/Turno');
  const Documento = require('../main/bot-engine/models/Documento');
  const { crearDocumentosService } = require('../main/bot-engine/services/bot/documentos.service');

  const avisos = [];
  const botService = { enviarTexto: (slot, jid, texto) => { avisos.push({ jid, texto }); return true; }, slotsActivos: () => [0], getBotStatus: () => ({}) };
  const USER = 'u1';
  const app = express(); app.use(express.json());
  app.use('/api/bot', require('../main/local-api/routes/bot.routes')({ botService, requerirSesion: (req, _res, next) => { req.user = { _id: USER }; next(); }, userDataDir: dir }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/bot`;
  const j = async (p, o) => { const r = await fetch(base + p, { headers: { 'Content-Type': 'application/json' }, ...o }); return { status: r.status, body: await r.json().catch(() => ({})), r }; };

  const svc = crearDocumentosService({ userId: USER, dirBase: path.join(dir, 'documentos'), log: () => {} });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const turno = await Turno.create({ userId: USER, calendarId: 'principal', fechaInicio: new Date(Date.now() + 864e5), fechaFin: new Date(Date.now() + 864e5 + 36e5), clienteNombre: 'Ana', clienteTelefono: '5492241111111', estado: 'pendiente', pago: { monto: 1000, metodo: 'mercadopago' } });
  const { doc } = await svc.guardarRecibido({ jid: 'a@s.whatsapp.net', numero: '5492241111111', nombreCliente: 'Ana', buffer: png, mimetype: 'image/png', nombreOriginal: 'comp.png' });

  let r = await j('/documentos?estado=nuevo');
  assert(r.body.documentos.length === 1 && r.body.nuevos === 1, 'lista los documentos por revisar');
  assert(!('ruta' in r.body.documentos[0]), 'no expone la ruta del archivo en disco');

  const f = await fetch(`${base}/documentos/${doc._id}/archivo`);
  assert(f.status === 200 && f.headers.get('content-type') === 'image/png' && (await f.arrayBuffer()).byteLength === png.length, 'sirve el archivo con su tipo');

  r = await j(`/documentos/${doc._id}`, { method: 'PUT', body: JSON.stringify({ tipo: 'factura' }) });
  assert(r.status === 200 && (await Documento.findById(doc._id).lean()).tipo === 'factura', 'permite cambiar el tipo');

  r = await j(`/documentos/${doc._id}`, { method: 'PUT', body: JSON.stringify({ monto: 12500.5, notas: 'seña viernes' }) });
  const m = await Documento.findById(doc._id).lean();
  assert(r.status === 200 && m.montoManual === 12500.5 && m.notas === 'seña viernes', 'el dueño puede cargar el monto y una nota a mano');
  await j(`/documentos/${doc._id}`, { method: 'PUT', body: JSON.stringify({ monto: 'abc' }) });
  assert((await Documento.findById(doc._id).lean()).montoManual === 12500.5, 'un monto inválido se ignora');
  await j(`/documentos/${doc._id}`, { method: 'PUT', body: JSON.stringify({ monto: null }) });
  assert((await Documento.findById(doc._id).lean()).montoManual === null, 'se puede borrar el monto cargado');

  r = await j(`/documentos/${doc._id}/confirmar-turno`, { method: 'POST' });
  assert(r.status === 200, 'confirmar turno responde OK');
  const t2 = await Turno.findById(turno._id).lean();
  assert(t2.estado === 'confirmado' && t2.pago.metodo === 'transferencia', 'el turno queda confirmado por transferencia');
  assert(avisos.length === 1 && avisos[0].jid === 'a@s.whatsapp.net' && /confirmado/.test(avisos[0].texto), 'se le avisa al cliente por WhatsApp');
  assert((await Documento.findById(doc._id).lean()).estado === 'revisado', 'el documento pasa a revisado');

  r = await j(`/documentos/${doc._id}/confirmar-turno`, { method: 'POST' });
  assert(r.status === 409 && avisos.length === 1, 'confirmar dos veces no repite ni vuelve a avisar');

  // un documento cuyo archivo quedó fuera de la carpeta de la app jamás se sirve ni se borra
  const afuera = path.join(os.tmpdir(), 'akira-fuera-' + Date.now() + '.txt'); fs.writeFileSync(afuera, 'secreto');
  const raro = await Documento.create({ userId: USER, jid: 'x', nombreOriginal: 'x', mimetype: 'image/png', ruta: afuera, estado: 'nuevo', tipo: 'otro' });
  r = await j(`/documentos/${raro._id}/archivo`);
  assert(r.status === 404, 'no sirve archivos fuera de la carpeta de la app');
  await j(`/documentos/${raro._id}`, { method: 'DELETE' });
  assert(fs.existsSync(afuera), 'tampoco borra archivos fuera de la carpeta de la app');
  fs.unlinkSync(afuera);

  // aislamiento entre usuarios
  const ajeno = await Documento.create({ userId: 'otro', jid: 'x', nombreOriginal: 'x', mimetype: 'image/png', ruta: doc.ruta, estado: 'nuevo', tipo: 'otro' });
  r = await j(`/documentos/${ajeno._id}/archivo`);
  assert(r.status === 404, 'un usuario no ve documentos de otro');

  r = await j(`/documentos/${doc._id}`, { method: 'DELETE' });
  assert(r.status === 200 && !fs.existsSync(doc.ruta) && !(await Documento.findById(doc._id).lean()), 'eliminar borra el registro y el archivo');

  srv.close();
  console.log('\n✅ Todos los tests de documentos-api pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
