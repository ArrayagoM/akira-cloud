// lib/stripe-cobro.js
// Reglas del cobro con Stripe (puras, sin base de datos ni red, para poder probarlas): qué proveedor corresponde a cada país, qué precio de
// Stripe corresponde a cada plan (la lista la arma el SERVIDOR: el cliente nunca elige un precio), si una factura pagada alcanza para un plan
// y hasta cuándo queda activo el acceso.
'use strict';

const PLANES_STRIPE = ['basico', 'pro', 'agencia'];
const PERIODOS = ['mensual', 'anual'];
const DIAS_GRACIA = 2; // margen sobre el fin del período pagado: la renovación llega por webhook y puede tardar unos minutos

// "Argentina" paga con Mercado Pago (en pesos); el resto del mundo con Stripe. Sirve como sugerencia: la persona puede elegir.
function proveedorPorPais(pais) {
  const p = String(pais || '').trim().toLowerCase();
  if (!p || p === 'argentina' || p === 'ar') return 'mercadopago';
  return 'stripe';
}

// Mapa { pro_mensual: 'price_...' } a partir de las variables de entorno STRIPE_PRICE_<PLAN>_<PERIODO> (por ejemplo STRIPE_PRICE_PRO_MENSUAL).
function preciosStripe(env = process.env) {
  const mapa = {};
  for (const plan of PLANES_STRIPE) for (const periodo of PERIODOS) {
    const v = String(env[`STRIPE_PRICE_${plan.toUpperCase()}_${periodo.toUpperCase()}`] || '').trim();
    if (/^price_[A-Za-z0-9]+$/.test(v)) mapa[`${plan}_${periodo}`] = v;
  }
  return mapa;
}

// Al revés: de un price de Stripe al plan. Es la verificación fuerte: una factura solo activa un plan si su price está en NUESTRA lista.
function planDePrecio(priceId, env = process.env) {
  const mapa = preciosStripe(env);
  const id = Object.keys(mapa).find((k) => mapa[k] === priceId);
  if (!id) return null;
  const [key, periodo] = id.split('_');
  return { id, key, periodo, meses: periodo === 'anual' ? 12 : 1 };
}

const claveValida = (k) => /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(String(k || ''));
const secretoWebhookValido = (s) => /^whsec_[A-Za-z0-9+/=_-]{10,}$/.test(String(s || ''));
const modoDeClave = (k) => (/^(sk|rk)_live_/.test(String(k || '')) ? 'live' : 'test');

// El price de una línea de factura. Cambió de lugar entre versiones de la API de Stripe: se aceptan las dos formas.
function precioDeLinea(linea) {
  if (!linea) return '';
  if (linea.price && linea.price.id) return linea.price.id;
  const pd = linea.pricing && linea.pricing.price_details;
  if (pd && pd.price) return typeof pd.price === 'string' ? pd.price : (pd.price.id || '');
  return '';
}

// ¿Esta factura pagada alcanza para activar un plan? → { ok, plan, detalle, monto, moneda, finPeriodo }
function verificarFactura(factura, env = process.env) {
  if (!factura || factura.object !== 'invoice') return { ok: false, detalle: 'No es una factura.' };
  if (factura.status !== 'paid') return { ok: false, detalle: `La factura está ${factura.status || 'sin estado'}, no pagada.` };
  const pagado = Number(factura.amount_paid);
  if (!Number.isFinite(pagado) || pagado <= 0) return { ok: false, detalle: 'La factura no informa un monto pagado mayor a cero.' };
  const lineas = (factura.lines && factura.lines.data) || [];
  const conPlan = lineas.map((l) => ({ l, plan: planDePrecio(precioDeLinea(l), env) })).find((x) => x.plan);
  if (!conPlan) return { ok: false, detalle: 'El precio de la factura no corresponde a ningún plan de Akira.' };
  const fin = conPlan.l.period && conPlan.l.period.end;
  if (!Number.isFinite(Number(fin)) || Number(fin) <= 0) return { ok: false, detalle: 'La factura no informa hasta cuándo cubre.' };
  return { ok: true, plan: conPlan.plan, monto: pagado / 100, moneda: String(factura.currency || '').toUpperCase(), finPeriodo: new Date(Number(fin) * 1000), detalle: 'Factura pagada de un plan válido.' };
}

// Hasta cuándo queda activo: el fin del período que se pagó + un margen. Nunca acorta un acceso que ya estaba más lejos.
function expiracionStripe({ finPeriodo, planExpiraActual = null, diasGracia = DIAS_GRACIA }) {
  const nueva = new Date(new Date(finPeriodo).getTime() + diasGracia * 86400000);
  const actual = planExpiraActual ? new Date(planExpiraActual) : null;
  return actual && actual > nueva ? actual : nueva;
}

module.exports = { PLANES_STRIPE, PERIODOS, DIAS_GRACIA, proveedorPorPais, preciosStripe, planDePrecio, claveValida, secretoWebhookValido, modoDeClave, precioDeLinea, verificarFactura, expiracionStripe };
