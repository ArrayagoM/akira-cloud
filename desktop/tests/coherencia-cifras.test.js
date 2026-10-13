// tests/coherencia-cifras.test.js — el MISMO negocio tiene que dar las MISMAS cifras en todos lados:
// lo que se manda al celular y a la web (resumen-web), el resumen diario de WhatsApp, las herramientas MCP y la Caja.
// Si alguien cambia cómo se calcula una de esas cuentas en un solo lugar, este test avisa antes de que el usuario vea números distintos.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-coherencia-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[coherencia de cifras] Tests:');
  const Turno = require('../main/bot-engine/models/Turno');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const CtaCte = require('../main/bot-engine/models/CtaCte');
  const Documento = require('../main/bot-engine/models/Documento');
  const caja = require('../main/gestion/caja');
  const resumenWeb = require('../main/resumen-web');
  const resumenDiario = require('../main/resumen-diario');
  const { crearHerramientas } = require('../main/mcp/herramientas');

  const ahora = new Date(); ahora.setHours(12, 0, 0, 0);
  const dia = (n, h = 10) => new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + n, h, 0);
  const hoy = caja.fechaLocal(ahora);
  const U = 'u1';
  const turno = (n, h, extra = {}) => Turno.create({ userId: U, calendarId: 'principal', fechaInicio: dia(n, h), fechaFin: dia(n, h + 1), resumen: 'Corte', clienteNombre: 'Ana', clienteTelefono: '5492241111111', estado: 'confirmado', pago: { monto: 4000, metodo: 'efectivo' }, ...extra });

  // Hoy: uno cobrado, uno pendiente, uno cancelado (con plata cargada que NO cuenta)
  await turno(0, 10);
  await turno(0, 14, { estado: 'pendiente', pago: undefined });
  await turno(0, 16, { estado: 'cancelado', pago: { monto: 9999, metodo: 'efectivo' } });
  // Mañana, y uno cobrado dentro del mes (siempre que hoy no sea el día 1, se cae en otro día del mismo mes)
  await turno(1, 10, { pago: undefined, estado: 'pendiente' });
  await Movimiento.create({ userId: U, tipo: 'gasto', monto: 1500, fecha: hoy, categoria: 'Insumos y mercadería', metodo: 'efectivo' });
  await Movimiento.create({ userId: U, tipo: 'ingreso', monto: 500, fecha: hoy, categoria: 'Ventas', metodo: 'efectivo' });
  for (const [i, n] of ['Ana', 'Luis', 'Marta'].entries()) await BotCliente.create({ userId: U, jid: `54922411100${i}@s.whatsapp.net`, nombre: n });
  // Cuenta corriente: Ana debe 2500; Luis pagó todo (saldo 0); Marta tiene saldo a favor (NO se resta de lo que te deben); proveedor: 7000
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: '2241111111', nombre: 'Ana', tipo: 'cargo', monto: 2500, fecha: hoy });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: '2241222222', nombre: 'Luis', tipo: 'cargo', monto: 1000, fecha: hoy });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: '2241222222', nombre: 'Luis', tipo: 'pago', monto: 1000, fecha: hoy });
  await CtaCte.create({ userId: U, entidad: 'cliente', entidadClave: '2241333333', nombre: 'Marta', tipo: 'pago', monto: 300, fecha: hoy });
  await CtaCte.create({ userId: U, entidad: 'proveedor', proveedorId: 'p1', nombre: 'Distribuidora', tipo: 'cargo', monto: 7000, fecha: hoy });
  await Documento.create({ userId: U, estado: 'nuevo', nombre: 'a.pdf' });
  await Documento.create({ userId: U, estado: 'nuevo', nombre: 'b.pdf' });
  await Documento.create({ userId: U, estado: 'revisado', nombre: 'c.pdf' });
  // Datos de otro negocio: no tienen que colarse en ninguna cuenta
  await turno(0, 11, { userId: 'otro', pago: { monto: 77777, metodo: 'efectivo' } });
  await CtaCte.create({ userId: 'otro', entidad: 'cliente', entidadClave: '1', nombre: 'Ajeno', tipo: 'cargo', monto: 55555, fecha: hoy });

  const web = await resumenWeb.calcular(U, { mensajesHoy: 12, ahora });
  const diario = await resumenDiario.calcularDia(U, { mensajesHoy: 12, ahora });
  const H = crearHerramientas({ ahora: () => ahora });
  const mcpDia = await H.llamar('resumen_del_dia', {}, U);
  const mcpCaja = await H.llamar('resumen_de_caja', {}, U);
  const mcpDeudores = await H.llamar('deudores', {}, U);

  // valores esperados, calculados a mano
  assert(web.teDeben === 2500 && web.debes === 7000, 'lo que te deben (2.500: el saldo a favor de Marta y el pago de Luis no restan) y lo que debés (7.000)');
  assert(web.turnosHoy === 2 && web.clientes === 3 && web.documentosPendientes === 2 && web.mensajesHoy === 12, 'turnos de hoy (2, sin el cancelado), clientes (3), documentos sin revisar (2) y mensajes');

  // las cuatro vías tienen que coincidir
  const mismas = [
    ['lo que te deben', web.teDeben, diario.teDeben, mcpDia.teDeben, mcpDeudores.totalAdeudado],
    ['lo que debés', web.debes, diario.debes, mcpDia.debesAProveedores],
    ['turnos de hoy', web.turnosHoy, diario.turnosHoy, mcpDia.turnosHoy],
    ['documentos sin revisar', web.documentosPendientes, diario.documentosPendientes, mcpDia.documentosPendientes],
    ['mensajes de hoy', web.mensajesHoy, diario.mensajesHoy],
  ];
  for (const [que, ...vals] of mismas) {
    const v = vals.filter((x) => x !== undefined);
    assert(v.length >= 2 && v.every((x) => x === v[0]), `${que}: igual en el celular/web, el resumen de WhatsApp y las herramientas MCP (${v.join(' = ')})`);
  }
  // Ingresos: lo de hoy (cobrado 4000 + manual 500) y lo del mes tienen que cuadrar con la Caja
  assert(diario.ingresosHoy === 4500 && mcpDia.ingresosHoy === 4500 && diario.gastosHoy === 1500 && mcpDia.gastosHoy === 1500, 'ingresos y gastos de hoy: igual en el resumen de WhatsApp y MCP (el turno cancelado no suma)');
  assert(web.ingresosMes === mcpCaja.ingresos && web.gastosMes === mcpCaja.gastos, `ingresos y gastos del mes: igual en el celular/web y en la Caja (${web.ingresosMes} / ${web.gastosMes})`);
  assert(web.ingresosMes >= 4500 && web.gastosMes === 1500, 'el mes incluye lo de hoy y no cuenta los turnos cancelados');
  assert(web.mes === hoy.slice(0, 7), 'el resumen dice a qué mes corresponde (la web lo usa para no mostrar el mes pasado como si fuera este)');

  // aislamiento: nada del otro negocio
  assert(web.teDeben === 2500 && web.ingresosMes < 70000, 'no se mezcla con los datos de otro negocio');

  console.log('\n✅ Todos los tests de coherencia de cifras pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
