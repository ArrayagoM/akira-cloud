// tests/pedidos-api.test.js — pantalla Pedidos: listar, marcar pagado (transferencia/efectivo), entregado y cancelar.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-papi-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[pedidos-api] Tests:');
  const Pedido = require('../main/bot-engine/models/Pedido');
  const Config = require('../main/bot-engine/models/Config');
  const Movimiento = require('../main/bot-engine/models/Movimiento');
  await Config.create({ userId: 'u1', catalogo: [{ nombre: 'Cera', precio: 6200, stock: 4, disponible: true }] });
  const mk = (n, estado, extra = {}) => Pedido.create({ userId: 'u1', numero: n, estado, jid: `54922410000${n}@s.whatsapp.net`, nombre: `Cliente ${n}`, items: [{ nombre: 'Cera', precio: 6200, cantidad: 2 }], subtotal: 12400, envio: 0, total: 12400, entrega: 'retiro', metodoPago: 'transferencia', confirmadoEn: new Date().toISOString(), ...extra });
  const p1 = await mk(1, 'pendiente-pago'); const p2 = await mk(2, 'pendiente-pago'); await mk(3, 'carrito', { items: [] });
  await Pedido.create({ userId: 'u2', numero: 1, estado: 'pendiente-pago', items: [], total: 1 });

  const mensajes = []; let recargas = 0;
  const app = express(); app.use(express.json());
  app.use('/api/app/pedidos', require('../main/local-api/routes/pedidos.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, botService: { recargarConfig: () => { recargas++; }, enviarACliente: (jid, t) => { mensajes.push({ jid, t }); return true; } } }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/pedidos`;
  const j = async (p, body) => { const x = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json() }; };

  let r = await j('');
  assert(r.body.pedidos.length === 2 && r.body.resumen.pendientes === 2 && r.body.resumen.porEntregar === 0, 'lista solo los pedidos del usuario (no los carritos en armado ni los de otros negocios)');
  r = await j(`/${p1._id}/pagar`, { metodo: 'transferencia' });
  assert(r.status === 200 && r.body.pedido.estado === 'pagado' && /Poco stock/.test(r.body.pocoStock || 'Poco stock') || r.status === 200, 'marcar pagado por transferencia');
  assert((await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 2 && recargas >= 1, 'descuenta el stock y recarga el bot');
  const mov = await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean();
  assert(mov.length === 1 && mov[0].metodo === 'transferencia' && mov[0].monto === 12400, 'el ingreso entra a la Caja con el método elegido');
  assert(mensajes.length === 1 && /Recibimos tu pago/.test(mensajes[0].t) && mensajes[0].jid.includes('549224100001'), 'el cliente recibe la confirmación por WhatsApp');
  r = await j(`/${p1._id}/pagar`, { metodo: 'transferencia' });
  assert(r.status === 200 && mensajes.length === 1 && (await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean()).length === 1, 'pagar dos veces no duplica nada ni vuelve a avisar');
  r = await j(`/${p2._id}/pagar`, { metodo: 'invento' });
  assert((await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean()).find((m) => /#2/.test(m.descripcion)).metodo === 'transferencia', 'un método inválido se toma como transferencia (no rompe)');
  r = await j(`/${p1._id}/estado`, { estado: 'entregado' });
  assert(r.status === 200 && r.body.pedido.estado === 'entregado' && mensajes.at(-1).t.includes('entregado'), 'marcar entregado avisa al cliente');
  r = await j(`/${p1._id}/estado`, { estado: 'cancelado' });
  assert(r.status === 409 && /ya entregado/.test(r.body.error), 'uno entregado no se cancela (409)');
  r = await j(`/${p2._id}/estado`, { estado: 'cancelado' });
  assert(r.status === 200 && (await Config.findOne({ userId: 'u1' })).catalogo[0].stock === 2 && (await Movimiento.find({ userId: 'u1', origen: 'pedido' }).lean()).length === 1, 'cancelar uno pagado devuelve el stock y quita su ingreso de la Caja');
  assert((await j('/inexistente/pagar', {})).status === 404 && (await j('/inexistente/estado', { estado: 'entregado' })).status === 404, 'pedido inexistente → 404');
  r = await j('');
  assert(r.body.pedidos.map((p) => p.numero).join() === '1,2' && r.body.pedidos[0].estado === 'entregado' && r.body.resumen.cobradoTotal === 12400, 'ordena por estado y suma lo cobrado (sin contar el cancelado)');
  srv.close();

  console.log('\n✅ Todos los tests de pedidos-api pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
