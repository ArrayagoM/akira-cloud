// local-api/routes/pedidos.routes.js
// Pedidos hechos por WhatsApp (ver bot/pedidos.service.js y gestion/pedidos-pago.js): ver, marcar pagado (transferencia o efectivo),
// entregado o cancelado. Al pagarse se descuenta el stock y se anota el ingreso en la Caja.
'use strict';

const express = require('express');
const Pedido = require('../../bot-engine/models/Pedido');
const Config = require('../../bot-engine/models/Config');
const Movimiento = require('../../bot-engine/models/Movimiento');
const pp = require('../../gestion/pedidos-pago');
const stockLib = require('../../gestion/stock');
const caja = require('../../gestion/caja');

module.exports = function crearRouter({ requerirSesion, botService, servicioWebhooks }) {
  const router = express.Router();
  router.use(requerirSesion);
  const M = { Pedido, Config, Movimiento };
  const recargar = () => { for (let s = 0; s < 5; s++) { try { botService.recargarConfig(s); } catch { /* cuenta inactiva */ } } };
  const aviso = (p, texto) => { try { return p.jid ? botService.enviarACliente?.(p.jid, texto) : false; } catch { return false; } };
  const limpio = (p) => ({ _id: String(p._id), numero: p.numero, estado: p.estado, nombre: p.nombre || '', telefono: p.telefono || '', items: p.items || [], subtotal: p.subtotal, envio: p.envio, total: p.total, entrega: p.entrega, direccion: p.direccion || '', notas: p.notas || '', metodoPago: p.metodoPago, link: p.link || '', confirmadoEn: p.confirmadoEn, pagadoEn: p.pagadoEn || null, pago: p.pago || null });

  router.get('/', async (req, res) => {
    const todos = (await Pedido.find({ userId: String(req.user._id) }).lean()).filter((p) => p.estado !== 'carrito');
    const orden = { 'pendiente-pago': 0, pagado: 1, entregado: 2, cancelado: 3 };
    todos.sort((a, b) => (orden[a.estado] - orden[b.estado]) || (b.numero || 0) - (a.numero || 0));
    res.json({
      pedidos: todos.map(limpio),
      resumen: { pendientes: todos.filter((p) => p.estado === 'pendiente-pago').length, porEntregar: todos.filter((p) => p.estado === 'pagado').length, cobradoTotal: Math.round(todos.filter((p) => p.estado === 'pagado' || p.estado === 'entregado').reduce((s, p) => s + p.total, 0) * 100) / 100 },
    });
  });

  router.post('/:id/pagar', async (req, res) => {
    const metodo = caja.METODOS.includes(req.body?.metodo) ? req.body.metodo : 'transferencia';
    const r = await pp.marcarPagado(M, req.user._id, req.params.id, { metodo, comprobante: 'manual' });
    if (!r.ok) return res.status(r.error === 'Pedido no encontrado' ? 404 : 409).json({ error: r.error });
    if (!r.yaEstaba) {
      recargar();
      servicioWebhooks?.emitir('pedido.pagado', { pedidoId: String(r.pedido._id), numero: r.pedido.numero, cliente: r.pedido.nombre || '', telefono: r.pedido.telefono || '', total: r.pedido.total, entrega: r.pedido.entrega, items: r.pedido.items, metodo }); 
      aviso(r.pedido, `¡Recibimos tu pago, ${r.pedido.nombre || ''}! 🎉 Tu pedido *#${r.pedido.numero}* está confirmado.${r.pedido.entrega === 'envio' ? ` Te lo enviamos a ${r.pedido.direccion}.` : ' Ya podés retirarlo en el local.'} ¡Gracias por tu compra!`);
    }
    res.json({ ok: true, pedido: limpio(r.pedido), pocoStock: stockLib.textoPocoStock(r.bajos), faltantes: r.faltantes });
  });

  router.post('/:id/estado', async (req, res) => {
    const r = await pp.cambiarEstado(M, req.user._id, req.params.id, String(req.body?.estado || ''));
    if (!r.ok) return res.status(r.error === 'Pedido no encontrado' ? 404 : 409).json({ error: r.error });
    recargar();
    if (r.pedido.estado === 'entregado') aviso(r.pedido, `¡Tu pedido *#${r.pedido.numero}* ya fue entregado! 🙌 Gracias por elegirnos.`);
    res.json({ ok: true, pedido: limpio(r.pedido) });
  });

  return router;
};
