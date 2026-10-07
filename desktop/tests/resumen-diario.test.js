// tests/resumen-diario.test.js — el bot le escribe al dueño cómo fue el día (opcional, una vez por día).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-resdia-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[resumen-diario] Tests:');
  const rd = require('../main/resumen-diario');
  const Turno = require('../main/bot-engine/models/Turno');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const CtaCte = require('../main/bot-engine/models/CtaCte');
  const Documento = require('../main/bot-engine/models/Documento');
  const Config = require('../main/bot-engine/models/Config');

  const U = 'u1'; const ahora = new Date(2026, 9, 8, 21, 5); // jueves 8/10/2026 21:05
  const t = (dia, hora, estado, monto) => Turno.create({ userId: U, calendarId: 'p', fechaInicio: new Date(2026, 9, dia, hora), fechaFin: new Date(2026, 9, dia, hora + 1), resumen: 'Corte', clienteNombre: 'X', estado, pago: { monto, metodo: 'efectivo' } });
  await t(8, 10, 'confirmado', 7000); await t(8, 15, 'pendiente', 3000); await t(8, 17, 'cancelado', 9999); await t(9, 10, 'confirmado', 5000); await t(9, 11, 'confirmado', 5000); await t(7, 10, 'confirmado', 4000);
  await Movimiento.create({ userId: U, tipo: 'gasto', monto: 8000, fecha: '2026-10-08', categoria: 'Insumos', metodo: 'efectivo' });
  await Movimiento.create({ userId: U, tipo: 'gasto', monto: 500, fecha: '2026-10-07', categoria: 'Ayer', metodo: 'efectivo' });
  await Movimiento.create({ userId: U, tipo: 'ingreso', monto: 1500, fecha: '2026-10-08', categoria: 'Ventas', metodo: 'efectivo' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241497226', nombre: 'Ana López', tipo: 'cargo', monto: 30000, fecha: '2026-09-26' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241000001', nombre: 'Luis Paz', tipo: 'cargo', monto: 34000, fecha: '2026-10-07' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241000002', nombre: 'Saldado', tipo: 'cargo', monto: 100, fecha: '2026-10-01' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241000002', nombre: 'Saldado', tipo: 'pago', monto: 100, fecha: '2026-10-02' });
  await CtaCte.create({ userId: U, entidad: 'proveedor', entidadClave: 'prov:1', proveedorId: '1', nombre: 'Sur', tipo: 'cargo', monto: 20000, fecha: '2026-10-02' });
  await Documento.create({ userId: U, jid: 'x', nombreOriginal: 'a', estado: 'nuevo' }); await Documento.create({ userId: U, jid: 'x', nombreOriginal: 'b', estado: 'revisado' });
  await Turno.create({ userId: 'otro', calendarId: 'p', fechaInicio: new Date(2026, 9, 8, 10), fechaFin: new Date(2026, 9, 8, 11), resumen: 'x', estado: 'confirmado', pago: { monto: 77777, metodo: 'efectivo' } });

  // ── cálculo ──
  const d = await rd.calcularDia(U, { mensajesHoy: 34, ahora });
  assert(d.turnosHoy === 2 && d.turnosManiana === 2, 'turnos de hoy (2, sin el cancelado) y de mañana (2)');
  assert(d.ingresosHoy === 8500 && d.gastosHoy === 8000, 'ingresos de HOY = turno cobrado $7.000 + venta $1.500 (no los de otro día); gastos de hoy sin los de ayer');
  assert(d.teDeben === 64000 && d.cantidadDeudores === 2, 'te deben $64.000 repartido en 2 clientes (el que pagó todo no cuenta)');
  assert(d.topDeudores[0].nombre === 'Luis Paz' && d.topDeudores[1].nombre === 'Ana López' && d.topDeudores[1].dias === 12, 'ordena por quién debe más y dice hace cuántos días');
  assert(d.debes === 20000 && d.documentosPendientes === 1 && d.mensajesHoy === 34, 'lo que debés, documentos sin revisar y mensajes');
  assert(!JSON.stringify(d).includes('77777'), 'no mezcla datos de otro usuario');

  // ── texto ──
  const txt = rd.redactar(d, { negocio: 'Barbería Tincho', ahora });
  assert(/Resumen del día — Barbería Tincho/.test(txt) && /jueves/i.test(txt) && /8 de octubre/.test(txt), 'encabezado con el negocio y la fecha');
  assert(/Mensajes atendidos: \*34\*/.test(txt) && /Turnos de hoy: \*2\* · mañana: \*2\*/.test(txt), 'mensajes y turnos');
  assert(/Ingresos de hoy: \*\$8\.500\*/.test(txt) && /Gastos de hoy: \*\$8\.000\*/.test(txt), 'plata de hoy con formato argentino');
  assert(/Te deben: \*\$64\.000\* \(2 clientes\)/.test(txt) && /Luis Paz — \$34\.000/.test(txt) && /Ana López — \$30\.000 \(12 días\)/.test(txt), 'lista de quién debe');
  assert(/Debés a proveedores: \*\$20\.000\*/.test(txt) && /Documentos sin revisar: \*1\*/.test(txt), 'proveedores y documentos');
  const vacio = rd.redactar({ mensajesHoy: 0, turnosHoy: 0, turnosManiana: 0, ingresosHoy: 0, gastosHoy: 0, teDeben: 0, cantidadDeudores: 0, topDeudores: [], debes: 0, documentosPendientes: 0 }, { ahora });
  assert(/día tranquilo/.test(vacio) && !/Te deben|Gastos|Documentos|proveedores/.test(vacio), 'día sin movimiento: mensaje corto, sin líneas vacías');

  // ── configuración y cuándo se envía ──
  let cfg = rd.leerConfig(dir);
  assert(cfg.resumenDiario.activo === false && cfg.resumenDiario.hora === '21:00', 'viene apagado y a las 21:00');
  assert(rd.debeEnviar(cfg, ahora) === false, 'apagado → no se envía nunca');
  rd.guardarConfig(dir, { activo: true, hora: '20:30' });
  cfg = rd.leerConfig(dir);
  assert(rd.debeEnviar(cfg, new Date(2026, 9, 8, 20, 29)) === false && rd.debeEnviar(cfg, new Date(2026, 9, 8, 20, 30)) === true, 'se envía a partir de la hora elegida');
  assert(rd.debeEnviar({ ...cfg, ultimoResumen: '2026-10-08' }, ahora) === false && rd.debeEnviar({ ...cfg, ultimoResumen: '2026-10-07' }, ahora) === true, 'una sola vez por día');
  let fallo = null; try { rd.guardarConfig(dir, { hora: '25:99' }); } catch (e) { fallo = e; }
  assert(fallo && /hora no es válida/.test(fallo.message) && rd.leerConfig(dir).resumenDiario.hora === '20:30', 'rechaza horas inválidas sin pisar la configuración');

  // ── servicio ──
  const enviados = []; let conectado = true; let reloj = ahora;
  const sv = rd.crearServicio({ userDataDir: dir, obtenerUserId: () => U, mensajesHoy: () => 34, obtenerNegocio: async () => 'Barbería Tincho', enviar: async (tx) => { if (!conectado) return { ok: false, motivo: 'bot-desconectado' }; enviados.push(tx); return { ok: true }; }, ahora: () => reloj, setI: () => 1 });
  let r = await sv.enviarAhora({ prueba: true });
  assert(r.ok && /mensaje de prueba/.test(enviados[0]) && rd.leerConfig(dir).ultimoResumen === null, 'el de prueba se manda pero NO cuenta como el del día');
  conectado = false;
  r = await sv.revisar();
  assert(r.ok === false && r.motivo === 'bot-desconectado' && rd.leerConfig(dir).ultimoResumen === null, 'si el bot está desconectado no se envía y queda pendiente');
  r = await sv.revisar();
  assert(r === null && enviados.length === 1, 'tras un fallo no reintenta en bucle (espera 10 min)');
  conectado = true; reloj = new Date(ahora.getTime() + 11 * 60000);
  r = await sv.revisar();
  assert(r.ok && enviados.length === 2 && rd.leerConfig(dir).ultimoResumen === '2026-10-08', 'cuando el bot vuelve, sale el resumen del día y queda marcado');
  r = await sv.revisar();
  assert(r === null && enviados.length === 2, 'no se repite el mismo día');
  reloj = new Date(2026, 9, 9, 21, 1);
  r = await sv.revisar();
  assert(r.ok && enviados.length === 3, 'al día siguiente vuelve a enviarse');

  // ── rutas ──
  const celu = { v: '' };
  await Config.create({ userId: U, negocio: 'Barbería Tincho', celularNotificaciones: '' });
  const botService = { getBotStatus: () => ({ activo: true, conectado: conectado }) };
  const sv2 = rd.crearServicio({ userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'akira-resdia2-')), obtenerUserId: () => U, enviar: async (tx) => { enviados.push(tx); return { ok: true }; }, ahora: () => ahora, setI: () => 1 });
  const app = express(); app.use(express.json());
  app.use('/api/app/avisos', require('../main/local-api/routes/avisos.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: U }; n(); }, servicioResumenDiario: sv2, botService }));
  const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/avisos`;
  const j = async (p, body, method) => { const x = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };
  let x = await j('');
  assert(x.body.resumenDiario.activo === false && x.body.celularConfigurado === false && x.body.whatsappConectado === true, 'estado: apagado, sin celular cargado, WhatsApp conectado');
  x = await j('/resumen-diario/probar', {});
  assert(x.status === 400 && x.body.motivo === 'sin-celular' && /Notificaciones al dueño/.test(x.body.error), 'probar sin celular cargado explica dónde cargarlo');
  const cfgDoc = await Config.findOne({ userId: U }); await Config.findOneAndUpdate({ userId: U }, { celularNotificaciones: '+54 9 2241 49-7226' });
  x = await j('/resumen-diario/probar', {});
  assert(x.status === 200 && x.body.ok, 'con celular cargado, el de prueba se envía');
  x = await j('/resumen-diario', { activo: true, hora: '22:15' }, 'PUT');
  assert(x.status === 200 && x.body.resumenDiario.activo === true && x.body.resumenDiario.hora === '22:15' && x.body.celularConfigurado === true, 'activar y cambiar la hora');
  x = await j('/resumen-diario', { hora: 'mañana' }, 'PUT');
  assert(x.status === 400, 'hora inválida → 400');
  srv.close();
  assert(!!cfgDoc, 'config de prueba creada');

  console.log('\n✅ Todos los tests de resumen-diario pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
