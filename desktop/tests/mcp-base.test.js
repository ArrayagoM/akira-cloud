// tests/mcp-base.test.js — las herramientas MCP contra la base de datos local REAL (no contra modelos de mentira):
// confirma que leen bien lo que guarda el programa, que cada usuario ve solo lo suyo y que la clave de MercadoPago/Groq nunca sale.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-mcpdb-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[mcp-base] Tests:');
  const Turno = require('../main/bot-engine/models/Turno');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Config = require('../main/bot-engine/models/Config');
  const CtaCte = require('../main/bot-engine/models/CtaCte');
  const { crearHerramientas } = require('../main/mcp/herramientas');
  const { crearServicio } = require('../main/mcp/servicio');

  const hoy = new Date(); const dia = (n, h = 10) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n, h, 0);
  const turno = (n, extra = {}) => Turno.create({ userId: 'u1', calendarId: 'principal', fechaInicio: dia(n), fechaFin: dia(n, 11), resumen: 'Corte — Ana', clienteNombre: 'Ana Gómez', clienteTelefono: '5492241111111', estado: 'confirmado', pago: { monto: 4000, metodo: 'mercadopago' }, ...extra });
  await turno(0); await turno(1, { calendarId: 'b', clienteNombre: 'Luis', clienteTelefono: '5492242222222', estado: 'pendiente', pago: undefined }); await turno(-3, { calendarId: 'c' });
  await Turno.create({ userId: 'otro', calendarId: 'principal', fechaInicio: dia(0), fechaFin: dia(0, 11), resumen: 'AJENO', clienteNombre: 'Persona Ajena', clienteTelefono: '5491100000000', estado: 'confirmado', pago: { monto: 99999, metodo: 'efectivo' } });
  await Movimiento.create({ userId: 'u1', tipo: 'gasto', monto: 1500, fecha: new Date().toISOString().slice(0, 10), categoria: 'Insumos y mercadería', metodo: 'efectivo' });
  await BotCliente.create({ userId: 'u1', jid: '5492241111111@s.whatsapp.net', nombre: 'Ana Gómez', etiquetas: ['vip'], historial: [{ rol: 'user', texto: 'CHAT PRIVADO DE ANA' }] });
  await BotCliente.create({ userId: 'otro', jid: '5491100000000@s.whatsapp.net', nombre: 'Ana Ajena' });
  await CtaCte.create({ userId: 'u1', entidad: 'cliente', entidadClave: '2241111111', nombre: 'Ana Gómez', tipo: 'cargo', monto: 2500, fecha: new Date().toISOString().slice(0, 10) });
  await Config.findOneAndUpdate({ userId: 'u1' }, { negocio: 'Peluquería', groqApiKey: 'gsk_NO_DEBE_SALIR', catalogo: [{ nombre: 'Shampoo', precio: 3000, stock: 4, categoria: 'Cuidado', disponible: true }], serviciosList: [{ nombre: 'Corte', precio: 4000, duracion: 45 }] }, { upsert: true });

  const H = crearHerramientas({});
  const r1 = await H.llamar('resumen_del_dia', {}, 'u1');
  assert(r1.turnosHoy === 1 && r1.turnosManiana === 1 && r1.ingresosHoy === 4000 && r1.gastosHoy === 1500 && r1.teDeben === 2500, 'resumen del día con datos reales (sin mezclar los de otro usuario)');
  const r2 = await H.llamar('listar_turnos', {}, 'u1');
  assert(r2.total === 2 && r2.turnos.every((t) => t.telefono.startsWith('***')) && !JSON.stringify(r2).includes('AJENO'), 'turnos reales: enmascarados y solo los de este usuario');
  const r3 = await H.llamar('resumen_de_caja', {}, 'u1');
  assert(r3.ingresos >= 8000 && r3.gastos === 1500, 'caja del mes con turnos cobrados + movimientos');
  const r4 = await H.llamar('ver_catalogo', { tipo: 'productos' }, 'u1');
  assert(r4.items.length === 1 && r4.items[0].stock === 4 && (await H.llamar('ver_catalogo', { tipo: 'servicios' }, 'u1')).items[0].duracionMinutos === 45, 'catálogo real');
  const r5 = await H.llamar('buscar_clientes', { texto: 'ana' }, 'u1');
  assert(r5.total === 1 && r5.clientes[0].nombre === 'Ana Gómez' && r5.clientes[0].telefono === '***111' && r5.clientes[0].visitas >= 1, 'clientes reales: un solo "Ana" (la de otro usuario no aparece) y con teléfono enmascarado');
  const r6 = await H.llamar('deudores', {}, 'u1');
  assert(r6.total === 1 && r6.deudores[0].saldo === 2500, 'deudores reales');
  const todo = JSON.stringify([r1, r2, r3, r4, r5, r6, await H.llamar('servicios_mas_pedidos', {}, 'u1')]);
  for (const x of ['gsk_NO_DEBE_SALIR', 'CHAT PRIVADO', 'groqApiKey', 'Persona Ajena', 'AJENO', '2241111111', '5491100000000']) assert(!todo.includes(x), `nunca aparece "${x}"`);
  const rOtro = await H.llamar('resumen_del_dia', {}, 'otro');
  assert(rOtro.ingresosHoy === 99999 && rOtro.turnosHoy === 1, 'cada usuario ve solo lo suyo (aislamiento)');
  assert((await H.llamar('resumen_del_dia', {}, 'nadie')).turnosHoy === 0, 'un usuario sin datos recibe todo en cero');

  // por HTTP, con el servicio completo y los modelos reales
  const svc = crearServicio({ userDataDir: dir, obtenerUserId: () => 'u1', puertoPreferido: 0 }); await svc.activar(true);
  const k = svc.crearConexion({ nombre: 'real' });
  const r = await fetch(svc.estado().url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k.llave}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'resumen_del_dia', arguments: {} } }) });
  const j = await r.json();
  assert(r.status === 200 && JSON.parse(j.result.content[0].text).turnosHoy === 1, 'de punta a punta: pedido HTTP con llave → datos reales');
  await svc.detener();

  console.log('\n✅ Todos los tests de MCP con base real pasaron.\n');
  process.exit(0);
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
