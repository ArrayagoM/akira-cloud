// services/bot/pedidos-bot.js
// El carrito de pedidos "del lado del bot": ejecuta las herramientas que usa la IA (agregar / quitar / ver / vaciar / confirmar)
// y procesa el pago aprobado. Todo con dependencias inyectadas para poder probarlo sin WhatsApp ni MercadoPago.
//  · El carrito vive en la base (un solo carrito abierto por cliente; vence a las 24 h).
//  · Precios y stock SIEMPRE salen del catálogo del negocio, nunca de lo que diga la IA.
//  · Al confirmar: link de MercadoPago (si está configurado) o datos de transferencia, y aviso al dueño.
'use strict';

const ped = require('./pedidos.service');
const pedidosPago = require('../../../gestion/pedidos-pago');
const stockLib = require('../../../gestion/stock');

const VENCE_CARRITO_MS = 24 * 3600e3;

function crearPedidosBot(d) {
  // d: { userId, Pedido, Config, Movimiento, getCatalogo(), getProgramas(), mp|null, conMP, negocio, miNombre, alias, cbu, banco,
  //      enviarMensaje(jid, texto), notificarDueno(texto), extraerNumero(jid), recargarConfig(), log }
  const log = d.log || (() => {});
  const ahora = d.ahora || (() => Date.now());

  async function manejar(nombre, args, jid, usuario, push) {
    const prog = d.getProgramas()?.pedidos;
    if (!prog?.activa) { push('Por ahora no tomamos pedidos por WhatsApp. Si necesita algo, que consulte directamente con el negocio.'); return; }
    const { Pedido } = d; const catalogo = d.getCatalogo();
    let cart = await Pedido.findOne({ userId: d.userId, jid, estado: 'carrito' });
    if (cart && ahora() - new Date(cart.updatedAt || cart.createdAt || ahora()).getTime() > VENCE_CARRITO_MS) cart = await Pedido.findOneAndUpdate({ _id: cart._id, userId: d.userId }, { $set: { items: [] } }, { new: true });
    const items = () => cart?.items || [];
    const guardar = async (nuevos) => {
      if (cart) cart = await Pedido.findOneAndUpdate({ _id: cart._id, userId: d.userId }, { $set: { items: nuevos, nombre: usuario.nombre || '' } }, { new: true });
      else cart = await Pedido.create({ userId: d.userId, jid, estado: 'carrito', items: nuevos, nombre: usuario.nombre || '' });
    };
    const envioCfg = () => (prog.entrega === 'retiro' ? 0 : Number(prog.costoEnvio) || 0);

    if (nombre === 'ver_carrito') { push(ped.resumenTexto(items(), { envio: 0 }) + (items().length && envioCfg() > 0 ? `\n(Si es envío se suma ${ped.pesos(envioCfg())} de envío.)` : '')); return; }
    if (nombre === 'vaciar_carrito') { await guardar([]); push('Pedido vaciado. ¿Querés empezar de nuevo?'); return; }

    if (nombre === 'agregar_al_carrito' || nombre === 'quitar_del_carrito') {
      const r = ped.buscarProducto(catalogo, args.producto);
      if (!r.ok) {
        push(r.motivo === 'ambiguo' ? `Hay varias opciones parecidas: ${r.opciones.join(', ')}. Preguntale al cliente cuál quiere.` : `No encontré "${args.producto}" entre los productos.${r.opciones.length ? ` Tenemos: ${r.opciones.join(', ')}.` : ''}`);
        return;
      }
      if (nombre === 'agregar_al_carrito') {
        const a = ped.agregar(items(), r.producto, args.cantidad ?? 1);
        if (a.error) { push(a.error); return; }
        await guardar(a.carrito);
        push(`Agregado: ${a.agregado} × ${r.producto.nombre}.\n${ped.resumenTexto(a.carrito)}\nPreguntale si quiere sumar algo más o confirmar el pedido.`);
      } else {
        const q = ped.quitar(items(), r.producto.nombre, args.cantidad ?? null);
        if (q.error) { push(q.error); return; }
        await guardar(q.carrito);
        push(`Listo, actualicé el pedido.\n${ped.resumenTexto(q.carrito)}`);
      }
      return;
    }

    // ── confirmar_pedido ──
    if (!items().length) { push('El pedido está vacío: primero agregá productos.'); return; }
    const entrega = ped.ENTREGAS.includes(args.entrega) ? args.entrega : null;
    if (!entrega) { push('Falta saber si es retiro en el local o envío a domicilio. Preguntaselo al cliente.'); return; }
    if (prog.entrega !== 'ambos' && prog.entrega !== entrega) { push(`Por ahora solo ofrecemos ${prog.entrega === 'retiro' ? 'retiro en el local' : 'envío a domicilio'}. Avisale al cliente.`); return; }
    if (entrega === 'envio' && String(args.direccion || '').trim().length < 5) { push('Falta la dirección de entrega: pedísela al cliente.'); return; }
    const v = ped.revalidar(items(), catalogo);
    if (!v.ok) { push(`No se puede confirmar todavía: ${v.problemas.join('; ')}. Avisale al cliente y ajustá el pedido.`); return; }

    const tel = usuario.numeroReal || d.extraerNumero(jid);
    const pedido = await pedidosPago.confirmar({ Pedido }, { userId: d.userId, carritoId: cart ? String(cart._id) : null, jid, nombre: usuario.nombre || '', telefono: tel, items: v.items, entrega, direccion: args.direccion || '', notas: args.notas || '', costoEnvio: Number(prog.costoEnvio) || 0, metodoPago: d.conMP ? 'mercadopago' : 'transferencia' });
    let linkPago = '';
    if (d.conMP && d.mp) {
      try {
        const pref = await d.mp.crearPago(jid, usuario.nombre || 'Cliente', new Date().toISOString().slice(0, 10), '00:00', null, { montoTotal: pedido.total, titulo: `Pedido #${pedido.numero} — ${d.negocio}`, referencia: `pedido|${pedido._id}`, venceMin: 24 * 60 });
        linkPago = pref.init_point;
        await Pedido.findOneAndUpdate({ _id: pedido._id, userId: d.userId }, { $set: { link: linkPago } });
      } catch (e) { log(`⚠️ [Pedidos] No se pudo generar el link de MercadoPago: ${e.message}`); }
    }
    const lineas = [`¡Listo, ${usuario.nombre || ''}! 🛍️ Este es tu pedido *#${pedido.numero}*:`, ped.resumenTexto(v.items, { envio: pedido.envio }), entrega === 'envio' ? `📍 Envío a: ${pedido.direccion}` : '🏪 Lo retirás en el local.'];
    if (linkPago) lineas.push('', `💳 Pagalo acá (el link vale 24 hs):\n${linkPago}`);
    else if (d.alias || d.cbu) lineas.push('', `🏦 Para pagar, transferí *${ped.pesos(pedido.total)}* a:\n${[d.alias && `Alias: ${d.alias}`, d.cbu && `CBU: ${d.cbu}`, d.banco && `Banco: ${d.banco}`].filter(Boolean).join('\n')}\nY mandanos el comprobante por acá.`);
    else lineas.push('', `${d.miNombre} te va a escribir para coordinar el pago.`);
    if (prog.nota) lineas.push('', prog.nota);
    await d.enviarMensaje(jid, lineas.join('\n'));
    d.notificarDueno(`🛒 *Nuevo pedido #${pedido.numero}* de ${usuario.nombre || d.extraerNumero(jid)} (+${tel})\n${ped.resumenTexto(v.items, { envio: pedido.envio })}\n${entrega === 'envio' ? `📍 Envío: ${pedido.direccion}` : '🏪 Retira en el local'}${pedido.notas ? `\n📝 ${pedido.notas}` : ''}\n⏳ Pendiente de pago (${d.conMP ? 'MercadoPago' : 'transferencia'}).`);
    push(`Pedido #${pedido.numero} creado: el resumen y cómo pagar YA se le enviaron al cliente. No repitas el link ni el total. Despedite y avisale que apenas se acredite el pago se lo confirmás.`);
  }

  // Aviso de MercadoPago con el pago aprobado de un pedido. Idempotente.
  async function confirmarPago(pedidoId, pago) {
    const { Pedido, Config, Movimiento } = d;
    const p = await Pedido.findOne({ _id: pedidoId, userId: d.userId }).lean();
    if (!p) { log(`[Pedidos] pago de un pedido que no existe (${pedidoId})`); return { ok: false }; }
    if (Number(pago.transaction_amount) + 0.01 < p.total) {
      d.notificarDueno(`⚠️ El pago de MercadoPago del pedido #${p.numero} es de ${ped.pesos(pago.transaction_amount)} y el pedido es de ${ped.pesos(p.total)}. Revisalo antes de entregarlo.`);
      return { ok: false, motivo: 'monto' };
    }
    const r = await pedidosPago.marcarPagado({ Pedido, Config, Movimiento }, d.userId, pedidoId, { metodo: 'mercadopago', comprobante: String(pago.id) });
    if (!r.ok || r.yaEstaba) return r;
    d.recargarConfig?.(); // el stock cambió: el bot recarga el catálogo
    d.emitirEvento?.('pedido.pagado', { pedidoId: String(p._id), numero: p.numero, cliente: p.nombre || '', telefono: p.telefono || '', total: p.total, entrega: p.entrega, items: p.items, metodo: 'mercadopago' });
    await d.enviarMensaje(p.jid, `¡Recibimos tu pago, ${p.nombre || ''}! 🎉 Tu pedido *#${p.numero}* está confirmado.${p.entrega === 'envio' ? ` Te lo enviamos a ${p.direccion}.` : ' Ya podés retirarlo en el local.'} ¡Gracias por tu compra!`);
    d.notificarDueno(`💰 *Pedido #${p.numero} pagado* por MercadoPago: ${ped.pesos(p.total)} — ${p.nombre || d.extraerNumero(p.jid)}.\n${p.entrega === 'envio' ? `📍 Enviar a: ${p.direccion}` : '🏪 Lo retira en el local'}${stockLib.textoPocoStock(r.bajos) ? `\n${stockLib.textoPocoStock(r.bajos)}` : ''}`);
    return r;
  }

  return { manejar, confirmarPago };
}

module.exports = { crearPedidosBot, VENCE_CARRITO_MS };
