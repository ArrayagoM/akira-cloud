// tests/resumen-web.test.js — "ver mi negocio desde la web": apagado por defecto, solo números
// agregados, y al desactivarlo la app le pide al servidor que borre lo que tenía.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-resweb-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[resumen-web] Tests:');
  const rw = require('../main/resumen-web');
  const caja = require('../main/gestion/caja');
  const Turno = require('../main/bot-engine/models/Turno');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const CtaCte = require('../main/bot-engine/models/CtaCte');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Documento = require('../main/bot-engine/models/Documento');

  const U = 'u1'; const ahora = new Date(2026, 9, 20, 12, 0);
  const t = (dia, estado, monto, hora = 10) => Turno.create({ userId: U, calendarId: 'p', fechaInicio: new Date(2026, 9, dia, hora), fechaFin: new Date(2026, 9, dia, hora + 1), resumen: 'Turno secreto Ana', clienteNombre: 'Ana López', clienteTelefono: '2241497226', estado, pago: { monto, metodo: 'mercadopago' } });
  await t(20, 'confirmado', 7000); await t(20, 'pendiente', 3000, 15); await t(21, 'confirmado', 5000); await t(22, 'cancelado', 9999); await t(5, 'confirmado', 4000);
  await Movimiento.create({ userId: U, tipo: 'gasto', monto: 15000, fecha: '2026-10-03', categoria: 'Alquiler', metodo: 'efectivo' });
  await Movimiento.create({ userId: U, tipo: 'gasto', monto: 999, fecha: '2026-09-30', categoria: 'Otro mes', metodo: 'efectivo' });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: 'tel:2241497226', nombre: 'Ana López', tipo: 'cargo', monto: 8000, fecha: '2026-10-01' });
  await CtaCte.create({ userId: U, entidad: 'proveedor', entidadClave: 'prov:1', proveedorId: '1', nombre: 'Sur', tipo: 'cargo', monto: 20000, fecha: '2026-10-02' });
  await CtaCte.create({ userId: U, entidad: 'proveedor', entidadClave: 'prov:1', proveedorId: '1', nombre: 'Sur', tipo: 'pago', monto: 5000, fecha: '2026-10-03' });
  await BotCliente.create({ userId: U, jid: '1@s.whatsapp.net', nombre: 'Ana' }); await BotCliente.create({ userId: U, jid: '2@s.whatsapp.net', nombre: 'Luis' });
  await Documento.create({ userId: U, jid: 'x', nombreOriginal: 'a', estado: 'nuevo' }); await Documento.create({ userId: U, jid: 'x', nombreOriginal: 'b', estado: 'revisado' });
  await Turno.create({ userId: 'otro', calendarId: 'p', fechaInicio: new Date(2026, 9, 20, 10), fechaFin: new Date(2026, 9, 20, 11), resumen: 'x', estado: 'confirmado', pago: { monto: 77777, metodo: 'mercadopago' } });

  const r = await rw.calcular(U, { mensajesHoy: 14, ahora });
  assert(r.mes === '2026-10' && r.mensajesHoy === 14, 'trae el mes y los mensajes de hoy');
  assert(r.turnosHoy === 2 && r.turnosMes === 4, 'turnos de hoy (2) y del mes (4): sin contar el cancelado');
  assert(r.ingresosMes === 16000 && r.gastosMes === 15000, 'ingresos del mes = turnos cobrados ($7.000 + $5.000 + $4.000); gastos sin los de otro mes');
  assert(r.teDeben === 8000 && r.debes === 15000, 'te deben $8.000 y debés $15.000 (compra de 20.000 menos pago de 5.000)');
  assert(r.clientes === 2 && r.documentosPendientes === 1, 'cantidad de clientes y de documentos sin revisar');
  assert(Object.values(r).every((v) => typeof v === 'number' || typeof v === 'string') && !JSON.stringify(r).match(/Ana|López|2241|secreto|Luis|Sur/), 'el resumen no contiene nombres, teléfonos ni textos del negocio: solo contadores');
  assert(Object.keys(r).sort().join() === 'clientes,debes,documentosPendientes,gastosMes,ingresosMes,mensajesHoy,mes,teDeben,turnosHoy,turnosMes', 'exactamente los campos acordados, ni uno más');
  assert(r.ingresosMes !== 16000 + 77777, 'no mezcla datos de otro usuario');

  // interruptor
  assert(rw.activo(dir) === false, 'viene apagado por defecto');
  const apagado = await rw.datosHeartbeat({ userDataDir: dir, userId: U, botService: { mensajesHoy: () => 3 }, version: '1.0.14' });
  assert(apagado.version === '1.0.14' && apagado.resumen === null, 'apagado: manda solo la versión y resumen:null (que le indica al servidor que borre lo que tuviera)');
  rw.guardar(dir, true);
  assert(rw.activo(dir) === true, 'se puede activar y queda guardado');
  const prendido = await rw.datosHeartbeat({ userDataDir: dir, userId: U, botService: { mensajesHoy: () => 3 }, version: '1.0.14' });
  assert(prendido.resumen && prendido.resumen.mensajesHoy === 3 && typeof prendido.resumen.ingresosMes === 'number', 'activado: agrega el resumen a la señal de vida');
  rw.guardar(dir, false);
  assert((await rw.datosHeartbeat({ userDataDir: dir, userId: U, botService: {}, version: '1' })).resumen === null, 'al desactivarlo vuelve a mandar resumen:null (el servidor lo borra)');
  rw.guardar(dir, 'si');
  assert(rw.activo(dir) === false, 'solo "true" activa (cualquier otro valor deja apagado)');

  console.log('\n✅ Todos los tests de resumen-web pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
