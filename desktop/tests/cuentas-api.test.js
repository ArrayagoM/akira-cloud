// tests/cuentas-api.test.js — Deudores (clientes que deben) y Proveedores (lo que se les debe):
// saldos, antigüedad, reflejo en la Caja, recordatorio por WhatsApp, importación y exportación.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-cuentas-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[cuentas-api] Tests:');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Proveedor = require('../main/bot-engine/models/Proveedor');
  const Config = require('../main/bot-engine/models/Config');
  const ExcelJS = require('exceljs');
  const caja = require('../main/gestion/caja');

  let usuario = 'u1'; let botActivo = true; const enviados = [];
  const botService = { recargarConfig: () => true, slotsActivos: () => (botActivo ? [0] : []), enviarTexto: (slot, jid, texto) => { enviados.push({ slot, jid, texto }); return true; } };
  const deps = { botService, requerirSesion: (req, _r, next) => { req.user = { _id: usuario }; next(); }, userDataDir: dir };
  const app = express();
  const jsonGeneral = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path === '/api/gestion/analizar' ? next() : jsonGeneral(req, res, next)));
  for (const [ruta, modulo] of [['caja', 'caja'], ['deudores', 'deudores'], ['proveedores', 'proveedores'], ['gestion', 'gestion']]) app.use(`/api/${ruta}`, require(`../main/local-api/routes/${modulo}.routes`)(deps));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (p, body, method) => { const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})), r }; };

  const hoy = caja.fechaLocal(new Date());
  const haceDias = (n) => caja.fechaLocal(new Date(Date.now() - n * 86400000));
  const mes = hoy.slice(0, 7);
  await Config.findOneAndUpdate({ userId: 'u1' }, { negocio: 'Barbería Test', aliasTransferencia: 'barberia.mp' }, { upsert: true });

  // ───────────── DEUDORES ─────────────
  let r = await j('/deudores/movimiento', { nombre: 'Ana López', telefono: '2241497226', tipo: 'cargo', monto: 10000, fecha: haceDias(30), concepto: 'Corte y color' });
  assert(r.status === 200 && r.body.clave === 'tel:2241497226', 'carga una deuda nueva a un cliente (se identifica por su teléfono)');
  await j('/deudores/movimiento', { nombre: 'Ana', telefono: '+54 9 2241 49-7226', tipo: 'cargo', monto: 5000, fecha: hoy, concepto: 'Barba' });
  r = await j('/deudores');
  assert(r.body.cantidad === 1 && r.body.total === 15000 && r.body.deudores[0].saldo === 15000, 'el mismo teléfono escrito distinto es el mismo cliente: una sola deuda de $15.000');
  assert(r.body.deudores[0].antiguedadDias === 30 && r.body.mayorAtraso === 30, 'la antigüedad es la del cargo más viejo sin pagar (30 días)');
  assert(r.body.deudores[0].whatsapp === true, 'sabe que a este cliente se le puede escribir por WhatsApp');

  assert((await j('/deudores/movimiento', { nombre: 'Sin monto', tipo: 'cargo', monto: 0 })).status === 400, 'rechaza un monto en cero');
  assert((await j('/deudores/movimiento', { tipo: 'cargo', monto: 5 })).status === 400, 'pide el nombre del cliente');
  assert((await j('/deudores/movimiento', { nombre: 'X', tipo: 'regalo', monto: 5 })).status === 400, 'rechaza un tipo inválido');
  assert((await j('/deudores/movimiento', { clave: 'tel:0000000000', tipo: 'pago', monto: 5 })).status === 404, 'un cliente inexistente se rechaza');

  r = await j('/deudores/movimiento', { clave: 'tel:2241497226', tipo: 'pago', monto: 10000, fecha: hoy, metodo: 'transferencia', concepto: 'Pago parcial' });
  assert(r.status === 200, 'registra un pago a cuenta');
  r = await j('/deudores');
  assert(r.body.total === 5000 && r.body.deudores[0].antiguedadDias === 0, 'el pago cancela primero lo más viejo: queda $5.000 de hoy, sin atraso');

  let c = (await j(`/caja?mes=${mes}`)).body;
  const cobro = c.movimientos.find((m) => m.categoria === 'Cobro de deudas');
  assert(cobro && cobro.tipo === 'ingreso' && cobro.monto === 10000 && cobro.metodo === 'transferencia' && cobro.origen === 'ctacte', 'el pago entró a la Caja como ingreso "Cobro de deudas"');
  assert(c.movimientos.filter((m) => m.categoria === 'Cobro de deudas').length === 1, 'la deuda fiada (el cargo) NO entró a la Caja: todavía no se cobró');
  assert(c.cuentas.teDeben === 5000, 'la Caja muestra cuánto te deben en total');
  assert((await j(`/caja/movimiento/${cobro._id}`, { monto: 1 }, 'PUT')).status === 400 && (await j(`/caja/movimiento/${cobro._id}`, null, 'DELETE')).status === 400, 'el cobro no se edita ni se borra desde la Caja (se gestiona desde Deudores)');

  r = await j('/deudores/detalle?clave=tel:2241497226');
  assert(r.body.movimientos.length === 3 && r.body.cliente.saldo === 5000, 'el detalle trae el historial completo y el saldo');
  assert(r.body.mensaje.includes('*$5.000*') && r.body.mensaje.includes('Barbería Test') && r.body.mensaje.includes('Alias: barberia.mp') && r.body.mensaje.includes('Hola Ana'), 'sugiere un recordatorio con monto, negocio y alias de pago');

  // recordatorio por WhatsApp
  botActivo = false;
  r = await j('/deudores/recordar', { clave: 'tel:2241497226', texto: r.body.mensaje });
  assert(r.status === 409 && enviados.length === 0, 'sin el bot conectado no se envía nada y se explica por qué');
  botActivo = true;
  const texto = (await j('/deudores/detalle?clave=tel:2241497226')).body.mensaje;
  r = await j('/deudores/recordar', { clave: 'tel:2241497226', texto });
  assert(r.status === 200 && enviados.length === 1 && enviados[0].jid === '5492241497226@s.whatsapp.net' && enviados[0].texto === texto, 'envía el recordatorio por WhatsApp al número correcto con el texto confirmado');
  r = await j('/deudores/recordar', { clave: 'tel:2241497226', texto });
  assert(r.status === 409 && r.body.requiereConfirmar && enviados.length === 1, 'un segundo recordatorio seguido pide confirmación (no se spamea al cliente)');
  r = await j('/deudores/recordar', { clave: 'tel:2241497226', texto, forzar: true });
  assert(r.status === 200 && enviados.length === 2, 'si el dueño insiste, se envía igual');
  assert((await j('/deudores')).body.deudores[0].ultimoRecordatorio === hoy, 'queda anotada la fecha del último recordatorio');
  assert((await j('/deudores/detalle?clave=tel:2241497226')).body.movimientos.length === 3, 'los recordatorios no ensucian el historial de deuda');
  assert((await j('/deudores/recordar', { clave: 'tel:2241497226', texto: '' })).status === 400, 'no envía un mensaje vacío');

  await j('/deudores/movimiento', { nombre: 'Luis Sin Teléfono', tipo: 'cargo', monto: 2000, fecha: hoy });
  r = await j('/deudores/recordar', { clave: 'nom:luis sin telefono', texto: 'Hola' });
  assert(r.status === 400 && /tel[eé]fono/i.test(r.body.error), 'a un cliente sin teléfono no se le puede escribir y se avisa');
  r = await j('/deudores');
  assert(r.body.cantidad === 2 && r.body.deudores[0].clave === 'tel:2241497226' && r.body.total === 7000, 'la lista se ordena por mayor deuda y suma ambos clientes');

  await BotCliente.create({ userId: 'u1', jid: '5492245550000@s.whatsapp.net', nombre: 'Marta Gómez' });
  r = await j('/deudores/clientes?q=marta');
  assert(r.body.clientes.length === 1 && r.body.clientes[0].jid === '5492245550000@s.whatsapp.net', 'busca entre los clientes del bot para no tipear datos');
  await j('/deudores/movimiento', { nombre: 'Marta Gómez', jid: '5492245550000@s.whatsapp.net', tipo: 'cargo', monto: 1500, fecha: hoy });
  assert((await j('/deudores')).body.deudores.find((d) => d.nombre === 'Marta Gómez').whatsapp === true, 'un cliente elegido del bot queda listo para recordatorios');

  // borrar el pago devuelve la deuda y limpia la Caja
  const pagoId = (await j('/deudores/detalle?clave=tel:2241497226')).body.movimientos.find((m) => m.tipo === 'pago')._id;
  assert((await j(`/deudores/movimiento/${pagoId}`, null, 'DELETE')).status === 200, 'se puede borrar un pago cargado por error');
  assert((await j('/deudores')).body.deudores.find((d) => d.clave === 'tel:2241497226').saldo === 15000, 'al borrar el pago la deuda vuelve a $15.000');
  c = (await j(`/caja?mes=${mes}`)).body;
  assert(!c.movimientos.some((m) => m.categoria === 'Cobro de deudas'), 'y el ingreso que había generado en la Caja desaparece');
  await j('/deudores/movimiento', { clave: 'tel:2241497226', tipo: 'pago', monto: 3000, fecha: hoy, enCaja: false });
  c = (await j(`/caja?mes=${mes}`)).body;
  assert(!c.movimientos.some((m) => m.categoria === 'Cobro de deudas'), 'se puede registrar un pago sin pasarlo por la Caja (si ya lo cargaste a mano)');

  usuario = 'u2';
  assert((await j('/deudores')).body.cantidad === 0 && (await j(`/deudores/movimiento/${pagoId}`, null, 'DELETE')).status === 404 && (await j('/deudores/detalle?clave=tel:2241497226')).status === 404, 'otro usuario no ve ni toca mis deudores');
  usuario = 'u1';

  const xl = await fetch(`${base}/deudores/exportar?formato=xlsx`); const wbx = new ExcelJS.Workbook(); await wbx.xlsx.load(Buffer.from(await xl.arrayBuffer()));
  assert(xl.status === 200 && wbx.getWorksheet('Deudores').rowCount >= 4, 'exporta los deudores a Excel con su total');
  const pd = await fetch(`${base}/deudores/exportar?formato=pdf`); const pdf = Buffer.from(await pd.arrayBuffer());
  const txt = await require('../main/gestion/pdf-texto').textoDePdf(pdf);
  assert(pd.status === 200 && /Quién me debe/.test(txt) && /Ana L/.test(txt) && /Total a cobrar/.test(txt), 'exporta el PDF de "quién me debe"');
  const cs = Buffer.from(await (await fetch(`${base}/deudores/exportar?formato=csv`)).arrayBuffer());
  assert(cs[0] === 0xef && cs.toString('utf8').includes('Cliente;Teléfono;Saldo'), 'exporta el CSV con BOM y separador ";"');

  // ───────────── PROVEEDORES ─────────────
  r = await j('/proveedores', { nombre: 'Distribuidora Sur', telefono: '2241 555000', cuit: '30-71234567-8', rubro: 'Insumos' });
  assert(r.status === 200, 'da de alta un proveedor (CUIT con guiones)');
  const prov = r.body.proveedor; const pid = String(prov._id);
  assert((await Proveedor.findById(pid).lean()).cuit === '30712345678', 'el CUIT se guarda solo con números');
  assert((await j('/proveedores', { nombre: ' distribuidora SUR ' })).status === 409, 'no permite dos proveedores con el mismo nombre');
  assert((await j('/proveedores', { nombre: 'Otro', cuit: '123' })).status === 400 && (await j('/proveedores', { nombre: '' })).status === 400, 'valida el CUIT y exige el nombre');

  r = await j(`/proveedores/${pid}/movimiento`, { tipo: 'cargo', monto: 20000, fecha: hoy, concepto: 'Pedido de shampoo' });
  assert(r.status === 200, 'registra una compra a crédito');
  assert(!(await j(`/caja?mes=${mes}`)).body.movimientos.some((m) => m.categoria === 'Proveedores'), 'una compra a crédito NO sale de la Caja todavía');
  r = await j(`/proveedores/${pid}/movimiento`, { tipo: 'pago', monto: 8000, fecha: hoy, metodo: 'transferencia' });
  c = (await j(`/caja?mes=${mes}`)).body;
  const pagoProv = c.movimientos.find((m) => m.categoria === 'Proveedores');
  assert(pagoProv && pagoProv.tipo === 'gasto' && pagoProv.monto === 8000 && pagoProv.proveedorNombre === 'Distribuidora Sur', 'el pago al proveedor sale de la Caja como gasto "Proveedores"');
  assert(c.cuentas.debes === 12000, 'la Caja muestra cuánto debés a proveedores');
  assert((await j(`/caja/movimiento/${pagoProv._id}`, null, 'DELETE')).status === 400, 'ese gasto se gestiona desde Proveedores, no desde la Caja');

  // gasto al contado vinculado desde la Caja
  assert((await j('/caja/movimiento', { tipo: 'gasto', monto: 3000, fecha: hoy, categoria: 'Insumos y mercadería', proveedorId: pid, descripcion: 'Compra de cera' })).status === 200, 'desde la Caja se vincula un gasto al contado a un proveedor');
  assert((await j('/caja/movimiento', { tipo: 'gasto', monto: 1, fecha: hoy, proveedorId: 'inexistente' })).status === 404, 'un proveedor que no existe se rechaza');
  r = await j('/proveedores');
  const dist = r.body.proveedores.find((p) => p._id === pid);
  assert(dist.saldo === 12000 && dist.compradoMes === 23000 && dist.ultimaCompra === hoy && r.body.totalDeuda === 12000, 'saldo $12.000; comprado en el mes $23.000 (a crédito + contado); total adeudado');
  r = await j(`/proveedores/${pid}`);
  assert(r.body.movimientos.length === 3 && r.body.movimientos.some((m) => m.origen === 'caja' && m.monto === 3000), 'el historial junta compras a crédito, pagos y gastos al contado');

  usuario = 'u2';
  assert((await j('/proveedores')).body.proveedores.length === 0 && (await j(`/proveedores/${pid}`)).status === 404 && (await j('/caja/movimiento', { tipo: 'gasto', monto: 1, fecha: hoy, proveedorId: pid })).status === 404, 'otro usuario no ve ni usa mis proveedores');
  usuario = 'u1';

  assert((await j(`/proveedores/${pid}`, null, 'DELETE')).status === 409, 'no se archiva un proveedor al que todavía le debés');
  await j(`/proveedores/${pid}/movimiento`, { tipo: 'pago', monto: 12000, fecha: hoy, metodo: 'efectivo' });
  r = await j(`/proveedores/${pid}`, null, 'DELETE');
  assert(r.status === 200 && r.body.archivado === true, 'saldado, se archiva (su historial se conserva)');
  assert((await j('/proveedores')).body.proveedores.length === 0 && (await j(`/proveedores/${pid}`)).status === 200, 'el archivado sale de la lista pero su historial sigue consultable');
  const sinUso = (await j('/proveedores', { nombre: 'Sin historial' })).body.proveedor;
  assert((await j(`/proveedores/${sinUso._id}`, null, 'DELETE')).body.archivado === false && !(await Proveedor.findById(sinUso._id).lean()), 'un proveedor sin movimientos se borra de verdad');
  assert((await j(`/proveedores/${pid}`, { nombre: 'Distribuidora Sur SA', activo: true }, 'PUT')).status === 200 && (await j('/proveedores')).body.proveedores[0].nombre === 'Distribuidora Sur SA', 'se puede editar y reactivar un proveedor archivado');

  // importar proveedores desde Excel
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Prov');
  ws.addRows([['Proveedor', 'Teléfono', 'CUIT', 'Rubro'], ['Distribuidora Sur SA', '2241 111222', '', 'Insumos'], ['Mayorista Norte', '2241 333444', '30-70000000-1', 'Bebidas'], ['Ferretería Sol', '', '123', 'Mantenimiento'], ['', 'sin nombre', '', '']]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  r = await j('/gestion/analizar', { nombre: 'proveedores.xlsx', base64: buf.toString('base64') });
  const mapeo = r.body.hojas[0].mapeoSugerido.proveedores;
  assert(mapeo.nombre === 0 && mapeo.telefono === 1 && mapeo.cuit === 2 && mapeo.rubro === 3, 'el asistente reconoce Proveedor, Teléfono, CUIT y Rubro');
  const imp = r.body.importacionId;
  r = await j('/gestion/previsualizar', { importacionId: imp, hoja: 0, tipo: 'proveedores', mapeo });
  assert(r.body.resumen.nuevos === 2 && r.body.resumen.actualizan === 1 && r.body.resumen.errores === 1, 'vista previa: 2 nuevos, 1 que ya existe y 1 sin nombre');
  assert(r.body.filas[2].avisos[0].includes('CUIT'), 'avisa del CUIT mal escrito sin frenar la importación');
  const antes = (await Proveedor.find({ userId: 'u1' }).lean()).length;
  r = await j('/gestion/confirmar', { importacionId: imp, hoja: 0, tipo: 'proveedores', mapeo });
  assert(r.status === 200 && r.body.agregados === 2 && r.body.actualizados === 1, 'importa: 2 nuevos y 1 actualizado');
  const deshacer = r.body.deshacerId;
  const sur = (await Proveedor.find({ userId: 'u1' }).lean()).find((p) => p.nombre === 'Distribuidora Sur SA');
  assert(sur.telefono === '2241 111222' && String(sur._id) === pid, 'actualizar conserva la identidad (y su historial) del proveedor');
  r = await j('/gestion/deshacer', { deshacerId: deshacer });
  const despues = await Proveedor.find({ userId: 'u1' }).lean();
  assert(r.status === 200 && despues.length === antes && despues.find((p) => String(p._id) === pid).telefono === '2241 555000', 'deshacer quita los nuevos y restaura los datos anteriores');

  const xp = await fetch(`${base}/proveedores/exportar?formato=xlsx`); const wbp = new ExcelJS.Workbook(); await wbp.xlsx.load(Buffer.from(await xp.arrayBuffer()));
  assert(xp.status === 200 && wbp.getWorksheet('Proveedores').getRow(1).getCell(1).value === 'Proveedor', 'exporta los proveedores a Excel');
  const pp = Buffer.from(await (await fetch(`${base}/proveedores/exportar?formato=pdf`)).arrayBuffer());
  assert(pp.slice(0, 4).toString() === '%PDF', 'exporta los proveedores a PDF');

  srv.close();
  console.log('\n✅ Todos los tests de cuentas-api pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
