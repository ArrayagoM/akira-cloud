// lib/mp-seguridad.js
// Validaciones del cobro con Mercado Pago, en funciones puras (se prueban sin red ni base):
//  - idPagoValido / userIdValido: lo que llega por la URL o el cuerpo de un aviso nunca se usa tal cual.
//  - rutaMpPermitida: el helper que habla con Mercado Pago solo puede pedir las dos rutas que Akira usa.
//  - verificarFirmaMp: firma del aviso (x-signature). Por defecto NO rechaza avisos sin firma (el manifiesto nunca se
//    probó en producción: endurecer de golpe podría rechazar cobros reales); sí rechaza una firma presente y mala.
//    Con MP_WEBHOOK_FIRMA_ESTRICTA=1 un aviso sin firma válida se rechaza.
'use strict';

const crypto = require('crypto');

// Los ids de pago de Mercado Pago son numéricos.
function idPagoValido(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return false;
  return /^\d{1,20}$/.test(String(v));
}

// ObjectId de Mongo: 24 caracteres hexadecimales.
function userIdValido(v) {
  return typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
}

const RUTA_MP = /^\/(v1\/payments\/\d{1,20}|checkout\/preferences)$/;
function rutaMpPermitida(path) { return typeof path === 'string' && RUTA_MP.test(path); }

/**
 * @returns { ok, motivo, advertencia }  ok=false → responder 401. advertencia=true → seguir pero dejar aviso en el log.
 */
function verificarFirmaMp({ secreto, xSignature, xRequestId, dataId, ahora = Date.now(), estricta = false, toleranciaMs = 5 * 60 * 1000 } = {}) {
  if (!secreto) return { ok: true, motivo: 'sin-secreto', advertencia: true };
  const partes = {};
  for (const trozo of String(xSignature || '').split(',')) {
    const i = trozo.indexOf('=');
    if (i > 0) partes[trozo.slice(0, i).trim()] = trozo.slice(i + 1).trim();
  }
  const ts = partes.ts || ''; const v1 = partes.v1 || '';
  if (!v1 || !ts) return estricta ? { ok: false, motivo: 'sin-firma' } : { ok: true, motivo: 'sin-firma', advertencia: true };
  const id = /^[a-z0-9]+$/i.test(String(dataId || '')) ? String(dataId).toLowerCase() : String(dataId || '');
  const esperado = crypto.createHmac('sha256', secreto).update(`id:${id};request-id:${xRequestId || ''};ts:${ts};`).digest('hex');
  if (v1.length !== esperado.length) return { ok: false, motivo: 'firma-invalida' };
  let coincide = false;
  try { coincide = crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1)); } catch { coincide = false; }
  if (!coincide) return { ok: false, motivo: 'firma-invalida' };
  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  if (Number.isFinite(tsMs) && Math.abs(ahora - tsMs) > toleranciaMs) return { ok: true, motivo: 'ts-viejo', advertencia: true };
  return { ok: true, motivo: 'firma-ok' };
}

module.exports = { idPagoValido, userIdValido, rutaMpPermitida, verificarFirmaMp };
