// services/email.alertas.js
// Emails de alerta operativa (el bot se cayó / volvió). Son emails del sistema, no de campaña:
// el dueño tiene que enterarse aunque no esté mirando la PC ni el WhatsApp (que justamente es lo que falló).
'use strict';

const P = require('./email.plantilla');
const { escapar } = P;

function marco({ titulo, color, cuerpo }) {
  return P.marco({ titulo, pie: 'Es un aviso automático de tu cuenta de Akira Cloud.<br>Podés desactivar estas alertas desde la app.', cuerpo: `${P.etiqueta(titulo, color)}${cuerpo}` });
}

const hora = (d) => new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const cuentas = (slots) => (slots && slots.length > 1 ? `las cuentas de WhatsApp ${slots.map((s) => s + 1).join(', ')}` : 'tu WhatsApp');

function asuntoCaida() { return 'Tu bot de Akira dejó de atender'; }
function htmlCaida({ nombre, equipo, motivo, slots, desdeEn }) {
  const queHacer = motivo === 'sesion'
    ? `WhatsApp pidió volver a vincular el dispositivo. Abrí Akira en tu PC, entrá al <strong style="color:#fff">Dashboard</strong> y escaneá el QR desde WhatsApp → <strong style="color:#fff">Dispositivos vinculados</strong>.`
    : `El bot se desconectó de WhatsApp y no logró reconectarse solo. Revisá que la PC tenga internet y que Akira esté abierta (el ícono junto al reloj). Si sigue igual, abrí Akira y volvé a iniciar el bot.`;
  return marco({
    titulo: 'EL BOT NO ESTÁ ATENDIENDO', color: '#fbbf24',
    cuerpo: `
      ${P.saludo(nombre)}
      <p style="color:#bbb;margin:0 0 12px;line-height:1.6;font-size:14px">Desde las <strong style="color:#fff">${hora(desdeEn)}</strong> ${cuentas(slots)} en <strong style="color:#fff">${escapar(equipo || 'tu PC')}</strong> no está conectada, así que <strong style="color:#fff">los mensajes de tus clientes no se están respondiendo</strong>.</p>
      <p style="color:#aaa;margin:0 0 16px;line-height:1.6;font-size:14px">${queHacer}</p>
      <p style="color:#777;margin:0 0 22px;font-size:12px;line-height:1.5">Cuando vuelva a funcionar te avisamos por este mismo medio.</p>`,
  });
}

function asuntoRecuperado() { return 'Tu bot de Akira volvió a atender'; }
function htmlRecuperado({ nombre, equipo, desdeEn, hastaEn }) {
  const mins = Math.max(1, Math.round((new Date(hastaEn) - new Date(desdeEn)) / 60000));
  const dur = mins >= 120 ? `${Math.round(mins / 60)} horas` : mins >= 60 ? `1 hora y ${mins - 60} min` : `${mins} min`;
  return marco({
    titulo: 'TODO VOLVIÓ A LA NORMALIDAD', color: '#00e87b',
    cuerpo: `
      ${P.saludo(nombre)}
      <p style="color:#bbb;margin:0 0 12px;line-height:1.6;font-size:14px">Tu bot en <strong style="color:#fff">${escapar(equipo || 'tu PC')}</strong> ya está conectado y atendiendo. Estuvo sin conexión unos <strong style="color:#fff">${dur}</strong> (de ${hora(desdeEn)} a ${hora(hastaEn)}).</p>
      <p style="color:#aaa;margin:0 0 22px;line-height:1.6;font-size:13px">Los mensajes que llegaron en ese rato pueden no haber recibido respuesta: conviene revisar tus chats por las dudas.</p>`,
  });
}

module.exports = { asuntoCaida, htmlCaida, asuntoRecuperado, htmlRecuperado };
