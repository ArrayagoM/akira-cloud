// lib/cobro.js
// Reglas del cobro de suscripciones (puras, sin base de datos, para poder probarlas):
//  · los precios de los planes (UNA sola fuente; el frontend repite los números y tests/precios.test.js comprueba que coincidan),
//  · si un pago de Mercado Pago alcanza para el plan que dice pagar,
//  · hasta cuándo queda activo el plan (renovar antes de tiempo SUMA, no pierde días),
//  · la fecha de vencimiento del checkout en el formato que Mercado Pago Argentina entiende.
'use strict';

// El plan anual es 12 meses con 20 % de descuento sobre el precio mensual (por eso "20 % OFF" es verdad).
const DESCUENTO_ANUAL = 0.20;
const PRECIOS_MENSUALES = { basico: 21000, pro: 49000, agencia: 112000 };
const NOMBRES = { basico: 'Básico', pro: 'Pro', agencia: 'Agencia' };
const DESCUENTO_REFERIDO_MAX = 5000; // el descuento por referido es fijo y de un solo uso

// Precios vigentes hasta el 14/10/2026: se aceptan SOLO para pagos de links de checkout armados antes del aumento (duran 1 hora).
const PRECIOS_ANTERIORES = {
  basico_mensual: 15000, basico_anual: 144000, pro_mensual: 35000, pro_anual: 336000, agencia_mensual: 80000, agencia_anual: 768000,
};

const FIN_MARGEN_PRECIOS_ANTERIORES = new Date('2026-10-15T06:00:00Z'); // 1 h de vida del link + holgura, contado desde la publicación del aumento
const precioAnual = (mensual) => Math.round(mensual * 12 * (1 - DESCUENTO_ANUAL));

function armarPlanes() {
  const planes = {};
  for (const [key, mensual] of Object.entries(PRECIOS_MENSUALES)) {
    planes[`${key}_mensual`] = { key, nombre: NOMBRES[key], periodo: 'mensual', precio: mensual, meses: 1 };
    planes[`${key}_anual`] = { key, nombre: NOMBRES[key], periodo: 'anual', precio: precioAnual(mensual), meses: 12 };
  }
  return planes;
}

// ¿Este pago de Mercado Pago alcanza para lo que dice pagar? → { ok, detalle }
// El precio esperado viaja en la metadata de la preferencia (la armamos nosotros: nadie más puede ponerla); si falta (links viejos),
// se usa el precio de lista de hoy, o el anterior al aumento si el link es de antes del cambio.
function verificarMonto({ pago, planInfo, descuentoAplicado = 0 }) {
  if (!pago || !planInfo) return { ok: false, detalle: 'Faltan datos del pago o del plan.' };
  const cobrado = Number(pago.transaction_amount);
  if (!Number.isFinite(cobrado) || cobrado <= 0) return { ok: false, detalle: 'El pago no informa un monto válido.' };
  if (pago.currency_id && pago.currency_id !== 'ARS') return { ok: false, detalle: `La moneda del pago es ${pago.currency_id}, no ARS.` };
  const desc = Number(descuentoAplicado) || 0;
  if (desc < 0 || desc > DESCUENTO_REFERIDO_MAX) return { ok: false, detalle: `Descuento de referido fuera de rango ($${desc}).` };
  const meta = Number(pago.metadata && pago.metadata.precio_esperado);
  const anterior = PRECIOS_ANTERIORES[`${planInfo.key}_${planInfo.periodo}`];
  // El precio anterior solo vale para pagos hechos justo después del aumento (links armados antes); pasado ese margen, no.
  const creado = pago.date_created ? new Date(pago.date_created) : null;
  const linkViejo = !!(anterior && creado && creado < FIN_MARGEN_PRECIOS_ANTERIORES);
  const esperado = Number.isFinite(meta) && meta > 0 ? meta : Math.min(planInfo.precio - desc, linkViejo ? anterior - desc : Infinity);
  if (cobrado + 1 < esperado) return { ok: false, detalle: `Pagó $${cobrado} y el plan ${planInfo.nombre} ${planInfo.periodo} cuesta $${esperado}.` };
  return { ok: true, detalle: `Pagó $${cobrado} (mínimo $${esperado}).`, cobrado, esperado };
}

// Hasta cuándo queda activo. Si renueva el MISMO plan antes de que venza, se suma al tiempo que le quedaba; si el plan ya venció o
// cambia de plan, empieza a contar desde hoy.
function nuevaExpiracion({ ahora = new Date(), planExpiraActual = null, planActual = '', planKey, meses }) {
  const vigente = planExpiraActual && new Date(planExpiraActual) > ahora && String(planActual) === String(planKey);
  const e = new Date(vigente ? planExpiraActual : ahora);
  e.setMonth(e.getMonth() + meses);
  return e;
}

// Mercado Pago Argentina exige ISO 8601 con offset explícito (-03:00) en los campos expiration_date_*. Con sufijo "Z" interpreta la hora como
// local de Argentina (3 horas antes) y el link puede quedar vencido de entrada: el botón "Pagar" aparece en gris. (Mismo arreglo que el bot.)
function aFechaMercadoPago(fecha) {
  const d = new Date(fecha.getTime() - 3 * 60 * 60 * 1000); const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}-03:00`;
}

module.exports = { FIN_MARGEN_PRECIOS_ANTERIORES, DESCUENTO_ANUAL, PRECIOS_MENSUALES, PRECIOS_ANTERIORES, DESCUENTO_REFERIDO_MAX, precioAnual, armarPlanes, verificarMonto, nuevaExpiracion, aFechaMercadoPago };
