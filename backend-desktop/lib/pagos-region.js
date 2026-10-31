// lib/pagos-region.js
// Qué métodos de pago se pueden usar desde cada país y a qué precio (puro, sin red ni base de datos: se prueba aparte).
//  · Argentina paga en pesos con Mercado Pago (precio de lista de lib/cobro.js).
//  · El resto del mundo paga en dólares con tarjeta/PayPal (Lemon Squeezy) o con cripto (USDT): precio en dólares con un 30 % más por
//    impuestos y cambio de divisas. Mercado Pago queda BLOQUEADO fuera de Argentina: nuestro cobro con Mercado Pago es solo en pesos argentinos.
// Esto lo vuelve a comprobar el servidor al armar cada pago: bloquear un botón en pantalla no alcanza.
'use strict';

const { PRECIOS_MENSUALES, DESCUENTO_ANUAL } = require('./cobro');

const PAISES = [
  { codigo: 'AR', nombre: 'Argentina' }, { codigo: 'CL', nombre: 'Chile' }, { codigo: 'MX', nombre: 'México' }, { codigo: 'VE', nombre: 'Venezuela' },
  { codigo: 'CO', nombre: 'Colombia' }, { codigo: 'PE', nombre: 'Perú' }, { codigo: 'UY', nombre: 'Uruguay' }, { codigo: 'BO', nombre: 'Bolivia' },
  { codigo: 'EC', nombre: 'Ecuador' }, { codigo: 'PY', nombre: 'Paraguay' }, { codigo: 'BR', nombre: 'Brasil' }, { codigo: 'ES', nombre: 'España' },
  { codigo: 'US', nombre: 'Estados Unidos' }, { codigo: 'OTRO', nombre: 'Otro país' },
];

// Países donde los proveedores de pago no operan por sanciones internacionales: no se ofrece ningún método.
const SIN_SERVICIO = ['CU', 'IR', 'KP', 'SY'];
const NOMBRES_SIN_SERVICIO = [{ codigo: 'CU', nombre: 'Cuba' }, { codigo: 'IR', nombre: 'Irán' }, { codigo: 'KP', nombre: 'Corea del Norte' }, { codigo: 'SY', nombre: 'Siria' }]; // no aparecen en el selector, pero se reconocen

// Precios en dólares (mensual). Cuenta: precio en pesos ÷ dólar MEP de referencia ($1.550, 28/10/2026) × 1,30, redondeado al dólar.
//   Básico $21.000 → US$13,5 → US$17,6 → 18 · Pro $49.000 → US$31,6 → US$41,1 → 41 · Agencia $112.000 → US$72,3 → US$93,9 → 94
const DOLAR_REFERENCIA = 1550;
const RECARGO_EXTERIOR = 0.30;
const calcularUsd = (pesos) => Math.round((pesos / DOLAR_REFERENCIA) * (1 + RECARGO_EXTERIOR));
const PRECIOS_USD_MENSUALES = Object.fromEntries(Object.entries(PRECIOS_MENSUALES).map(([k, v]) => [k, calcularUsd(v)]));
const precioUsdAnual = (mensual) => Math.round(mensual * 12 * (1 - DESCUENTO_ANUAL)); // 12 meses con el mismo 20 % de descuento

function armarPlanesUsd() {
  const planes = {};
  for (const [key, mensual] of Object.entries(PRECIOS_USD_MENSUALES)) {
    planes[`${key}_mensual`] = { key, periodo: 'mensual', precio: mensual, meses: 1, moneda: 'USD' };
    planes[`${key}_anual`] = { key, periodo: 'anual', precio: precioUsdAnual(mensual), meses: 12, moneda: 'USD' };
  }
  return planes;
}

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
function normalizarPais(valor) {
  const v = sinTildes(valor);
  if (!v) return 'AR'; // sin dato (cuentas viejas): el valor por defecto de la cuenta es Argentina
  const p = PAISES.concat(NOMBRES_SIN_SERVICIO).find((x) => sinTildes(x.codigo) === v || sinTildes(x.nombre) === v);
  return p ? p.codigo : 'OTRO';
}

// ¿Qué métodos tiene esa persona? configurados = { lemon: bool, cripto: bool } (según las claves cargadas en el servidor).
function metodosParaPais(pais, configurados = {}) {
  const c = normalizarPais(pais); const arg = c === 'AR'; const bloqueado = SIN_SERVICIO.includes(c);
  const sinServicio = 'Los proveedores de pago no operan desde ese país.';
  const metodos = [
    { id: 'mercadopago', nombre: 'Mercado Pago', detalle: 'En pesos argentinos', moneda: 'ARS',
      habilitado: arg && !bloqueado, motivo: arg ? '' : 'Mercado Pago solo está disponible para pagos desde Argentina, en pesos.' },
    { id: 'tarjeta', nombre: 'Tarjeta o PayPal', detalle: 'En dólares, renovación automática', moneda: 'USD',
      habilitado: !arg && !bloqueado && !!configurados.lemon, motivo: bloqueado ? sinServicio : arg ? 'Desde Argentina se paga en pesos con Mercado Pago.' : (!configurados.lemon ? 'Todavía no está disponible.' : '') },
    { id: 'cripto', nombre: 'Cripto (USDT)', detalle: 'En dólares, un pago por período', moneda: 'USD',
      habilitado: !arg && !bloqueado && !!configurados.cripto, motivo: bloqueado ? sinServicio : arg ? 'Desde Argentina se paga en pesos con Mercado Pago.' : (!configurados.cripto ? 'Todavía no está disponible.' : '') },
  ];
  const habilitados = metodos.filter((m) => m.habilitado);
  const sugerido = arg ? 'mercadopago' : (habilitados.find((m) => m.id === 'tarjeta') || habilitados[0] || {}).id || '';
  return { pais: c, moneda: arg ? 'ARS' : 'USD', sugerido, metodos: metodos.map((m) => ({ ...m, sugerido: m.id === sugerido })) };
}

// La validación que cuenta: el servidor rechaza un método que no corresponde al país, aunque alguien salte el botón bloqueado.
function metodoPermitido(pais, metodo, configurados = {}) {
  const m = metodosParaPais(pais, configurados).metodos.find((x) => x.id === metodo);
  return m ? { ok: m.habilitado, motivo: m.motivo } : { ok: false, motivo: 'Método de pago desconocido.' };
}

module.exports = { PAISES, SIN_SERVICIO, DOLAR_REFERENCIA, RECARGO_EXTERIOR, PRECIOS_USD_MENSUALES, calcularUsd, precioUsdAnual, armarPlanesUsd, normalizarPais, metodosParaPais, metodoPermitido };
