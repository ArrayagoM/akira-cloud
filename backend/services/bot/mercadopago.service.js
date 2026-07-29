// services/bot/mercadopago.service.js
// Creación y verificación de pagos con MercadoPago.
'use strict';

const https = require('https');

// MercadoPago AR exige ISO 8601 con offset explícito (-03:00) en los campos
// expiration_date_*. Si se manda con sufijo "Z" (UTC), MP a veces interpreta
// la hora como local-Argentina, lo que hace que la preferencia parezca "aún
// no válida" cuando el cliente abre el link → el botón "Pagar" aparece en
// GRIS y no permite continuar. Este helper genera el formato correcto.
function toMPDateAR(date) {
  const ms  = date.getTime() - 3 * 60 * 60 * 1000; // shift a hora AR
  const d   = new Date(ms);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
         `.${pad(d.getUTCMilliseconds(), 3)}-03:00`;
}

function crearMPService({ accessToken, precioTurno, duracion, negocio, backendUrl, userId, log }) {
  // opciones.montoTotal: cuando el precio NO se calcula por horas (servicios con
  // precio propio, alojamiento por noches), el llamador ya calculó el total real
  // y lo pasa acá explícito — se cobra ESE monto tal cual, sin recalcular a
  // partir de hora/horaFin. Sin opciones.montoTotal el comportamiento es
  // exactamente el de antes (turnos por hora), byte a byte.
  function crearPago(chatId, nombre, fecha, hora, horaFin, opciones = {}) {
    return new Promise((res, rej) => {
      if (!accessToken) return rej(new Error('MP_ACCESS_TOKEN no configurado'));
      // El webhook va al backend público (Render). Sin ngrok.
      // bot.routes.js maneja /api/bot/webhook-mp/:userId y enruta al bot.engine
      // del usuario via bot.manager.procesarWebhookMP().
      const webhookUrl = backendUrl && userId
        ? `${String(backendUrl).replace(/\/$/, '')}/api/bot/webhook-mp/${userId}`
        : '';
      let cant, unitPrice, tituloItem;
      if (opciones.montoTotal != null) {
        cant = 1;
        unitPrice = opciones.montoTotal;
        tituloItem = opciones.titulo || `${negocio} — ${fecha} ${hora}`;
      } else {
        const hI = parseInt(hora.split(':')[0]);
        const hF = horaFin ? parseInt(horaFin.split(':')[0]) : hI + duracion;
        cant = Math.max(1, hF - hI);
        unitPrice = precioTurno;
        tituloItem = `Turno ${fecha} ${hora} — ${negocio}`;
      }
      const total = unitPrice * cant;
      const body  = JSON.stringify({
        items: [{ title: tituloItem, quantity: cant, unit_price: unitPrice, currency_id: 'ARS' }],
        payer: { name: nombre },
        external_reference: `${chatId}|${fecha}|${hora}|${horaFin || hora}`,
        notification_url: webhookUrl,
        expires: true,
        // expiration_date_from omitido: si se setea = ahora, MP a veces lo
        // considera como aún-futuro por desincronización de relojes y deja el
        // botón "Pagar" en gris. Sin este campo MP defaultea a "ahora" y la
        // preferencia es válida desde el momento en que el cliente abre el link.
        expiration_date_to: toMPDateAR(new Date(Date.now() + 30 * 60000)),
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
