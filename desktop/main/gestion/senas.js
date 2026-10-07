// gestion/senas.js
// Seña por servicio: en vez de cobrar todo por MercadoPago, un servicio puede pedir solo una parte (30 %, o un monto fijo) para reservar;
// el resto se abona en el local. Sin configuración se cobra el total (el comportamiento de siempre).
// servicio.sena = { tipo: 'porcentaje' | 'monto', valor: number }. Probado en tests/senas.test.js.
'use strict';

const redondear = (n) => Math.round(Number(n) || 0);

// Limpia lo que llega de la pantalla. → { tipo, valor } | null (null = cobrar el total)
function sanear(s, precio) {
  if (!s || typeof s !== 'object') return null;
  const valor = Number(String(s.valor ?? '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return null;
  if (s.tipo === 'porcentaje') return valor >= 100 ? null : { tipo: 'porcentaje', valor: Math.max(1, Math.min(99, Math.round(valor))) };
  if (s.tipo === 'monto') { const v = Math.round(valor); return v < 1 || (precio > 0 && v >= precio) ? null : { tipo: 'monto', valor: v }; }
  return null;
}

// → { cobrar, total, saldo, esSena }. Mercado Pago cobra importes enteros: la seña se redondea al peso.
function calcular(servicio, precioTotal) {
  const total = redondear(precioTotal);
  const s = sanear(servicio?.sena, total);
  if (!s || !(total > 0)) return { cobrar: total, total, saldo: 0, esSena: false };
  const cobrar = s.tipo === 'porcentaje' ? redondear((total * s.valor) / 100) : Math.min(total, s.valor);
  if (!(cobrar > 0) || cobrar >= total) return { cobrar: total, total, saldo: 0, esSena: false };
  return { cobrar, total, saldo: total - cobrar, esSena: true, tipo: s.tipo, valor: s.valor };
}

const textoSena = (c) => (c.esSena ? ` (es una seña: el resto, $${c.saldo}, se abona en el local)` : '');

module.exports = { sanear, calcular, textoSena };
