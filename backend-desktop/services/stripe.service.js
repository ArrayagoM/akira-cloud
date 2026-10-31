// services/stripe.service.js
// Cobro de suscripciones con Stripe para clientes del exterior (Argentina sigue con Mercado Pago).
//  · Pago en la página alojada de Stripe (Checkout): los datos de la tarjeta NUNCA pasan por nuestro servidor.
//  · Los precios los define el servidor (variables STRIPE_PRICE_*): el cliente solo elige un plan de la lista.
//  · La activación del plan sale ÚNICAMENTE de avisos firmados por Stripe (webhook) y de facturas pagadas de un precio nuestro.
//  · Cada evento se procesa una sola vez (modelo StripeEvento) y la activación es idempotente: repetir el aviso no cambia nada.
'use strict';

const logger = require('../config/logger');
const C = require('../lib/stripe-cobro');

let _cliente = null; let _claveUsada = '';

const stripeConfigurado = (env = process.env) => env.STRIPE !== 'off' && C.claveValida(env.STRIPE_SECRET_KEY);

function cliente(env = process.env) {
  if (!stripeConfigurado(env)) { const e = new Error('El cobro con tarjeta del exterior no está disponible por ahora.'); e.codigo = 'STRIPE_NO_CONFIGURADO'; e.status = 503; throw e; }
  if (!_cliente || _claveUsada !== env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    _cliente = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15000, appInfo: { name: 'Akira Cloud', url: 'https://akiracloud.lat' } });
    _claveUsada = env.STRIPE_SECRET_KEY;
  }
  return _cliente;
}

const falla = (codigo, mensaje, status) => Object.assign(new Error(mensaje), { codigo, status });
const urlFrontend = (env) => String(env.FRONTEND_URL || 'https://akiracloud.lat').trim().replace(/\/+$/, '');
const idDe = (x) => (x && typeof x === 'object' ? x.id : x) || '';

// ── Lo que ve la persona: precios de Stripe (se leen de Stripe y se guardan 10 minutos) ──
let _cachePrecios = { en: 0, datos: null };
async function preciosVisibles({ env = process.env, stripe = null, ahora = Date.now() } = {}) {
  const mapa = C.preciosStripe(env); const claves = Object.keys(mapa);
  if (!claves.length) return {};
  if (_cachePrecios.datos && ahora - _cachePrecios.en < 600000 && _cachePrecios.clave === claves.join()) return _cachePrecios.datos;
  const s = stripe || cliente(env); const out = {};
  await Promise.all(claves.map(async (k) => {
    try { const p = await s.prices.retrieve(mapa[k]); if (p && p.active && Number.isFinite(p.unit_amount)) out[k] = { monto: p.unit_amount / 100, moneda: String(p.currency || '').toUpperCase() }; }
    catch (e) { logger.warn(`[Stripe] no se pudo leer el precio de ${k}: ${e.message}`); }
  }));
  _cachePrecios = { en: ahora, datos: out, clave: claves.join() };
  return out;
}

// ── Crear el pago ──
async function crearCheckout({ user, planId, env = process.env, deps = {} }) {
  const stripe = deps.stripe || cliente(env);
  const User = deps.User || require('../models/User');
  const priceId = C.preciosStripe(env)[planId];
  if (!priceId) throw falla('PLAN_NO_DISPONIBLE', 'Ese plan no está disponible para pagar con tarjeta del exterior.', 400);

  const u = await User.findById(user._id).select('+stripeCustomerId +stripeSubscriptionId +stripeEstado +stripeCancelaAlFinal email nombre');
  if (!u) throw falla('USUARIO', 'Usuario no encontrado.', 404);
  if (u.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(u.stripeEstado) && !u.stripeCancelaAlFinal) {
    throw falla('YA_SUSCRIPTO', 'Ya tenés una suscripción activa. Para cambiar de plan o cancelar, usá "Administrar suscripción".', 409);
  }

  let customerId = u.stripeCustomerId;
  if (!customerId) {
    const c = await stripe.customers.create({ email: u.email, name: u.nombre || undefined, metadata: { userId: String(u._id) } }, { idempotencyKey: `cust-${u._id}` });
    // Se guarda solo si sigue vacío (si dos pedidos llegan a la vez, gana el primero y el otro usa ese mismo cliente).
    const guardado = await User.findOneAndUpdate({ _id: u._id, $or: [{ stripeCustomerId: { $exists: false } }, { stripeCustomerId: null }, { stripeCustomerId: '' }] }, { stripeCustomerId: c.id }, { new: true }).select('+stripeCustomerId');
    customerId = guardado ? guardado.stripeCustomerId : ((await User.findById(u._id).select('+stripeCustomerId')) || {}).stripeCustomerId;
  }

  const front = urlFrontend(env);
  const sesion = await stripe.checkout.sessions.create({
    mode: 'subscription', customer: customerId, client_reference_id: String(u._id),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: String(u._id), planId }, subscription_data: { metadata: { userId: String(u._id), planId } },
    success_url: `${front}/planes?suscripcion=ok&proveedor=stripe`, cancel_url: `${front}/planes?error=pago_cancelado`,
    allow_promotion_codes: false, billing_address_collection: 'auto',
  }, { idempotencyKey: `co-${u._id}-${planId}-${Math.floor(Date.now() / 600000)}` });
  return { url: sesion.url, id: sesion.id };
}

// ── Administrar la suscripción (cambiar tarjeta, ver facturas, cancelar): portal alojado por Stripe ──
async function crearPortal({ user, env = process.env, deps = {} }) {
  const stripe = deps.stripe || cliente(env);
  const User = deps.User || require('../models/User');
  const u = await User.findById(user._id).select('+stripeCustomerId');
  if (!u || !u.stripeCustomerId) throw falla('SIN_SUSCRIPCION', 'Todavía no tenés una suscripción con tarjeta del exterior.', 404);
  const sesion = await stripe.billingPortal.sessions.create({ customer: u.stripeCustomerId, return_url: `${urlFrontend(env)}/planes` });
  return { url: sesion.url };
}

// ── Avisos de Stripe ──
const subDeFactura = (f) => idDe(f.subscription) || idDe(f.parent && f.parent.subscription_details && f.parent.subscription_details.subscription);

async function registrarLog(deps, userId, nivel, mensaje) {
  try { const Log = deps.Log || require('../models/Log'); await Log.registrar({ userId, tipo: 'bot_payment', nivel, mensaje }); } catch (e) { logger.warn('[Stripe] no se pudo registrar el log: ' + e.message); }
}

async function despachar(event, deps, env) {
  const User = deps.User || require('../models/User');
  const Pago = deps.Pago || require('../models/Pago');
  const obj = event.data && event.data.object;
  const porCliente = (cid) => (cid ? User.findOne({ stripeCustomerId: cid }).select('+stripeCustomerId +stripeSubscriptionId +stripeEstado email plan planExpira') : null);

  switch (event.type) {
    case 'checkout.session.completed': {
      if (!obj || obj.mode !== 'subscription') return { ignorado: true, motivo: 'no es una suscripción' };
      const cid = idDe(obj.customer); const uid = String(obj.client_reference_id || '');
      const u = await User.findById(uid).select('+stripeCustomerId');
      // El cliente de Stripe de la sesión tiene que ser el que NOSOTROS le creamos a esa cuenta: si no, no se toca nada.
      if (!u || !cid || u.stripeCustomerId !== cid) { logger.warn(`[Stripe] sesión ${obj.id}: el cliente no coincide con la cuenta; se ignora`); return { ignorado: true, motivo: 'cliente no coincide' }; }
      if (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required') await User.findByIdAndUpdate(u._id, { stripeSubscriptionId: idDe(obj.subscription), stripeEstado: 'active' });
      return { ok: true, usuario: String(u._id) };
    }

    case 'invoice.paid': case 'invoice.payment_succeeded': {
      const u = await porCliente(idDe(obj && obj.customer));
      if (!u) { logger.warn(`[Stripe] factura ${obj && obj.id}: no hay una cuenta con ese cliente; se ignora`); return { ignorado: true, motivo: 'cuenta desconocida' }; }
      const v = C.verificarFactura(obj, env);
      if (!v.ok) { logger.warn(`[Stripe] factura ${obj && obj.id} NO activa el plan (${u.email}): ${v.detalle}`); await registrarLog(deps, u._id, 'warn', `Factura de Stripe ${obj && obj.id} pagada pero no activó el plan: ${v.detalle}`); return { ignorado: true, motivo: v.detalle }; }
      // Activar es idempotente (la expiración sale del fin del período pagado): si el aviso se repite, queda igual.
      const expira = C.expiracionStripe({ finPeriodo: v.finPeriodo, planExpiraActual: u.planExpira });
      const sub = subDeFactura(obj);
      await User.findByIdAndUpdate(u._id, { plan: v.plan.key, planPeriodo: v.plan.periodo, planExpira: expira, status: 'activo', stripeEstado: 'active', ...(sub ? { stripeSubscriptionId: sub } : {}) });
      try { await Pago.create({ userId: u._id, email: u.email || '', mpPagoId: `stripe:${obj.id}`, plan: v.plan.key, periodo: v.plan.periodo, monto: v.monto, moneda: v.moneda, proveedor: 'stripe' }); }
      catch (e) { if (!(e && e.code === 11000)) logger.warn(`[Stripe] no se pudo registrar el pago ${obj.id} en ingresos: ${e.message}`); }
      await registrarLog(deps, u._id, 'info', `Plan ${v.plan.key} (${v.plan.periodo}) activado con Stripe | factura ${obj.id} | ${v.monto} ${v.moneda}`);
      if (deps.io || global.io) (deps.io || global.io).to(`user:${u._id}`).emit('suscripcion:activada', { plan: v.plan.key, planBase: v.plan.key, expira, mensaje: '¡Plan activado!' });
      return { ok: true, activado: true, plan: v.plan.id, expira };
    }

    case 'invoice.payment_failed': {
      const u = await porCliente(idDe(obj && obj.customer));
      if (!u) return { ignorado: true, motivo: 'cuenta desconocida' };
      await User.findByIdAndUpdate(u._id, { stripeEstado: 'past_due' }); // el acceso sigue hasta que venza lo ya pagado; Stripe reintenta el cobro
      await registrarLog(deps, u._id, 'warn', `Stripe no pudo cobrar la factura ${obj.id}; reintentará automáticamente.`);
      return { ok: true };
    }

    case 'customer.subscription.updated': case 'customer.subscription.deleted': {
      const u = await porCliente(idDe(obj && obj.customer));
      if (!u) return { ignorado: true, motivo: 'cuenta desconocida' };
      const cancelado = event.type === 'customer.subscription.deleted' || obj.status === 'canceled';
      await User.findByIdAndUpdate(u._id, { stripeSubscriptionId: obj.id, stripeEstado: cancelado ? 'canceled' : String(obj.status || ''), stripeCancelaAlFinal: !cancelado && !!(obj.cancel_at_period_end || obj.cancel_at) });
      return { ok: true }; // el plan NO se corta acá: queda activo hasta que termine el período ya pagado (planExpira)
    }

    case 'charge.refunded': case 'charge.dispute.created': {
      const u = await porCliente(idDe(obj && obj.customer));
      await registrarLog(deps, u ? u._id : null, 'warn', `Stripe: ${event.type} (${obj && obj.id}). Revisar a mano en el panel de Stripe.`);
      return { ok: true, revisarAMano: true };
    }

    default: return { ignorado: true, motivo: 'tipo no usado' };
  }
}

// Procesa un evento YA verificado (firma comprobada en la ruta). Una sola vez por evento; si falla, se libera para que Stripe reintente.
async function procesarEvento(event, deps = {}, env = process.env) {
  const StripeEvento = deps.StripeEvento || require('../models/StripeEvento');
  try { await StripeEvento.create({ _id: event.id, tipo: event.type }); }
  catch (e) { if (e && e.code === 11000) return { duplicado: true }; throw e; }
  try { return await despachar(event, deps, env); }
  catch (err) { await StripeEvento.deleteOne({ _id: event.id }).catch(() => {}); throw err; }
}

module.exports = { stripeConfigurado, cliente, preciosVisibles, crearCheckout, crearPortal, procesarEvento, despachar };
