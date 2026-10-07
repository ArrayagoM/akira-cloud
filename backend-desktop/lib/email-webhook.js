// lib/email-webhook.js
// Verifica y traduce los avisos de entrega que manda Resend (webhooks firmados con Svix).
// Funciones puras, probadas en tests/email-webhook.test.js.
'use strict';

const crypto = require('crypto');

const TOLERANCIA_S = 5 * 60; // se rechaza un aviso con más de 5 minutos de diferencia (anti-repetición)

// Firma Svix: HMAC-SHA256( `${id}.${timestamp}.${cuerpo}` ) con la clave base64 del secreto "whsec_…".
// El encabezado trae una o varias firmas separadas por espacio: "v1,<base64> v1,<base64>".
function verificarFirma({ cuerpo, id, timestamp, firma, secreto, ahora = Date.now() }) {
  if (!cuerpo || !id || !timestamp || !firma || !secreto) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(ahora / 1000) - ts) > TOLERANCIA_S) return false;
  const clave = Buffer.from(String(secreto).replace(/^whsec_/, ''), 'base64');
  const esperada = crypto.createHmac('sha256', clave).update(`${id}.${timestamp}.${cuerpo}`).digest();
  for (const par of String(firma).split(' ')) {
    const [version, valor] = par.split(',');
    if (version !== 'v1' || !valor) continue;
    let recibida; try { recibida = Buffer.from(valor, 'base64'); } catch { continue; }
    if (recibida.length === esperada.length && crypto.timingSafeEqual(recibida, esperada)) return true;
  }
  return false;
}

// "email.delivered" → { estado: 'entregado' } etc. Los eventos de apertura/clics no se usan (no se rastrean).
const ESTADOS = {
  'email.delivered': 'entregado',
  'email.bounced': 'rebotado',
  'email.complained': 'spam',
};
function estadoDeEvento(tipo) { return ESTADOS[tipo] || null; }

module.exports = { verificarFirma, estadoDeEvento, TOLERANCIA_S };
