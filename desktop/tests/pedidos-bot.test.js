// tests/pedidos-bot.test.js — el carrito "del lado del bot" de punta a punta: la IA llama a las herramientas, se arma el pedido,
// se genera el pago (MercadoPago o transferencia), se avisa al dueño y, al pagarse, se descuenta el stock y entra a la Caja.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-pbot-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[pedidos-bot] Tests:');
  const { crearPedidosBot } = require('../main/bot-engine/services/bot/pedidos-bot');
  const Pedido = require('../main/bot-engine/models/Pedido');
  const Config = require('../main/bot-engine/models/Config');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const CATALOGO = [
    { nombre: 'Cera modeladora', precio: 6200, stock: 5, disponible: true },
    { nombre: 'Shampoo reparador', precio: 8500, stock: 12, disponible: true },
    { nombre: 'Shampoo sin sulfatos', precio: 9200, stock: -1, disponible: true },
    { nombre: 'Aceite para barba', precio: 7000, stock: 0, disponible: true },
  ];
  await Config.create({ userId: 'u1', catalogo: CATALOGO });
  const JID = '5492241497226@s.whatsapp.net'; const usuario = { nombre: 'Ana López', numeroReal: '5492241497226' };

  const armar = (extra = {}) => {
    const enviados = []; const dueno = []; const links = []; let recargas = 0;
    const programas = { pedidos: { activa: true, entrega: 'ambos', costoEnvio: 1500, nota: 'Entregamos de lunes a viernes.' }, ...extra.programas };
    const bot = crearPedidosBot({
      userId: 'u1', Pedido, Config, Movimiento, getCatalogo: () => CATALOGO, getProgramas: () => programas,
      mp: extra.sinMP ? null : { crearPago: async (jid, nombre, fecha, hora, hf, op) => { links.push(op); if (extra.mpFalla) throw new Error('MP caído'); return { init_point: `https://mp.test/pagar/${op.referencia}` }; } }, conMP: !extra.sinMP,
      negocio: 'Barbería Tincho', miNombre: 'Martín', alias: extra.sinMP ? 'tincho.mp' : '', cbu: extra.sinMP ? '0000003100000000000001' : '', banco: '',
      enviarMensaje: async (jid, t) => { enviados.push({ jid, t }); return true; }, notificarDueno: (t) => dueno.push(t), extraerNumero: (j) => j.split('@')[0], recargarConfig: () => { recargas++; }, log: () => {},
    });
    const llamar = async (nombre, args = {}) => { let out = ''; await bot.manejar(nombre, args, JID, usuario, (t) => { out = t; }); return out; };
    return { bot, llamar, enviados, dueno, links, recargas: () => recargas };
  };

  // ── armar el carrito ──
  let t = armar();
  assert(/Agregado: 2 × Cera modeladora/.test(await t.llamar('agregar_al_carrito', { producto: 'cera', cantidad: 2 })), 'la IA agrega 2 ceras (el cliente dijo "cera")');
  assert(/Hay varias opciones parecidas: Shampoo reparador, Shampoo sin sulfatos/.test(await t.llamar('agregar_al_carrito', { producto: 'shampoo' })), '"shampoo" es ambiguo → pide elegir');
  assert(/Agregado: 1 × Shampoo reparador/.test(await t.llamar('agregar_al_carrito', { producto: 'shampoo reparador' })), 'con más detalle se agrega');
  assert(/no tenemos stock de Aceite/.test(await t.llamar('agregar_al_carrito', { producto: 'aceite para barba' })), 'sin stock → avisa y no lo agrega');
  assert(/Solo nos quedan 5/.test(await t.llamar('agregar_al_carrito', { producto: 'cera', cantidad: 9 })), 'no deja pasar el stock');
  assert(/No encontré "tarjeta de regalo"/.test(await t.llamar('agregar_al_carrito', { producto: 'tarjeta de regalo' })), 'producto inexistente → lo informa');
  let ver = await t.llamar('ver_carrito');
  assert(/2 × Cera modeladora — \$12\.400/.test(ver) && /1 × Shampoo reparador — \$8\.500/.test(ver) && /Total: \$20\.900/.test(ver) && /Si es envío se suma \$1\.500/.test(ver), 'ver_carrito: líneas, total y aviso del costo de envío');
  assert(/actualicé el pedido/.test(await t.llamar('quitar_del_carrito', { producto: 'cera', cantidad: 1 })) && /Total: \$14\.700/.test(await t.llamar('ver_carrito')), 'quitar 1 cera baja el total');
  assert((await Pedido.find({ userId: 'u1', estado: 'carrito' }).lean()).length === 1, 'hay un solo carrito abierto para ese cliente');

  // ── confirmar ──
  assert(/Falta saber si es retiro/.test(await t.llamar('confirmar_pedido', {})), 'sin decir retiro/envío no confirma');
  assert(/Falta la dirección/.test(await t.llamar('confirmar_pedido', { entrega: 'envio', direccion: 'abc' })), 'envío sin dirección → la pide');
  const out = await t.llamar('confirmar_pedido', { entrega: 'envio', direccion: 'Calle 12 n° 345, Ranchos', notas: 'Tocar timbre' });
  assert(/Pedido #1 creado/.test(out) && /YA se le enviaron/.test(out), 'confirma el pedido #1 y le dice a la IA que el resumen ya se envió');
  assert(t.enviados.length === 1 && /pedido \*#1\*/.test(t.enviados[0].t) && /Total: \$16\.200/.test(t.enviados[0].t) && /Envío: \$1\.500/.test(t.enviados[0].t) && /https:\/\/mp\.test\/pagar\/pedido\|/.test(t.enviados[0].t) && /24 hs/.test(t.enviados[0].t) && /Entregamos de lunes a viernes/.test(t.enviados[0].t) && /Calle 12/.test(t.enviados[0].t), 'el cliente recibe resumen, total con envío, dirección, link de pago y la nota del negocio');
  assert(t.links[0].montoTotal === 16200 && t.links[0].venceMin === 1440 && /^pedido\|/.test(t.links[0].referencia), 'el link se genera por el total correcto, vence en 24 h y lleva la referencia "pedido|id"');
  assert(t.dueno.length === 1 && /Nuevo pedido #1/.test(t.dueno[0]) && /Ana López/.test(t.dueno[0]) && /Tocar timbre/.test(t.dueno[0]) && /Pendiente de pago \(MercadoPago\)/.test(t.dueno[0]), 'el dueño recibe el pedido completo');
  const ped = (await Pedido.find({ userId: 'u1' }).lean())[0];
  assert(ped.estado === 'pendiente-pago' && ped.total === 16200 && ped.link.includes('mp.test') && ped.items.length === 2, 'queda guardado como pendiente de pago, con su link');
  assert((await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 5, 'todavía no se descontó stock (se descuenta al pagar)');
  assert(/Pedido vaciado/.test(await t.llamar('vaciar_carrito')) && /El pedido está vacío/.test(await t.llamar('confirmar_pedido', { entrega: 'retiro' })), 'después de confirmar, el carrito arranca vacío');

  // ── el pago llega ──
  let r = await t.bot.confirmarPago(String(ped._id), { id: 987654, transaction_amount: 100, status: 'approved' });
  assert(r.ok === false && r.motivo === 'monto' && /es de \$100/.test(t.dueno[1]) && (await Pedido.findOne({ _id: ped._id })).estado === 'pendiente-pago', 'si el monto pagado no alcanza, NO se confirma y se avisa al dueño');
  r = await t.bot.confirmarPago(String(ped._id), { id: 987654, transaction_amount: 16200, status: 'approved' });
  assert(r.ok && !r.yaEstaba && (await Pedido.findOne({ _id: ped._id })).estado === 'pagado', 'pago correcto → pedido pagado');
  const cfg = await Config.findOne({ userId: 'u1' });
  assert(cfg.catalogo[0].stock === 4 && cfg.catalogo[1].stock === 11 && t.recargas() === 1, 'se descontó el stock (1 cera y 1 shampoo) y el bot recarga el catálogo');
  assert((await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean())[0].monto === 16200, 'el ingreso entró a la Caja');
  assert(/Recibimos tu pago/.test(t.enviados[1].t) && /Calle 12/.test(t.enviados[1].t) && /Pedido #1 pagado/.test(t.dueno[2]) && /MercadoPago/.test(t.dueno[2]), 'avisa al cliente y al dueño');
  const dosVeces = await t.bot.confirmarPago(String(ped._id), { id: 987654, transaction_amount: 16200, status: 'approved' });
  assert(dosVeces.yaEstaba === true && (await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 4 && t.enviados.length === 2, 'MercadoPago reenvía el aviso: no se duplica nada');
  assert((await t.bot.confirmarPago('inexistente', { id: 1, transaction_amount: 1 })).ok === false, 'un pago de un pedido que no existe no rompe nada');

  // ── sin MercadoPago: transferencia ──
  await Pedido.deleteMany?.({ userId: 'u1' });
  t = armar({ sinMP: true });
  await t.llamar('agregar_al_carrito', { producto: 'shampoo sin sulfatos', cantidad: 2 });
  const o2 = await t.llamar('confirmar_pedido', { entrega: 'retiro' });
  assert(/Pedido #/.test(o2) && /Alias: tincho\.mp/.test(t.enviados[0].t) && /CBU: 0000003100000000000001/.test(t.enviados[0].t) && /transferí \*\$18\.400\*/.test(t.enviados[0].t) && /Lo retirás en el local/.test(t.enviados[0].t) && !/Envío:/.test(t.enviados[0].t), 'sin MercadoPago: datos de transferencia, retiro sin costo de envío');
  assert(/Pendiente de pago \(transferencia\)/.test(t.dueno[0]), 'el dueño ve que se paga por transferencia');

  // ── MercadoPago caído: no se pierde el pedido ──
  t = armar({ mpFalla: true });
  await t.llamar('agregar_al_carrito', { producto: 'cera' });
  await t.llamar('confirmar_pedido', { entrega: 'retiro' });
  assert(t.enviados.length === 1 && /te va a escribir para coordinar el pago/.test(t.enviados[0].t) && (await Pedido.find({ userId: 'u1', estado: 'pendiente-pago' }).lean()).length >= 1, 'si MercadoPago falla, el pedido igual queda registrado y se coordina el pago a mano');

  // ── reglas del dueño ──
  t = armar({ programas: { pedidos: { activa: false } } });
  assert(/no tomamos pedidos por WhatsApp/.test(await t.llamar('agregar_al_carrito', { producto: 'cera' })), 'con los pedidos apagados el bot no los toma');
  t = armar({ programas: { pedidos: { activa: true, entrega: 'retiro', costoEnvio: 0 } } });
  await t.llamar('agregar_al_carrito', { producto: 'cera' });
  assert(/solo ofrecemos retiro en el local/.test(await t.llamar('confirmar_pedido', { entrega: 'envio', direccion: 'Calle 1234' })), 'si el dueño solo hace retiro, no acepta envíos');
  // el stock cambió mientras tanto
  t = armar();
  await Pedido.deleteMany?.({ userId: 'u1', estado: 'carrito' });
  await t.llamar('agregar_al_carrito', { producto: 'cera', cantidad: 3 });
  const guardado = CATALOGO[0].stock; CATALOGO[0].stock = 1;
  assert(/solo quedan 1/.test(await t.llamar('confirmar_pedido', { entrega: 'retiro' })), 'si el stock bajó antes de confirmar, lo detecta y no confirma');
  CATALOGO[0].stock = guardado;
  // carrito vencido
  assert((await Pedido.find({ userId: 'u1', jid: JID, estado: 'carrito' }).lean()).length === 1, 'hay un carrito abierto con productos');
  const botTarde = crearPedidosBot({ userId: 'u1', Pedido, Config, Movimiento, getCatalogo: () => CATALOGO, getProgramas: () => ({ pedidos: { activa: true, entrega: 'ambos' } }), mp: null, conMP: false, negocio: 'X', miNombre: 'M', alias: '', cbu: '', banco: '', enviarMensaje: async () => true, notificarDueno() {}, extraerNumero: (j) => j, recargarConfig() {}, ahora: () => Date.now() + 30 * 3600e3 });
  let salida = ''; await botTarde.manejar('ver_carrito', {}, JID, usuario, (x) => { salida = x; });
  assert(/vacío/.test(salida), 'un carrito abandonado hace más de 24 h se descarta');

  console.log('\n✅ Todos los tests de pedidos-bot pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
