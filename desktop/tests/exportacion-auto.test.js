// tests/exportacion-auto.test.js — exportación automática de planillas a una carpeta (Drive / OneDrive / Dropbox).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-expa-'));
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-expa-dest-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const EX = require('../main/exportacion-auto');

(async () => {
  console.log('\n[exportación automática] Tests:');
  assert(EX.leerConfig(dir).activa === false && EX.leerConfig(dir).cadaHoras === 24, 'apagada por defecto');
  assert(!EX.guardarConfig(dir, { activa: true }).ok, 'no se puede activar sin carpeta');
  assert(!EX.guardarConfig(dir, { carpeta: 'relativa/ruta' }).ok && !EX.guardarConfig(dir, { carpeta: path.join(carpeta, 'no-existe') }).ok, 'la carpeta tiene que ser una ruta completa y existir');
  assert(!EX.guardarConfig(dir, { cadaHoras: 3 }).ok && EX.guardarConfig(dir, { carpeta, cadaHoras: 6, activa: true }).ok && EX.leerConfig(dir).cadaHoras === 6 && EX.leerConfig(dir).activa, 'configura carpeta, frecuencia y activa');

  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const Turno = require('../main/bot-engine/models/Turno');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Config = require('../main/bot-engine/models/Config');
  const modelos = { Movimiento, Turno, BotCliente, Config };
  const f = new Date(2026, 9, 3, 12, 0); // 3 de octubre: también se exporta septiembre
  await Config.create({ userId: 'u1', negocio: 'Barbería', catalogo: [{ nombre: 'Cera', precio: 6200, stock: 3, codigo: 'AK000001' }], serviciosList: [{ nombre: 'Corte', precio: 9000, duracion: 30 }] });
  await Movimiento.create({ userId: 'u1', tipo: 'gasto', monto: 5000, fecha: '2026-10-02', metodo: 'efectivo', categoria: 'Insumos', descripcion: 'x' });
  await Movimiento.create({ userId: 'u2', tipo: 'gasto', monto: 999, fecha: '2026-10-02', metodo: 'efectivo', categoria: 'Otro negocio', descripcion: 'NO' });
  await BotCliente.create({ userId: 'u1', jid: '5492241111111@s.whatsapp.net', nombre: 'Ana', telefono: '2241111111', numeroReal: '5492241111111', etiquetas: ['VIP'], historial: [], turnosConfirmados: [] });

  const arch = await EX.armarArchivos({ userId: 'u1', modelos, ahora: f });
  assert(arch.map((a) => a.nombre).join() === 'Caja-2026-10.xlsx,Caja-2026-09.xlsx,Clientes.xlsx,Productos.xlsx,Servicios.xlsx', 'arma Caja (este mes y, los primeros días, el anterior), Clientes, Productos y Servicios');
  assert(arch.every((a) => a.buffer.length > 1000 && a.buffer[0] === 0x50 && a.buffer[1] === 0x4b), 'cada planilla es un .xlsx válido');
  const a2 = await EX.armarArchivos({ userId: 'u1', modelos, ahora: new Date(2026, 9, 20) });
  assert(a2.filter((a) => a.nombre.startsWith('Caja-')).length === 1, 'a mitad de mes solo el mes en curso');
  // contenido: el gasto de u1 está; el de otro negocio no
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(arch[0].buffer);
  const celdas = []; wb.worksheets[0].eachRow((r) => celdas.push(r.values.join('|')));
  assert(celdas.some((c) => /Insumos/.test(c)) && !celdas.some((c) => /Otro negocio/.test(c)), 'la planilla de Caja tiene lo del negocio y nada de otro');
  const wbp = new ExcelJS.Workbook(); await wbp.xlsx.load(arch[3].buffer);
  const filasP = []; wbp.worksheets[0].eachRow((r) => filasP.push(r.values.join('|')));
  assert(/Código de barras/.test(filasP[0]) && /AK000001/.test(filasP[1]), 'Productos incluye el código de barras');

  // servicio
  let ahora = new Date(2026, 9, 3, 12, 0); let usuario = 'u1';
  const svc = EX.crearServicio({ userDataDir: dir, obtenerUserId: () => usuario, modelos, ahora: () => ahora, setI: () => 0 });
  let r = await svc.ejecutar();
  assert(r.ok && fs.existsSync(path.join(carpeta, 'Clientes.xlsx')) && fs.existsSync(path.join(carpeta, 'Caja-2026-10.xlsx')) && !fs.readdirSync(carpeta).some((n) => n.endsWith('.tmp')), 'escribe las planillas con nombres fijos y sin dejar temporales');
  assert(EX.leerConfig(dir).ultima && EX.leerConfig(dir).error === '' && EX.leerConfig(dir).archivos.length === 5, 'anota cuándo fue y qué archivos');
  const antes = fs.statSync(path.join(carpeta, 'Clientes.xlsx')).mtimeMs;
  r = await svc.revisar();
  assert(!r.ok && r.motivo === 'todavia-no' && fs.statSync(path.join(carpeta, 'Clientes.xlsx')).mtimeMs === antes, 'si todavía no pasó el tiempo elegido, no vuelve a escribir');
  ahora = new Date(2026, 9, 3, 19, 0);
  r = await svc.revisar();
  assert(r.ok, 'pasadas 6 horas, actualiza');
  EX.guardarConfig(dir, { activa: false });
  assert((await svc.revisar()).motivo === 'apagada', 'apagada: no hace nada');
  EX.guardarConfig(dir, { activa: true });
  usuario = null;
  assert((await svc.ejecutar()).motivo === 'sin-sesion', 'sin sesión no hace nada');
  usuario = 'u1';
  fs.writeFileSync(path.join(dir, 'exportacion.json'), JSON.stringify({ ...EX.leerConfig(dir), carpeta: path.join(carpeta, 'Clientes.xlsx', 'adentro-de-un-archivo') }));
  r = await svc.ejecutar();
  assert(!r.ok && /No se pudo escribir/.test(r.error) && /No se pudo escribir/.test(EX.leerConfig(dir).error), 'una carpeta inválida da un mensaje claro (y no rompe)');
  EX.guardarConfig(dir, { carpeta });
  let rechazo = false; try { EX.escribir(carpeta, [{ nombre: '../escape.xlsx', buffer: Buffer.from('x') }]); } catch { rechazo = true; }
  assert(rechazo, 'no acepta nombres de archivo con rutas');
  assert(!fs.existsSync(path.join(path.dirname(carpeta), 'escape.xlsx')), '…y no escribe fuera de la carpeta');

  // API
  const app = express(); app.use(express.json());
  app.use('/api/app/exportacion', require('../main/local-api/routes/exportacion.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir, appHooks: { elegirCarpeta: async () => carpeta }, servicioExportacion: svc }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/exportacion`;
  const j = async (m, p, body) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  let x = await j('GET', '');
  assert(x.status === 200 && x.body.carpeta === carpeta && x.body.horas.length === 4, 'GET estado');
  assert((await j('PUT', '', { cadaHoras: 99 })).status === 400 && (await j('PUT', '', { cadaHoras: 12 })).body.cadaHoras === 12, 'PUT valida');
  assert((await j('POST', '/elegir-carpeta')).body.carpeta === carpeta, 'elegir carpeta');
  x = await j('POST', '/ahora');
  assert(x.status === 200 && x.body.archivos.length === 5, 'actualizar ahora');
  srv.close();
  const P = require('../main/perfiles');
  assert(!P.puede('encargado', 'GET', '/api/app/exportacion') && P.puede('propietario', 'POST', '/api/app/exportacion/ahora'), 'solo el dueño la configura (se llevan datos de clientes)');

  console.log('\n✅ Todos los tests de exportación automática pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
