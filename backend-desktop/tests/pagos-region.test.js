// tests/pagos-region.test.js — qué método de pago corresponde a cada país y a qué precio. Mercado Pago solo para Argentina (pesos);
// el resto del mundo paga en dólares con un 30 % más; los países sin servicio no tienen ningún método.
'use strict';

const R = require('../lib/pagos-region');
const C = require('../lib/cobro');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

console.log('\n[pagos por región] Tests:');

// ── precios en dólares ──
const U = R.PRECIOS_USD_MENSUALES;
assert(U.basico === 18 && U.pro === 41 && U.agencia === 94, 'precios del exterior: Básico US$18, Pro US$41, Agencia US$94 por mes');
for (const k of ['basico', 'pro', 'agencia']) {
  const enUsd = C.PRECIOS_MENSUALES[k] / R.DOLAR_REFERENCIA;
  assert(U[k] >= enUsd * 1.29 - 0.5 && U[k] <= enUsd * 1.31 + 0.5, `${k}: el precio en dólares es el de pesos al dólar de referencia con ~30 % más`);
}
const P = R.armarPlanesUsd();
assert(P.pro_anual.precio === Math.round(41 * 12 * 0.8) && P.pro_anual.meses === 12 && P.pro_mensual.moneda === 'USD', 'el anual es 12 meses con 20 % de descuento, igual que en pesos');
assert(Object.keys(P).length === 6, 'seis planes (3 × mensual y anual)');

// ── país ──
assert(R.normalizarPais('Argentina') === 'AR' && R.normalizarPais('ar') === 'AR' && R.normalizarPais('') === 'AR' && R.normalizarPais(undefined) === 'AR', 'Argentina, "ar" o sin dato: Argentina');
assert(R.normalizarPais('México') === 'MX' && R.normalizarPais('mexico') === 'MX' && R.normalizarPais('PERÚ') === 'PE', 'se reconoce con o sin tildes y en mayúsculas');
assert(R.normalizarPais('Narnia') === 'OTRO' && R.normalizarPais('Otro') === 'OTRO', 'un país desconocido es "otro"');

const ambos = { lemon: true, cripto: true };
const hab = (p, cfg = ambos) => R.metodosParaPais(p, cfg).metodos.filter((m) => m.habilitado).map((m) => m.id).sort().join();

// ── Argentina ──
const ar = R.metodosParaPais('Argentina', ambos);
assert(hab('Argentina') === 'mercadopago' && ar.sugerido === 'mercadopago' && ar.moneda === 'ARS', 'Argentina: Mercado Pago en pesos, y es lo sugerido');
assert(ar.metodos.find((m) => m.id === 'tarjeta').habilitado === false && /pesos con Mercado Pago/.test(ar.metodos.find((m) => m.id === 'tarjeta').motivo), 'Argentina: tarjeta del exterior bloqueada y explica por qué');

// ── Chile, Venezuela, México: sin Mercado Pago ──
for (const p of ['Chile', 'Venezuela', 'México']) {
  const r = R.metodosParaPais(p, ambos);
  assert(r.metodos.find((m) => m.id === 'mercadopago').habilitado === false && /solo está disponible para pagos desde Argentina/.test(r.metodos.find((m) => m.id === 'mercadopago').motivo), `${p}: Mercado Pago BLOQUEADO con su motivo`);
  assert(hab(p) === 'cripto,tarjeta' && r.moneda === 'USD' && r.sugerido === 'tarjeta', `${p}: tarjeta y cripto en dólares; sugerida la tarjeta`);
}

// ── lo que todavía no está configurado queda bloqueado ──
assert(hab('Chile', { lemon: false, cripto: true }) === 'cripto' && R.metodosParaPais('Chile', { lemon: false, cripto: true }).sugerido === 'cripto', 'sin Lemon Squeezy configurado: solo cripto, y la sugerida pasa a cripto');
assert(hab('Chile', {}) === '' && R.metodosParaPais('Chile', {}).sugerido === '', 'sin ningún proveedor configurado del exterior: nada habilitado');
assert(R.metodosParaPais('Chile', { lemon: false }).metodos.find((m) => m.id === 'tarjeta').motivo === 'Todavía no está disponible.', 'el motivo de lo no configurado es claro');

// ── países sin servicio ──
assert(R.normalizarPais('Cuba') === 'CU' && R.normalizarPais('Irán') === 'IR' && R.normalizarPais('siria') === 'SY' && R.normalizarPais('Corea del Norte') === 'KP', 'los países sin servicio se reconocen por nombre aunque no estén en el selector');
assert(!R.PAISES.some((p) => R.SIN_SERVICIO.includes(p.codigo)), 'y no aparecen en la lista que se le muestra a la persona');
assert(hab('CU') === '' && hab('IR') === '' && hab('KP') === '' && hab('SY') === '', 'países sancionados: ningún método (ni cripto)');

// ── el servidor decide, no el botón ──
assert(R.metodoPermitido('Chile', 'mercadopago', ambos).ok === false, 'servidor: Chile no puede armar un pago con Mercado Pago');
assert(R.metodoPermitido('Argentina', 'cripto', ambos).ok === false && R.metodoPermitido('Argentina', 'mercadopago', ambos).ok === true, 'servidor: Argentina sí con Mercado Pago y no con cripto');
assert(R.metodoPermitido('Chile', 'bitcoin-gratis', ambos).ok === false && R.metodoPermitido('Chile', undefined, ambos).ok === false, 'servidor: un método inventado se rechaza');

console.log('\n✅ Todos los tests de pagos por región pasaron.\n');
