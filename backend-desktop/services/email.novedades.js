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

// ─────────────────────────────────────────────────────────────
// Campaña "actualización": novedades de gestión del negocio (octubre 2026).
// Mismo marco visual que el aviso de descarga, con el logo real y sin emojis.
// ─────────────────────────────────────────────────────────────
const NOVEDADES_GESTION = [
  ['Catálogo con importación', 'Cargá tus productos y servicios a mano o importalos desde Excel, CSV, PDF o una foto de tu lista de precios. Tu bot los usa al instante para cotizar y agendar.'],
  ['Caja', 'Ingresos, gastos y resultado de cada mes en una sola pantalla. Los turnos cobrados suman solos y podés exportar todo a Excel o PDF para tu contador.'],
  ['Deudores', 'Quién te debe y desde hace cuánto. Registrá pagos a cuenta y enviá recordatorios por WhatsApp: siempre los revisás y confirmás vos antes de que se envíen.'],
  ['Proveedores', 'Llevá la cuenta de tus compras a crédito y pagos, y cuánto le comprás a cada proveedor por mes.'],
  ['Documentos', 'Los comprobantes y facturas que te mandan tus clientes por WhatsApp se guardan en tu PC. El bot confirma la recepción y vos los registrás en la Caja con un clic.'],
  ['Actualización en un clic y mayor estabilidad', 'La app avisa cuando hay una versión nueva y se actualiza desde el mismo aviso. Además, mejoramos la velocidad y la estabilidad de las respuestas del bot.'],
];
const EN_CAMINO = [
  ['Reportes', 'Servicios más pedidos, clientes frecuentes y ausencias.'],
  ['Importar clientes desde Excel', 'Para traer tu agenda de contactos de una sola vez.'],
  ['Instalador con firma digital', 'Para que Windows no muestre el aviso de “editor desconocido”.'],
  ['Versión para Linux', 'Para quienes trabajan con ese sistema.'],
];

function asuntoActualizacion() {
  return 'Novedades de Akira: Caja, Deudores, Proveedores y más';
}

function htmlActualizacion({ nombre, userId, urlDescarga, version }) {
  const front = (process.env.FRONTEND_URL || 'https://akiracloud.lat').replace(/\/+$/, '');
  const descarga = urlDescarga || `${front}/api/desktop/download`;
  const guia = `${front}/descargar`;
  const baja = userId ? urlBaja(userId) : '#';
  const logo = `${front}/logo-email.png`;

  const fila = ([titulo, texto]) => `
    <tr>
      <td style="padding:11px 0 11px 14px;border-left:2px solid #00e87b;vertical-align:top">
        <div style="color:#fff;font-size:14px;font-weight:600">${escapar(titulo)}</div>
        <div style="color:#999;font-size:13px;margin-top:3px;line-height:1.5">${escapar(texto)}</div>
      </td>
    </tr>
    <tr><td style="height:2px;line-height:2px;font-size:0">&nbsp;</td></tr>`;
  const filaCamino = ([titulo, texto]) => `
    <tr>
      <td style="padding:7px 0;vertical-align:top">
        <span style="color:#ddd;font-size:13px;font-weight:600">${escapar(titulo)}</span>
        <span style="color:#777;font-size:13px"> — ${escapar(texto)}</span>
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Novedades de Akira</title></head>
<body style="margin:0;padding:24px 12px;background:#050505">
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
    <div style="background:#00e87b;padding:20px 28px">
      <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
        <td style="vertical-align:middle;padding-right:12px"><img src="${logo}" width="40" height="40" alt="Akira" style="display:block;border-radius:10px;border:0"></td>
        <td style="vertical-align:middle"><span style="color:#000;font-size:20px;font-weight:700;letter-spacing:-0.2px">Akira Cloud</span></td>
      </tr></table>
    </div>
    <div style="padding:30px 30px 8px">
      <h2 style="margin:0 0 10px;color:#fff;font-size:19px;font-weight:600">Hola, ${escapar(nombre || '')}</h2>
      <p style="color:#aaa;margin:0 0 6px;line-height:1.6;font-size:14px">
        Seguimos mejorando Akira. Sumamos herramientas para llevar la gestión de tu negocio desde el mismo programa donde atiende tu bot.
        Esto es lo nuevo en la versión ${escapar(version || '')}:
      </p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0 4px">
        ${NOVEDADES_GESTION.map(fila).join('')}
      </table>

      <div style="margin:20px 0 6px;padding:13px 15px;background:#101010;border:1px solid #1f1f1f;border-radius:8px">
        <p style="margin:0;color:#aaa;font-size:13px;line-height:1.55"><strong style="color:#fff">Tus datos siguen siendo tuyos.</strong> La información de gestión (clientes, caja, deudas, proveedores y documentos) se guarda en tu propia computadora y no pasa por nuestros servidores.</p>
      </div>

      <h3 style="color:#fff;font-size:15px;margin:28px 0 6px">Cómo actualizar</h3>
      <p style="color:#aaa;margin:0 0 14px;line-height:1.6;font-size:13px">
        Si ya tenés Akira instalada, <strong style="color:#ddd">se actualiza sola</strong>: vas a ver un aviso dentro de la app para reiniciar con la versión nueva (o tocá “Buscar actualización” en el menú lateral).
        Si todavía no la instalaste, podés descargarla acá:
      </p>
      <div style="text-align:center;margin:18px 0 8px">
        <a href="${descarga}" style="display:inline-block;background:#00e87b;color:#000;font-weight:700;padding:13px 30px;border-radius:9px;text-decoration:none;font-size:15px">Descargar Akira para Windows</a>
        <div style="color:#666;font-size:12px;margin-top:9px">${version ? `Versión ${escapar(version)} · ` : ''}Windows 10 y 11 · ~89 MB · <a href="${guia}" style="color:#00e87b;text-decoration:none">guía de instalación</a></div>
      </div>

      <h3 style="color:#fff;font-size:15px;margin:30px 0 4px">En camino</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${EN_CAMINO.map(filaCamino).join('')}
      </table>

      <p style="color:#aaa;margin:26px 0 0;line-height:1.6;font-size:13px">¿Dudas o sugerencias? Respondé este email y las vemos. Gracias por acompañarnos.</p>
      <p style="color:#888;margin:14px 0 22px;font-size:13px">El equipo de Akira</p>
    </div>
    <div style="border-top:1px solid #1a1a1a;padding:16px 30px;text-align:center">
      <p style="color:#555;font-size:11px;margin:0;line-height:1.6">
        Recibís este email porque tenés una cuenta en Akira Cloud.<br>
        <a href="${baja}" style="color:#777">Dejar de recibir novedades</a>
      </p>
    </div>
  </div>
</body></html>`;
}

// Campañas de email disponibles. La clave se guarda en cada usuario (novedadesEnviadas)
// para no repetir el envío. Para una campaña nueva: agregar una entrada acá.
const CAMPANAS = {
  'instalador-1.0.0': { asunto: asuntoNovedades, html: htmlNovedades },
  'actualizacion-2026-10': { asunto: asuntoActualizacion, html: htmlActualizacion },
};

module.exports = { htmlNovedades, asuntoNovedades, htmlActualizacion, asuntoActualizacion, CAMPANAS, urlBaja, PROXIMAMENTE };
