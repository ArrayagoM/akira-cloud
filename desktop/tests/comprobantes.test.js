// tests/comprobantes.test.js — presupuestos y recibos en PDF: armado, numeración, PDF, envío por WhatsApp, recibo desde presupuesto y Caja.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-comp-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const comp = require('../main/gestion/comprobantes');
const logoLib = require('../main/logo-negocio');

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ/P2QAAAABJRU5ErkJggg==', 'base64');

(async () => {
  console.log('\n[comprobantes] Tests:');
  const items = [{ nombre: 'Corte de pelo', precio: 9000 }, { nombre: 'Cera modeladora', precio: 6200 }];
  let r = comp.sanear({ tipo: 'presupuesto', cliente: { nombre: 'Ana López', telefono: '+54 9 2241 49-7226' }, items: [{ nombre: 'Corte de pelo', cantidad: 2 }, { nombre: 'cera modeladora', cantidad: 1 }], descuentoPct: 10, validezDias: 7 }, items, '2026-10-07');
  assert(r.ok && r.dato.total === 21780 && r.dato.bruto === 24200 && r.dato.descuento === 2420 && r.dato.venceEl === '2026-10-14' && r.dato.clienteTelefono === '5492241497226', 'presupuesto: precios del catálogo, descuento, vencimiento y teléfono limpio');
  assert(r.dato.items[1].nombre === 'Cera modeladora', 'toma el nombre oficial del catálogo');
  r = comp.sanear({ tipo: 'recibo', cliente: { nombre: 'Luis' }, items: [{ nombre: 'Arreglo especial', cantidad: 1, precio: 3500 }], metodo: 'bitcoin' }, items, '2026-10-07');
  assert(r.ok && r.dato.metodo === 'efectivo' && r.dato.total === 3500 && r.dato.venceEl === '', 'recibo con ítem suelto (con precio); método raro = efectivo');
  assert(!comp.sanear({ tipo: 'factura', cliente: { nombre: 'x' }, items: [{ nombre: 'Corte de pelo', cantidad: 1 }] }, items).ok, 'solo presupuestos y recibos');
  assert(!comp.sanear({ tipo: 'recibo', cliente: { nombre: '  ' }, items: [{ nombre: 'Corte de pelo', cantidad: 1 }] }, items).ok, 'exige el nombre del cliente');
  assert(!comp.sanear({ tipo: 'recibo', cliente: { nombre: 'x' }, items: [] }, items).ok && !comp.sanear({ tipo: 'recibo', cliente: { nombre: 'x' }, items: [{ nombre: 'Inexistente', cantidad: 1 }] }, items).ok, 'exige al menos un ítem, y los que no están en el catálogo necesitan precio');
  assert(!comp.sanear({ tipo: 'recibo', cliente: { nombre: 'x' }, items: [{ nombre: 'Corte de pelo', cantidad: 1 }], fecha: '2026-02-31' }, items).ok, 'fecha inválida');
  assert(comp.sanear({ tipo: 'presupuesto', cliente: { nombre: 'x' }, items: [{ nombre: 'Corte de pelo', cantidad: 1 }], validezDias: 9999 }, items, '2026-01-01').dato.validezDias === 365, 'la validez tiene tope');
  assert(comp.formatoNumero('presupuesto', 7) === 'P-0007' && comp.formatoNumero('recibo', 123) === 'R-0123', 'numeración con prefijo por tipo');
  const base = { tipo: 'presupuesto', numero: 1, fecha: '2026-10-07', venceEl: '2026-10-22', validezDias: 15, clienteNombre: 'Ana López', clienteTelefono: '2241497226', items: [{ nombre: 'Corte de pelo', precio: 9000, cantidad: 2 }], bruto: 18000, descuento: 0, descuentoPct: 0, total: 18000, nota: 'Incluye lavado', estado: 'emitido' };
  assert(/presupuesto P-0001 de Tincho/.test(comp.textoWhatsApp(base, 'Tincho')) && /22\/10\/2026/.test(comp.textoWhatsApp(base)) && /recibo R-0002/.test(comp.textoWhatsApp({ ...base, tipo: 'recibo', numero: 2 })), 'texto de WhatsApp');

  const pdf = await comp.generarPdf({ comprobante: base, negocio: 'Barbería Tincho', logo: PNG, pago: { alias: 'tincho.mp', cbu: '0000003100012345678901', banco: 'Mercado Pago' } });
  assert(pdf.slice(0, 4).toString() === '%PDF' && pdf.length > 1500, 'genera un PDF válido (con logo y datos de pago)');
  const pdf2 = await comp.generarPdf({ comprobante: { ...base, tipo: 'recibo', metodo: 'transferencia', estado: 'anulado', items: Array.from({ length: 60 }, (_, i) => ({ nombre: `Producto número ${i + 1} con un nombre bastante largo para que ocupe más de una línea en el PDF`, precio: 1000, cantidad: 1 })), total: 60000, bruto: 60000 }, negocio: '', logo: Buffer.from('no es una imagen') });
  assert(pdf2.slice(0, 4).toString() === '%PDF', 'muchos ítems (varias páginas), sin nombre y con un logo ilegible: no se rompe');

  // logo
  assert(logoLib.leer(dir) === null, 'sin logo al principio');
  assert(logoLib.guardar(dir, PNG) === 'png' && Buffer.isBuffer(logoLib.leer(dir)), 'guarda el logo');
  let falla = null; try { logoLib.guardar(dir, Buffer.from('GIF89a......................')); } catch (e) { falla = e; }
  assert(falla && falla.status === 415, 'rechaza lo que no es JPG/PNG');
  logoLib.quitar(dir);
  assert(logoLib.leer(dir) === null, 'quitar el logo');

  // ── rutas ──
  const Config = require('../main/bot-engine/models/Config');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  await Config.create({ userId: 'u1', negocio: 'Barbería Tincho', aliasTransferencia: 'tincho.mp', catalogo: [{ nombre: 'Cera modeladora', precio: 6200, stock: 4, disponible: true }, { nombre: 'Oculto', precio: 100, disponible: false }], serviciosList: [{ nombre: 'Corte de pelo', precio: 9000, duracion: 30 }] });
  await BotCliente.create({ userId: 'u1', jid: '5492241497226@s.whatsapp.net', nombre: 'Ana López', telefono: '2241497226', numeroReal: '5492241497226', historial: [], turnosConfirmados: [] });
  const enviados = []; let conectado = true;
  const botService = { enviarDocumento: async (jid, buf, nombre, caption) => { if (!conectado) return false; enviados.push({ jid, nombre, caption, esPdf: buf.slice(0, 4).toString() === '%PDF' }); return true; } };
  const app = express(); app.use(express.json());
  app.use('/api/app/comprobantes', require('../main/local-api/routes/comprobantes.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, botService, userDataDir: dir }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const baseUrl = `http://127.0.0.1:${srv.address().port}/api/app/comprobantes`;
  const j = async (m, p, body) => { const x = await fetch(baseUrl + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json().catch(() => ({})) }; };

  let x = await j('GET', '/opciones');
  assert(x.body.items.length === 2 && x.body.items.some((i) => i.tipo === 'servicio') && !x.body.items.some((i) => i.nombre === 'Oculto') && x.body.datosDePago === true && x.body.tieneLogo === false, 'opciones: productos y servicios con precio (sin los ocultos)');
  x = await j('POST', '', { tipo: 'presupuesto', cliente: { nombre: 'Ana López', telefono: '2241497226' }, items: [{ nombre: 'Corte de pelo', cantidad: 2 }] });
  assert(x.status === 200 && x.body.codigo === 'P-0001', 'crea el presupuesto P-0001');
  const idP = x.body.id;
  x = await j('POST', '', { tipo: 'presupuesto', cliente: { nombre: 'Luis' }, items: [{ nombre: 'Cera modeladora', cantidad: 1 }] });
  assert(x.body.codigo === 'P-0002', 'la numeración sigue sola');
  assert((await j('POST', '', { tipo: 'presupuesto', cliente: { nombre: '' }, items: [] })).status === 400, 'datos inválidos → 400');

  const f = await fetch(`${baseUrl}/${idP}/pdf`);
  const buf = Buffer.from(await f.arrayBuffer());
  assert(f.status === 200 && /application\/pdf/.test(f.headers.get('content-type')) && /Presupuesto-P-0001\.pdf/.test(f.headers.get('content-disposition')) && buf.slice(0, 4).toString() === '%PDF', 'descarga el PDF');
  assert((await fetch(`${baseUrl}/inexistente/pdf`)).status === 404, 'PDF inexistente → 404');

  x = await j('POST', `/${idP}/enviar`);
  assert(x.status === 200 && enviados.length === 1 && enviados[0].jid === '5492241497226@s.whatsapp.net' && enviados[0].esPdf && /presupuesto P-0001/.test(enviados[0].caption), 'lo manda por WhatsApp al cliente (lo encuentra por su teléfono)');
  const luis = (await j('GET', '')).body.comprobantes.find((c) => c.codigo === 'P-0002');
  x = await j('POST', `/${luis._id}/enviar`);
  assert(x.status === 400 && /teléfono/.test(x.body.error), 'sin teléfono: avisa claro');
  conectado = false;
  assert((await j('POST', `/${idP}/enviar`)).status === 409, 'con el bot desconectado → 409 (sin romper)');
  conectado = true;

  assert((await j('POST', `/${idP}/estado`, { estado: 'aceptado' })).status === 200 && (await j('POST', `/${idP}/estado`, { estado: 'aceptado' })).status === 400, 'marcar aceptado (una sola vez)');
  assert((await j('POST', `/${idP}/estado`, { estado: 'cobrado' })).status === 400, 'estados no permitidos');

  x = await j('POST', `/${idP}/recibo`, { metodo: 'transferencia' });
  assert(x.status === 200 && x.body.codigo === 'R-0001', 'convierte el presupuesto en el recibo R-0001');
  const mov = (await Movimiento.find({ userId: 'u1', origen: 'recibo' }).lean());
  assert(mov.length === 1 && mov[0].monto === 18000 && mov[0].metodo === 'transferencia' && mov[0].tipo === 'ingreso', 'el cobro entra a la Caja');
  assert((await j('POST', `/${idP}/recibo`, {})).status === 409, 'no se puede hacer dos recibos del mismo presupuesto (no duplica el ingreso)');
  assert((await Movimiento.find({ userId: 'u1', origen: 'recibo' }).lean()).length === 1, '…y la Caja sigue con un solo ingreso');
  const lista = (await j('GET', '')).body.comprobantes;
  assert(lista.find((c) => c.codigo === 'P-0001').estado === 'cobrado' && lista.find((c) => c.codigo === 'R-0001').estado === 'cobrado' && (await j('GET', '?tipo=recibo')).body.comprobantes.length === 1, 'estados y filtro por tipo');

  const idR = lista.find((c) => c.codigo === 'R-0001')._id;
  x = await j('POST', `/${idR}/estado`, { estado: 'anulado' });
  assert(x.status === 200 && (await Movimiento.find({ userId: 'u1', origen: 'recibo' }).lean()).length === 0, 'anular un recibo saca el ingreso de la Caja');
  assert((await j('POST', `/${idR}/enviar`)).status === 400, 'un comprobante anulado no se envía');

  x = await j('POST', '', { tipo: 'recibo', cliente: { nombre: 'Marta' }, items: [{ nombre: 'Cera modeladora', cantidad: 1 }], metodo: 'efectivo', registrarEnCaja: true, concepto: 'Compra mostrador' });
  assert(x.body.codigo === 'R-0002' && (await Movimiento.find({ userId: 'u1', origen: 'recibo' }).lean()).length === 1, 'un recibo directo (numeración propia) y registrado en la Caja');
  x = await j('POST', '/logo', { base64: PNG.toString('base64') });
  assert(x.status === 200 && (await j('GET', '/opciones')).body.tieneLogo === true && (await fetch(`${baseUrl}/logo/ver`)).status === 200, 'subir el logo');
  assert((await j('POST', '/logo', { base64: Buffer.from('hola').toString('base64') })).status === 415, 'logo inválido → 415');
  assert((await j('DELETE', '/logo')).status === 200 && (await j('GET', '/opciones')).body.tieneLogo === false, 'quitar el logo');
  const otro = express(); otro.use(express.json());
  otro.use('/c', require('../main/local-api/routes/comprobantes.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u2' }; n(); }, botService, userDataDir: dir }));
  const s2 = await new Promise((rs) => { const s = otro.listen(0, '127.0.0.1', () => rs(s)); });
  assert((await fetch(`http://127.0.0.1:${s2.address().port}/c/${idP}/pdf`)).status === 404 && (await (await fetch(`http://127.0.0.1:${s2.address().port}/c`)).json()).comprobantes.length === 0, 'otro negocio no ve ni descarga estos comprobantes');
  s2.close(); srv.close();

  console.log('\n✅ Todos los tests de comprobantes pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
