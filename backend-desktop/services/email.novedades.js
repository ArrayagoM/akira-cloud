// services/email.novedades.js
// Email de novedades para los usuarios registrados: avisa que el software de
// escritorio ya se puede descargar y qué viene después. Mismo estilo que los
// demás emails de la plataforma (services/email.service.js).
'use strict';

const jwt = require('jsonwebtoken');

// Edite esta lista antes de cada envío: es lo que se promete en el email.
const PROXIMAMENTE = [
  ['📅', 'Conectar Google Calendar desde la app', 'Vincular tu calendario con un clic, sin pasos técnicos.'],
  ['🔄', 'Mejoras cada semana', 'La app se actualiza sola: sin volver a descargar nada.'],
  ['🐧', 'Versión para Linux', 'Para quienes trabajan con Linux.'],
];

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function urlBaja(userId) {
  // Token firmado, sin vencimiento: la baja debe funcionar aunque el email sea viejo.
  const t = jwt.sign({ id: String(userId), p: 'baja-novedades' }, process.env.JWT_SECRET);
  return `${(process.env.FRONTEND_URL || 'https://akiracloud.lat').replace(/\/+$/, '')}/api/auth/baja-novedades?t=${encodeURIComponent(t)}`;
}

function asuntoNovedades() {
  return '🤖 Akira ya se instala en tu PC — descargalo en 3 minutos';
}

function htmlNovedades({ nombre, userId, urlDescarga, version }) {
  const front = (process.env.FRONTEND_URL || 'https://akiracloud.lat').replace(/\/+$/, '');
  const descarga = urlDescarga || `${front}/api/desktop/download`;
  const guia = `${front}/descargar`;
  const baja = userId ? urlBaja(userId) : '#';

  const filaProximo = ([ico, titulo, texto]) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;width:34px;font-size:20px">${ico}</td>
      <td style="padding:10px 0;vertical-align:top">
        <div style="color:#fff;font-size:14px;font-weight:600">${escapar(titulo)}</div>
        <div style="color:#888;font-size:13px;margin-top:2px">${escapar(texto)}</div>
      </td>
    </tr>`;

  const paso = (n, titulo, texto) => `
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:34px">
        <div style="width:24px;height:24px;border-radius:50%;background:#0f2a1c;color:#00e87b;font-weight:700;font-size:13px;text-align:center;line-height:24px">${n}</div>
      </td>
      <td style="padding:8px 0;vertical-align:top">
        <div style="color:#fff;font-size:14px;font-weight:600">${titulo}</div>
        <div style="color:#888;font-size:13px;margin-top:2px">${texto}</div>
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Akira Cloud</title></head>
<body style="margin:0;padding:24px 12px;background:#050505">
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
    <div style="background:#00e87b;padding:24px;text-align:center">
      <h1 style="margin:0;color:#000;font-size:22px">🤖 Akira Cloud</h1>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 8px;color:#fff;font-size:20px">Hola, ${escapar(nombre || '')} 👋</h2>
      <p style="color:#aaa;margin:0 0 20px;line-height:1.55">
        Tenemos una novedad importante: <strong style="color:#fff">Akira ya se instala en tu computadora</strong>.
        Tu bot de WhatsApp corre en tu PC, y tus conversaciones quedan con vos.
      </p>
      <div style="margin:0 0 20px;padding:14px 16px;background:#101010;border:1px solid #1f2a24;border-left:3px solid #00e87b;border-radius:8px">
        <p style="margin:0;color:#bbb;font-size:13px;line-height:1.6">
          Sabemos que en estos días hubo fallos y demoras, y te pedimos disculpas: no es la experiencia que queremos darte.
          Seguimos trabajando todos los días y se vienen mejoras importantes. <strong style="color:#fff">Quedate cerca, no te las querés perder.</strong>
        </p>
      </div>

      <div style="text-align:center;margin:26px 0">
        <a href="${descarga}" style="display:inline-block;background:#00e87b;color:#000;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:16px">
          ⬇ Descargar Akira para Windows
        </a>
        <div style="color:#666;font-size:12px;margin-top:10px">${version ? `Versión ${escapar(version)} · ` : ''}Windows 10 y 11 · ~85 MB</div>
      </div>

      <h3 style="color:#fff;font-size:15px;margin:28px 0 4px">Listo en 3 pasos</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${paso(1, 'Instalalo', 'Abrí el archivo y esperá a que termine. No hay que configurar nada.')}
        ${paso(2, 'Ingresá con tu cuenta', 'Tocá “Continuar con Google” con la misma cuenta de siempre. Tus datos se cargan solos.')}
        ${paso(3, 'Escaneá el QR', 'Tocá “Iniciar bot” y vinculá tu WhatsApp desde el celular. ¡Listo!')}
      </table>
      <p style="color:#666;font-size:12px;margin:12px 0 0;line-height:1.5">
        Si Windows muestra “Windows protegió su PC”, tocá <em>Más información → Ejecutar de todos modos</em>: es normal en las apps nuevas.
        Guía completa: <a href="${guia}" style="color:#00e87b">${guia.replace(/^https?:\/\//, '')}</a>
      </p>

      <h3 style="color:#fff;font-size:15px;margin:30px 0 2px">Lo que viene 🚀</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${PROXIMAMENTE.map(filaProximo).join('')}
      </table>

      <p style="color:#aaa;margin:26px 0 0;line-height:1.55">¿Dudas o algo no te funciona? Respondé este email y te ayudamos.</p>
    </div>
    <div style="border-top:1px solid #1a1a1a;padding:16px 32px;text-align:center">
      <p style="color:#555;font-size:11px;margin:0;line-height:1.6">
        Recibís este email porque tenés una cuenta en Akira Cloud.<br>
        <a href="${baja}" style="color:#777">Dejar de recibir novedades</a>
      </p>
    </div>
  </div>
</body></html>`;
}

module.exports = { htmlNovedades, asuntoNovedades, urlBaja, PROXIMAMENTE };
