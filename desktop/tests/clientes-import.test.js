// tests/clientes-import.test.js — importar clientes desde Excel: nuevos, existentes (sin pisar el historial),
// teléfonos inválidos, aviso al bot y deshacer (sin borrar nunca a un cliente con historial).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-cli-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[clientes-import] Tests:');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const crearClientes = require('../main/bot-engine/services/bot/mongo-clientes.service');
  const ExcelJS = require('exceljs');
  const { exportarXlsx, exportarCsv } = require('../main/gestion/exportador');

  // Cliente que YA existe y tiene historial (hay que respetarlo) + uno con id interno de WhatsApp (@lid)
  await BotCliente.create({ userId: 'u1', jid: '5492241497226@s.whatsapp.net', nombre: 'Ana', telefono: '5492241497226', numeroReal: '5492241497226', silenciado: false, etiquetas: ['VIP'], notas: '', historial: [{ role: 'user', content: 'hola' }], turnosConfirmados: [{ fecha: '2026-10-01' }], perfilResumen: 'le gusta el té' });
  await BotCliente.create({ userId: 'u1', jid: '123456789012345@lid', nombre: 'Con LID', telefono: '', numeroReal: '', silenciado: false, historial: [], turnosConfirmados: [] });
  await BotCliente.create({ userId: 'u2', jid: '5492241000001@s.whatsapp.net', nombre: 'De otro usuario', historial: [], turnosConfirmados: [] });

  const importados = [];
  const botService = { recargarConfig: () => true, clientesImportados: (j) => importados.push(...j) };
  const app = express();
  const jsonGeneral = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path === '/api/gestion/analizar' ? next() : jsonGeneral(req, res, next)));
  app.use('/api/gestion', require('../main/local-api/routes/gestion.routes')({ botService, requerirSesion: (req, _r, next) => { req.user = { _id: 'u1' }; next(); }, userDataDir: dir }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/gestion`;
  const j = async (p, body, method) => { const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = t; } return { status: r.status, body: b }; };

  // planilla típica del usuario (encabezados propios, teléfonos en distintos formatos)
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Clientes');
  ws.addRows([
    ['Nombre y Apellido', 'Celular', 'Mail', 'Grupo', 'Observaciones'],
    ['Ana López', '+54 9 2241 49-7226', 'ana@mail.com', 'frecuente, cumple en mayo', 'alérgica al amoníaco'],
    ['Luis Paz', 2241000001, 'LUIS@mail.com', 'VIP', ''],
    ['Marta', '2241 00-0002', 'no-es-un-mail', '', ''],
    ['Sin teléfono', '', '', '', ''],
    ['Tel corto', '12345', '', '', ''],
    ['Luis repetido', '2241 000001', '', '', ''],
    ['', '', '', '', ''],
  ]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  let r = await j('/analizar', { nombre: 'clientes.xlsx', base64: buf.toString('base64') });
  assert(r.status === 200 && r.body.tipoSugerido === 'clientes', 'detecta solo que es una planilla de clientes (tiene teléfono y no tiene precio)');
  const { importacionId } = r.body; const mapeo = r.body.hojas[0].mapeoSugerido.clientes;
  assert(mapeo.nombre === 0 && mapeo.telefono === 1 && mapeo.email === 2 && mapeo.etiquetas === 3 && mapeo.notas === 4, 'sugiere las columnas (Nombre y Apellido, Celular, Mail, Grupo, Observaciones)');

  r = await j('/previsualizar', { importacionId, hoja: 0, tipo: 'clientes', mapeo: { nombre: 0 } });
  assert(r.status === 400 && /tel[eé]fono/i.test(r.body.error), 'sin columna de teléfono avisa claramente');
  r = await j('/previsualizar', { importacionId, hoja: 0, tipo: 'clientes', mapeo });
  const f = r.body.filas;
  assert(r.body.resumen.actualizan === 1 && r.body.resumen.nuevos === 2 && r.body.resumen.errores === 2 && r.body.resumen.duplicados === 1, 'vista previa: 1 ya existe, 2 nuevos, 2 con error (sin teléfono / teléfono corto) y 1 repetido');
  assert(f[0].estado === 'actualiza' && f[0].dato.telefono === '5492241497226' && f[0].dato.etiquetas.join() === 'frecuente,cumple en mayo', 'normaliza el teléfono a formato WhatsApp y separa las etiquetas');
  assert(f[1].dato.telefono === '5492241000001' && f[1].estado === 'duplicado' && /fila 6/.test(f[1].avisos.join()), 'un teléfono repetido en el archivo usa la última fila');
  assert(f[2].avisos.some((a) => /no válido/.test(a)) && f[2].dato.email === '', 'un mail inválido se descarta con aviso (no bloquea al cliente)');
  assert(f[3].errores[0] === 'Falta el teléfono' && /no válido/.test(f[4].errores[0]), 'errores claros por teléfono faltante o inválido');

  r = await j('/confirmar', { importacionId, hoja: 0, tipo: 'clientes', mapeo, modo: 'reemplazar' });
  assert(r.status === 200 && r.body.agregados === 2 && r.body.actualizados === 1, 'confirmar: 2 nuevos y 1 actualizado (el modo "reemplazar" se trata como "agregar": los clientes nunca se borran)');
  const deshacerId = r.body.deshacerId;

  const ana = await BotCliente.findOne({ userId: 'u1', jid: '5492241497226@s.whatsapp.net' });
  assert(ana.nombre === 'Ana' && ana.historial.length === 1 && ana.turnosConfirmados.length === 1 && ana.perfilResumen === 'le gusta el té', 'el cliente existente conserva nombre, historial, turnos y perfil');
  assert(ana.etiquetas.includes('VIP') && ana.etiquetas.includes('frecuente') && ana.email === 'ana@mail.com' && ana.notas === 'alérgica al amoníaco', 'pero se le suman las etiquetas, el mail y las notas de la planilla');
  const luis = await BotCliente.findOne({ userId: 'u1', jid: '5492241000001@s.whatsapp.net' });
  assert(luis && luis.nombre === 'Luis repetido' === false || luis.nombre.startsWith('Luis'), 'el cliente nuevo quedó creado');
  assert(luis.historial.length === 0 && luis.turnosConfirmados.length === 0 && luis.silenciado === false && luis.origenImport === true, 'con la estructura que espera el bot (historial vacío, sin silenciar) y marcado como importado');
  assert((await BotCliente.findOne({ userId: 'u2', jid: '5492241000001@s.whatsapp.net' })).nombre === 'De otro usuario', 'no toca los clientes de otro usuario');
  assert(importados.length === 2 && importados.every((x) => /@s\.whatsapp\.net$/.test(x)), 'avisa al bot cuáles son los clientes nuevos para que los reconozca al instante');

  // el bot los incorpora a su memoria sin pisar charlas en curso
  const svc = crearClientes('u1', () => {});
  await svc.inicializar(1);
  await BotCliente.create({ userId: 'u1', jid: '5492241555555@s.whatsapp.net', nombre: 'Recién importada', historial: [], turnosConfirmados: [] });
  const antes = svc.cargarMemoria('5492241555555@s.whatsapp.net');
  const cuantos = await svc.cargarNuevos(['5492241555555@s.whatsapp.net', '5492241497226@s.whatsapp.net']);
  assert(antes === null && cuantos === 1 && svc.cargarMemoria('5492241555555@s.whatsapp.net').nombre === 'Recién importada', 'el bot carga al cliente importado en su memoria sin reiniciar');
  svc.cargarMemoria('5492241497226@s.whatsapp.net').historial.push({ role: 'user', content: 'charla en curso' });
  await svc.cargarNuevos(['5492241497226@s.whatsapp.net']);
  assert(svc.cargarMemoria('5492241497226@s.whatsapp.net').historial.some((m) => m.content === 'charla en curso'), 'cargar de nuevo NO pisa una charla en curso');

  // segunda importación: ahora los 3 ya existen
  r = await j('/analizar', { nombre: 'clientes.xlsx', base64: buf.toString('base64') });
  r = await j('/previsualizar', { importacionId: r.body.importacionId, hoja: 0, tipo: 'clientes', mapeo });
  assert(r.body.resumen.nuevos === 0 && r.body.resumen.actualizan === 3, 'volver a importar la misma planilla no duplica clientes');

  // deshacer: se van los importados, el cliente con historial queda
  r = await j('/deshacer', { deshacerId });
  assert(r.status === 200, 'deshacer responde OK');
  assert(!(await BotCliente.findOne({ userId: 'u1', jid: '5492241000001@s.whatsapp.net' })), 'deshacer quita a los clientes que se habían importado');
  const ana2 = await BotCliente.findOne({ userId: 'u1', jid: '5492241497226@s.whatsapp.net' });
  assert(ana2 && ana2.historial.length === 1 && ana2.nombre === 'Ana' && !ana2.etiquetas.includes('frecuente') && ana2.email !== 'ana@mail.com', 'y deja a Ana como estaba antes (sin las etiquetas ni el mail agregados), con su historial intacto');
  assert(!!(await BotCliente.findOne({ userId: 'u1', jid: '123456789012345@lid' })), 'los demás clientes siguen ahí');

  // un importado que ya habló con el bot NO se borra al deshacer
  r = await j('/analizar', { nombre: 'clientes.xlsx', base64: buf.toString('base64') });
  r = await j('/confirmar', { importacionId: r.body.importacionId, hoja: 0, tipo: 'clientes', mapeo });
  await BotCliente.findOneAndUpdate({ userId: 'u1', jid: '5492241000001@s.whatsapp.net' }, { $set: { historial: [{ role: 'user', content: 'hola, soy Luis' }] } });
  await j('/deshacer', { deshacerId: r.body.deshacerId });
  assert(!!(await BotCliente.findOne({ userId: 'u1', jid: '5492241000001@s.whatsapp.net' })), 'si un cliente importado ya escribió al bot, deshacer NO lo borra');

  // exportar / plantilla
  r = await fetch(`${base}/plantilla?tipo=clientes&formato=csv`);
  const csv = await r.text();
  assert(r.status === 200 && /Nombre;Teléfono;Email;Etiquetas;Notas/.test(csv) && /Ana López/.test(csv), 'la plantilla de clientes se baja en CSV con un ejemplo');
  r = await fetch(`${base}/plantilla?tipo=proveedores&formato=xlsx`);
  assert(r.status === 200, 'la plantilla de proveedores ahora también se baja (antes daba error)');
  r = await fetch(`${base}/exportar?tipo=clientes&formato=csv`);
  const exp = await r.text();
  assert(/Ana/.test(exp) && /5492241497226/.test(exp) && !/hola/.test(exp), 'exportar clientes baja los datos de contacto pero NO las conversaciones');
  assert((await fetch(`${base}/exportar?tipo=otra-cosa`)).status === 400, 'tipo inválido → 400');
  const xl = await exportarXlsx('clientes', [{ nombre: 'Z', telefono: '549224', etiquetas: ['a', 'b'] }]);
  assert(xl.length > 1000 && exportarCsv('clientes', [{ nombre: '=cmd', telefono: '1', etiquetas: [] }]).toString().includes("'=cmd"), 'el Excel se genera y el CSV neutraliza fórmulas');

  srv.close();
  console.log('\n✅ Todos los tests de clientes-import pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
