// tests/pedidos-pago.test.js — ciclo de vida de un pedido: confirmar → pagar (stock + Caja, una sola vez) → entregar / cancelar.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-pped-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[pedidos-pago] Tests:');
  const stock = require('../main/gestion/stock');
  const pp = require('../main/gestion/pedidos-pago');
  const Pedido = require('../main/bot-engine/models/Pedido');
  const Config = require('../main/bot-engine/models/Config');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  const M = { Pedido, Config, Movimiento };

  // ── stock (puro) ──
  const cat = [{ nombre: 'Cera modeladora', precio: 6200, stock: 5 }, { nombre: 'Peine', precio: 3500, stock: -1 }, { nombre: 'Aceite', precio: 7000, stock: 2 }];
  let r = stock.descontar(cat, [{ nombre: 'cera MODELADORA', cantidad: 3 }, { nombre: 'Peine', cantidad: 10 }]);
  assert(r.catalogo[0].stock === 2 && r.catalogo[1].stock === -1, 'descuenta el stock (sin importar mayúsculas) y no toca los productos sin control de stock');
  assert(r.bajos.length === 1 && r.bajos[0].nombre === 'Cera modeladora' && /quedan 2/.test(stock.textoPocoStock(r.bajos)), 'avisa cuando queda poco');
  assert(cat[0].stock === 5, 'no modifica la lista original');
  r = stock.descontar(cat, [{ nombre: 'Aceite', cantidad: 5 }]);
  assert(r.catalogo[2].stock === 0 && r.faltantes[0].pedido === 5 && r.faltantes[0].habia === 2 && /se agotó/.test(stock.textoPocoStock(r.bajos)), 'nunca deja stock negativo: queda en 0 y avisa que se vendió más de lo que había');
  assert(stock.reponer(r.catalogo, [{ nombre: 'Aceite', cantidad: 2 }])[2].stock === 2 && stock.reponer(cat, [{ nombre: 'Peine', cantidad: 1 }])[1].stock === -1, 'reponer devuelve unidades (y respeta los productos sin control)');

  // ── pedido ──
  await Config.create({ userId: 'u1', catalogo: [{ nombre: 'Cera modeladora', precio: 6200, stock: 5, disponible: true }, { nombre: 'Peine', precio: 3500, stock: -1, disponible: true }] });
  const items = [{ nombre: 'Cera modeladora', precio: 6200, cantidad: 3 }, { nombre: 'Peine', precio: 3500, cantidad: 1 }];
  const carrito = await Pedido.create({ userId: 'u1', jid: '5492241497226@s.whatsapp.net', estado: 'carrito', items: [] });
  const p1 = await pp.confirmar(M, { userId: 'u1', carritoId: String(carrito._id), jid: '5492241497226@s.whatsapp.net', nombre: 'Ana', telefono: '5492241497226', items, entrega: 'envio', direccion: 'Calle 1', costoEnvio: 1500, metodoPago: 'mercadopago', link: 'https://mp/x' });
  assert(p1.numero === 1 && p1.estado === 'pendiente-pago' && p1.subtotal === 22100 && p1.envio === 1500 && p1.total === 23600, 'confirmar: número correlativo, subtotal + envío = total');
  const p2 = await pp.confirmar(M, { userId: 'u1', jid: 'x@s.whatsapp.net', nombre: 'Luis', items: [{ nombre: 'Peine', precio: 3500, cantidad: 2 }], entrega: 'retiro', costoEnvio: 1500 });
  assert(p2.numero === 2 && p2.envio === 0 && p2.total === 7000, 'el retiro en local no paga envío; el siguiente pedido es el #2');
  assert((await Pedido.find({ userId: 'u1' }).lean()).length === 2, 'el carrito se convirtió en el pedido (no queda un carrito suelto)');
  assert((await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 5, 'confirmar NO descuenta stock todavía (solo cuando se paga)');

  // ── pagar ──
  let pg = await pp.marcarPagado(M, 'u1', String(p1._id), { metodo: 'mercadopago', comprobante: '123456' });
  assert(pg.ok && !pg.yaEstaba && pg.pedido.estado === 'pagado', 'pagar: queda pagado');
  assert((await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 2 && pg.bajos[0]?.nombre === 'Cera modeladora', 'descuenta el stock y avisa que queda poco');
  let movs = await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean();
  assert(movs.length === 1 && movs[0].monto === 23600 && movs[0].tipo === 'ingreso' && movs[0].metodo === 'mercadopago' && movs[0].categoria === 'Ventas' && /Pedido #1/.test(movs[0].descripcion), 'anota el ingreso en la Caja (monto, método, categoría y descripción)');
  pg = await pp.marcarPagado(M, 'u1', String(p1._id), { metodo: 'mercadopago' });
  movs = await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean();
  assert(pg.yaEstaba === true && movs.length === 1 && (await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 2, 'un aviso de pago repetido NO descuenta ni cobra dos veces');
  const [a, b] = await Promise.all([pp.marcarPagado(M, 'u1', String(p2._id), { metodo: 'transferencia' }), pp.marcarPagado(M, 'u1', String(p2._id), { metodo: 'transferencia' })]);
  assert([a, b].filter((x) => !x.yaEstaba).length === 1 && (await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean()).length === 2, 'dos avisos simultáneos: solo uno se aplica');
  assert((await pp.marcarPagado(M, 'otro', String(p1._id))).ok === false, 'no se puede pagar un pedido de otro negocio');

  // ── entregar / cancelar ──
  const p3 = await pp.confirmar(M, { userId: 'u1', jid: 'y@s.whatsapp.net', nombre: 'Marta', items: [{ nombre: 'Cera modeladora', precio: 6200, cantidad: 2 }], entrega: 'retiro' });
  assert((await pp.cambiarEstado(M, 'u1', String(p3._id), 'entregado')).error?.includes('primero tiene que estar pagado'), 'no se entrega algo que no se pagó');
  let c = await pp.cambiarEstado(M, 'u1', String(p3._id), 'cancelado');
  assert(c.ok && c.pedido.estado === 'cancelado' && (await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 2, 'cancelar un pedido sin pagar no toca stock ni Caja');
  assert((await pp.marcarPagado(M, 'u1', String(p3._id))).error === 'Ese pedido está cancelado.', 'un pedido cancelado no se puede pagar');
  c = await pp.cambiarEstado(M, 'u1', String(p1._id), 'cancelado');
  assert(c.ok && (await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 5 && !(await Movimiento.findOne({ userId: 'u1', pedidoId: String(p1._id) })), 'cancelar un pedido ya pagado devuelve el stock y quita el ingreso de la Caja');
  const e = await pp.cambiarEstado(M, 'u1', String(p2._id), 'entregado');
  assert(e.ok && e.pedido.estado === 'entregado', 'pagado → entregado');
  assert((await pp.cambiarEstado(M, 'u1', String(p2._id), 'cancelado')).error?.includes('ya entregado'), 'uno entregado no se cancela');
  assert((await pp.cambiarEstado(M, 'u1', String(p2._id), 'volando')).ok === false, 'estados inventados → error');

  console.log('\n✅ Todos los tests de pedidos-pago pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
