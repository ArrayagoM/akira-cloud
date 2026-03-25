// services/bot/mercadopago.service.js
// Creación y verificación de pagos con MercadoPago.
'use strict';

const https = require('https');

function crearMPService({ accessToken, precioTurno, duracion, negocio, ngrokDomain, log }) {
  function crearPago(chatId, nombre, fecha, hora, horaFin) {
    return new Promise((res, rej) => {
      if (!accessToken) return rej(new Error('MP_ACCESS_TOKEN no configurado'));
      const webhookUrl = ngrokDomain ? `https://${ngrokDomain}/webhook-bot` : '';
      const hI   = parseInt(hora.split(':')[0]);
      const hF   = horaFin ? parseInt(horaFin.split(':')[0]) : hI + duracion;
      const cant  = Math.max(1, hF - hI);
      const total = precioTurno * cant;
      const body  = JSON.stringify({
        items: [{ title: `Turno ${fecha} ${hora} — ${negocio}`, quantity: cant, unit_price: precioTurno, currency_id: 'ARS' }],
        payer: { name: nombre },
        external_reference: `${chatId}|${fecha}|${hora}|${horaFin || hora}`,
        notification_url: webhookUrl,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to:   new Date(Date.now() + 30 * 60000).toISOString(),
      });
      const req = https.request(
        { hostname: 'api.mercadopago.com', path: '/checkout/preferences', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` } },
        (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => {
            try {
              const p = JSON.parse(d);
              if (p.init_point) res(p);
              else rej(new Error('MP sin init_point: ' + d.slice(0, 100)));
            } catch (e) { rej(e); }
          });
        }
      );
      req.on('error', rej);
      req.write(body);
      req.end();
    });
  }

  function verificarPago(paymentId) {
    return new Promise((res, rej) => {
      const req = https.request(
        { hostname: 'api.mercadopago.com', path: `/v1/payments/${paymentId}`, method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
        (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
        }
      );
      req.on('error', rej);
      req.end();
    });
  }

  return { crearPago, verificarPago };
}

module.exports = crearMPService;
