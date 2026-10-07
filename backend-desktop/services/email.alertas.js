// services/email.alertas.js
// Emails de alerta operativa (el bot se cayó / volvió). Son emails del sistema, no de campaña:
// el dueño tiene que enterarse aunque no esté mirando la PC ni el WhatsApp (que justamente es lo que falló).
'use strict';

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const front = () => (process.env.FRONTEND_URL || 'https://akiracloud.lat').replace(/\/+$/, '');

function marco({ titulo, color, cuerpo }) {
  const logo = `${front()}/logo-email.png`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:24px 12px;background:#050505">
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
    <div style="background:#00e87b;padding:16px 26px">
      <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
        <td style="vertical-align:middle;padding-right:10px"><img src="${logo}" width="32" height="32" alt="Akira" style="display:block;border-radius:8px;border:0"></td>
        <td style="vertical-align:middle"><span style="color:#000;font-size:17px;font-weight:700">Akira Cloud</span></td>
      </tr></table>
    </div>
    <div style="padding:26px 28px 10px">
      <div style="display:inline-block;background:${color}22;border:1px solid ${color}66;color:${color};font-size:12px;font-weight:700;letter-spacing:.4px;padding:4px 10px;border-radius:999px">${escapar(titulo)}</div>
      ${cuerpo}
    </div>
    <div style="border-top:1px solid #1a1a1a;padding:14px 28px;text-align:center">
      <p style="color:#555;font-size:11px;margin:0;line-height:1.6">Es un aviso automático de tu cuenta de Akira Cloud.<br>Podés desactivar estas alertas desde la app.</p>
    </div>
  </div>
</body></html>`;
}

const hora = (d) => new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const cuentas = (slots) => (slots && slots.length > 1 ? `las cuentas de WhatsApp ${slots.map((s) => s + 1).join(', ')}` : 'tu WhatsApp');

function asuntoCaida() { return '⚠️ Tu bot de Akira dejó de atender'; }
function htmlCaida({ nombre, equipo, motivo, slots, desdeEn }) {
  const queHacer = motivo === 'sesion'
    ? `WhatsApp pidió volver a vincular el dispositivo. Abrí Akira en tu PC, entrá a <strong style="color:#fff">Inicio</strong> y escaneá el QR desde WhatsApp → <strong style="color:#fff">Dispositivos vinculados</strong>.`
    : `El bot se desconectó de WhatsApp y no logró reconectarse solo. Revisá que la PC tenga internet y que Akira esté abierta (el ícono junto al reloj). Si sigue igual, abrí Akira y volvé a iniciar el bot.`;
  return marco({
    titulo: 'EL BOT NO ESTÁ ATENDIENDO', color: '#fbbf24',
    cuerpo: `
      <h2 style="margin:16px 0 8px;color:#fff;font-size:18px;font-weight:600">Hola, ${escapar(nombre || '')}</h2>
      <p style="color:#bbb;margin:0 0 12px;line-height:1.6;font-size:14px">Desde las <strong style="color:#fff">${hora(desdeEn)}</strong> ${cuentas(slots)} en <strong style="color:#fff">${escapar(equipo || 'tu PC')}</strong> no está conectada, así que <strong style="color:#fff">los mensajes de tus clientes no se están respondiendo</strong>.</p>
      <p style="color:#aaa;margin:0 0 16px;line-height:1.6;font-size:14px">${queHacer}</p>
      <p style="color:#777;margin:0 0 22px;font-size:12px;line-height:1.5">Cuando vuelva a funcionar te avisamos por este mismo medio.</p>`,
  });
}

function asuntoRecuperado() { return '✅ Tu bot de Akira volvió a atender'; }
function htmlRecuperado({ nombre, equipo, desdeEn, hastaEn }) {
  const mins = Math.max(1, Math.round((new Date(hastaEn) - new Date(desdeEn)) / 60000));
  const dur = mins >= 120 ? `${Math.round(mins / 60)} horas` : mins >= 60 ? `1 hora y ${mins - 60} min` : `${mins} min`;
  return marco({
    titulo: 'TODO VOLVIÓ A LA NORMALIDAD', color: '#00e87b',
    cuerpo: `
      <h2 style="margin:16px 0 8px;color:#fff;font-size:18px;font-weight:600">Hola, ${escapar(nombre || '')}</h2>
      <p style="color:#bbb;margin:0 0 12px;line-height:1.6;font-size:14px">Tu bot en <strong style="color:#fff">${escapar(equipo || 'tu PC')}</strong> ya está conectado y atendiendo. Estuvo sin conexión unos <strong style="color:#fff">${dur}</strong> (de ${hora(desdeEn)} a ${hora(hastaEn)}).</p>
      <p style="color:#aaa;margin:0 0 22px;line-height:1.6;font-size:13px">Los mensajes que llegaron en ese rato pueden no haber recibido respuesta: conviene revisar tus chats por las dudas.</p>`,
  });
}

module.exports = { asuntoCaida, htmlCaida, asuntoRecuperado, htmlRecuperado };
