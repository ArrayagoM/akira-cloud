// gestion/pedidos-pago.js
// Ciclo de vida de un pedido: carrito → pendiente-pago → pagado → entregado (o cancelado).
// Al PAGARSE: se descuenta el stock y se anota el ingreso en la Caja. Al CANCELAR un pedido ya pagado: se devuelve el stock y
// se quita el ingreso. Todo idempotente: un aviso de pago repetido (MercadoPago reenvía) no descuenta ni cobra dos veces.
// Lo usan el bot (webhook de MercadoPago) y la pantalla Pedidos (transferencias / efectivo). Probado en tests/pedidos-pago.test.js.
'use strict';

const stock = require('./stock');
const caja = require('./caja');

const ESTADOS = ['carrito', 'pendiente-pago', 'pagado', 'entregado', 'cancelado'];
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function proximoNumero(Pedido, userId) {
  const todos = await Pedido.find({ userId: String(userId) }).lean();
  return todos.reduce((m, p) => Math.max(m, p.numero || 0), 0) + 1;
}

// Convierte el carrito en un pedido "pendiente de pago". → Pedido
async function confirmar({ Pedido }, { userId, carritoId, jid, nombre, telefono, items, entrega, direccion = '', notas = '', costoEnvio = 0, metodoPago = 'transferencia', link = '' }) {
  const subtotal = redondear(items.reduce((s, i) => s + i.precio * i.cantidad, 0));
  const envio = entrega === 'envio' ? redondear(costoEnvio) : 0;
  const datos = {
    numero: await proximoNumero(Pedido, userId), estado: 'pendiente-pago', items, subtotal, envio, total: redondear(subtotal + envio),
    entrega, direccion: String(direccion).slice(0, 200), notas: String(notas).slice(0, 300), metodoPago, link, nombre, telefono, jid, confirmadoEn: new Date().toISOString(),
  };
  if (carritoId) return Pedido.findOneAndUpdate({ _id: carritoId, userId: String(userId) }, { $set: datos }, { new: true });
  return Pedido.create({ userId: String(userId), ...datos });
}

// Registra el pago. → { ok, yaEstaba, pedido, bajos, faltantes }
async function marcarPagado({ Pedido, Config, Movimiento }, userId, pedidoId, { metodo = 'transferencia', comprobante = '' } = {}) {
  const uid = String(userId);
  const p = await Pedido.findOne({ _id: pedidoId, userId: uid }).lean();
  if (!p) return { ok: false, error: 'Pedido no encontrado' };
  if (p.estado === 'pagado' || p.estado === 'entregado') return { ok: true, yaEstaba: true, pedido: p, bajos: [], faltantes: [] };
  if (p.estado === 'cancelado') return { ok: false, error: 'Ese pedido está cancelado.' };
  if (p.estado === 'carrito') return { ok: false, error: 'El pedido todavía no fue confirmado.' };
  // se marca primero (si dos avisos llegan juntos, solo uno sigue)
  const actualizado = await Pedido.findOneAndUpdate({ _id: pedidoId, userId: uid, estado: 'pendiente-pago' }, { $set: { estado: 'pagado', pagadoEn: new Date().toISOString(), pago: { metodo, comprobante: String(comprobante).slice(0, 80) } } }, { new: true });
  if (!actualizado) return { ok: true, yaEstaba: true, pedido: p, bajos: [], faltantes: [] };
  const r = await stock.descontarEnConfig(Config, uid, p.items);
  const metodoCaja = caja.METODOS.includes(metodo) ? metodo : 'otro';
  const mov = await Movimiento.create({
    userId: uid, origen: 'pedido', pedidoId: String(p._id), tipo: 'ingreso', monto: p.total, fecha: caja.fechaLocal(new Date()), metodo: metodoCaja,
    categoria: 'Ventas', descripcion: `Pedido #${p.numero}${p.nombre ? ` — ${p.nombre}` : ''}`.slice(0, 200), cliente: String(p.nombre || '').slice(0, 80), documentoId: null,
  });
  await Pedido.findOneAndUpdate({ _id: pedidoId, userId: uid }, { $set: { cajaId: String(mov._id) } });
  return { ok: true, yaEstaba: false, pedido: { ...actualizado, cajaId: String(mov._id) }, bajos: r.bajos, faltantes: r.faltantes };
}

// 'entregado' o 'cancelado'. Cancelar un pedido ya pagado devuelve el stock y quita el ingreso de la Caja.
async function cambiarEstado({ Pedido, Config, Movimiento }, userId, pedidoId, nuevo) {
  const uid = String(userId);
  if (!['entregado', 'cancelado'].includes(nuevo)) return { ok: false, error: 'Estado no válido' };
  const p = await Pedido.findOne({ _id: pedidoId, userId: uid }).lean();
  if (!p) return { ok: false, error: 'Pedido no encontrado' };
  if (p.estado === nuevo) return { ok: true, pedido: p };
  if (nuevo === 'entregado' && p.estado !== 'pagado') return { ok: false, error: p.estado === 'entregado' ? 'Ya está entregado.' : 'Para marcarlo como entregado, primero tiene que estar pagado.' };
  if (nuevo === 'cancelado') {
    if (p.estado === 'entregado') return { ok: false, error: 'Un pedido ya entregado no se puede cancelar.' };
    if (p.estado === 'pagado') {
      await stock.reponerEnConfig(Config, uid, p.items);
      if (p.cajaId) await Movimiento.deleteOne({ _id: p.cajaId, userId: uid });
    }
  }
  const act = await Pedido.findOneAndUpdate({ _id: pedidoId, userId: uid }, { $set: { estado: nuevo, [`${nuevo}En`]: new Date().toISOString() } }, { new: true });
  return { ok: true, pedido: act };
}

module.exports = { ESTADOS, confirmar, marcarPagado, cambiarEstado, proximoNumero };
