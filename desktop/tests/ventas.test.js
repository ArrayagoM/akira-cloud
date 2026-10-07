// tests/ventas.test.js — ventas rápidas: arma la venta con precios del catálogo, descuenta stock, suma a la Caja y se puede anular.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-vent-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const ventas = require('../main/gestion/ventas');

(async () => {
  console.log('\n[ventas] Tests:');
  const cat = [
    { nombre: 'Cera modeladora', precio: 6200, stock: 4, disponible: true },
    { nombre: 'Shampoo reparador', precio: 8500, stock: -1, disponible: true },
    { nombre: 'Peine', precio: 1000, stock: 2, disponible: true },
  ];
  let a = ventas.armar(cat, [{ nombre: 'cera MODELADORA', cantidad: 2 }, { nombre: 'Shampoo reparador', cantidad: 1 }]);
  assert(a.ok && a.total === 20900 && a.lineas[0].nombre === 'Cera modeladora' && a.lineas[0].precio === 6200, 'el precio sale del catálogo (sin importar mayúsculas) y se calcula el total');
  a = ventas.armar(cat, [{ nombre: 'Cera modeladora', cantidad: 1, precio: 5000 }]);
  assert(a.ok && a.total === 5000, 'el dueño puede cambiar el precio de esa venta');
  a = ventas.armar(cat, [{ nombre: 'Cera modeladora', cantidad: 1 }, { nombre: 'Cera modeladora', cantidad: 4 }]);
  assert(a.ok && a.faltantes.length === 1 && a.faltantes[0].pedido === 5 && a.faltantes[0].habia === 4, 'si el mismo producto viene repetido, suma las cantidades para controlar el stock');
  a = ventas.armar(cat, [{ nombre: 'Algo suelto', cantidad: 1 }]);
  assert(!a.ok && /precio/.test(a.error), 'un producto que no está en el catálogo exige poner el precio');
  a = ventas.armar(cat, [{ nombre: 'Algo suelto', cantidad: 2, precio: 300 }]);
  assert(a.ok && a.total === 600 && a.lineas[0].enCatalogo === false, 'venta libre con precio manual');
  a = ventas.armar(cat, [{ nombre: 'Peine', cantidad: 2 }], { descuentoPct: 10 });
  assert(a.ok && a.bruto === 2000 && a.descuento === 200 && a.total === 1800, 'descuento en porcentaje');
  assert(!ventas.armar(cat, [{ nombre: 'Peine', cantidad: 0 }]).ok && !ventas.armar(cat, []).ok && !ventas.armar(cat, [{ nombre: 'Peine', cantidad: 1, precio: -5 }]).ok, 'rechaza sin productos, cantidad cero o precio negativo');
  assert(!ventas.armar(cat, [{ nombre: 'Peine', cantidad: 1, precio: 0 }]).ok, 'una venta de $0 no se registra');
  assert(ventas.armar(cat, Array.from({ length: 41 }, () => ({ nombre: 'Peine', cantidad: 1 }))).ok === false, 'tope de productos por venta');

  // ── contra la base ──
  const Config = require('../main/bot-engine/models/Config');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  await Config.create({ userId: 'u1', catalogo: cat.map((p) => ({ ...p })) });
  const D = { Config, Movimiento };
  const stockDe = async (n) => (await Config.findOne({ userId: 'u1' }).lean()).catalogo.find((p) => p.nombre === n).stock;

  let r = await ventas.vender(D, 'u1', { items: [{ nombre: 'Cera modeladora', cantidad: 2 }, { nombre: 'Peine', cantidad: 1 }], metodo: 'mercadopago', clave: 'k1' });
  assert(r.ok && r.venta.monto === 13400 && r.venta.metodo === 'mercadopago' && r.venta.origen === 'venta' && r.venta.categoria === 'Ventas', 'registra el ingreso en la Caja con el método de pago');
  assert(await stockDe('Cera modeladora') === 2 && await stockDe('Peine') === 1 && await stockDe('Shampoo reparador') === -1, 'descuenta el stock (y no toca lo que no controla stock)');
  assert(r.bajos.some((b) => b.nombre === 'Peine') && /Poco stock/.test(require('../main/gestion/stock').textoPocoStock(r.bajos)), 'avisa cuando queda poco');
  assert(/2× Cera modeladora, Peine/.test(r.venta.descripcion), 'la descripción resume lo vendido');

  const rep = await ventas.vender(D, 'u1', { items: [{ nombre: 'Cera modeladora', cantidad: 2 }, { nombre: 'Peine', cantidad: 1 }], clave: 'k1' });
  assert(rep.ok && rep.yaEstaba && await stockDe('Cera modeladora') === 2 && (await Movimiento.find({ userId: 'u1', origen: 'venta' }).lean()).length === 1, 'un doble toque (misma clave) no vende ni descuenta dos veces');

  r = await ventas.vender(D, 'u1', { items: [{ nombre: 'Cera modeladora', cantidad: 5 }] });
  assert(!r.ok && r.sinStock && r.faltantes[0].habia === 2 && await stockDe('Cera modeladora') === 2, 'sin stock suficiente: avisa y NO vende');
  r = await ventas.vender(D, 'u1', { items: [{ nombre: 'Cera modeladora', cantidad: 5 }], forzar: true });
  assert(r.ok && await stockDe('Cera modeladora') === 0 && r.faltantes.length === 1, 'si el dueño insiste ("vender igual"), el stock queda en 0 (nunca negativo)');

  r = await ventas.vender(D, 'u1', { items: [{ nombre: 'Shampoo reparador', cantidad: 1 }], metodo: 'bitcoin' });
  assert(r.ok && r.venta.metodo === 'efectivo', 'un método de pago desconocido se toma como efectivo');

  const v = (await Movimiento.find({ userId: 'u1', origen: 'venta', ventaClave: 'k1' }).lean())[0];
  let an = await ventas.anular(D, 'u1', v._id);
  assert(an.ok && await stockDe('Peine') === 2 && !(await Movimiento.findOne({ _id: v._id })), 'anular devuelve el stock y quita el ingreso');
  an = await ventas.anular(D, 'u1', v._id);
  assert(!an.ok, 'no se puede anular dos veces ni devolver el stock otra vez');
  assert(await stockDe('Peine') === 2, '…y el stock no cambió');
  assert(!(await ventas.anular(D, 'u2', v._id)).ok, 'otro negocio no puede anular ventas ajenas');

  // ── rutas ──
  let recargas = 0;
  const app = express(); app.use(express.json());
  const deps = { requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, botService: { recargarConfig: () => { recargas++; } } };
  app.use('/api/app/ventas', require('../main/local-api/routes/ventas.routes')(deps));
  app.use('/api/caja', require('../main/local-api/routes/caja.routes')(deps));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (m, p, body) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let x = await j('GET', '/app/ventas');
  assert(x.status === 200 && x.body.productos.length === 3 && x.body.recientes.length >= 1, 'GET lista productos a la venta y las últimas ventas');
  x = await j('POST', '/app/ventas', { items: [{ nombre: 'Peine', cantidad: 2 }], metodo: 'efectivo', clave: 'r1' });
  assert(x.status === 200 && x.body.total === 2000 && /se agotó/.test(x.body.aviso) && recargas === 1, 'POST vende, avisa que se agotó y le avisa al bot (para que vea el stock nuevo)');
  x = await j('POST', '/app/ventas', { items: [{ nombre: 'Peine', cantidad: 1 }] });
  assert(x.status === 409 && x.body.faltantes.length === 1, 'sin stock → 409 con el detalle');
  x = await j('POST', '/app/ventas', { items: [] });
  assert(x.status === 400, 'venta vacía → 400');

  const mov = (await Movimiento.find({ userId: 'u1', origen: 'venta', ventaClave: 'r1' }).lean())[0];
  x = await j('PUT', `/caja/movimiento/${mov._id}`, { monto: 1 });
  assert(x.status === 400 && /anulala/.test(x.body.error), 'la Caja no deja editar una venta (se anula y se carga de nuevo)');
  x = await j('DELETE', `/caja/movimiento/${mov._id}`);
  assert(x.status === 200 && /Venta anulada/.test(x.body.aviso) && await stockDe('Peine') === 2, 'borrar una venta desde la Caja la anula y devuelve el stock');
  const ped = await Movimiento.create({ userId: 'u1', origen: 'pedido', tipo: 'ingreso', monto: 5, fecha: '2026-10-07', metodo: 'efectivo', categoria: 'Ventas' });
  x = await j('DELETE', `/caja/movimiento/${ped._id}`);
  assert(x.status === 400 && /Pedidos/.test(x.body.error), 'un ingreso de pedido se cancela desde Pedidos (no se borra suelto de la Caja)');
  srv.close();

  console.log('\n✅ Todos los tests de ventas pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
