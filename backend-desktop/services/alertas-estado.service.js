// services/alertas-estado.service.js
// Recibe el estado del bot que informa la PC, lo guarda en el Device y avisa al dueño por EMAIL
// cuando el bot se cae y cuando vuelve (1 aviso por incidente, sin repetir). Es el canal que no
// depende del propio WhatsApp: si WhatsApp se desvincula, el bot no tiene cómo avisar por ahí.
'use strict';

const { sanearEstadoBot, evaluarEstadoBot } = require('../lib/estado-bot');
const plantillas = require('./email.alertas');

// enviar({ to, subject, html, meta }) → Promise<boolean>   (inyectable para tests)
async function procesarEstadoBot({ user, device, estadoBot, ahora = new Date(), enviar, notificarPush = null }) {
  const est = sanearEstadoBot(estadoBot);
  if (!est) return null;
  device.estadoBot = est;
  device.estadoBotEn = ahora;

  const prefs = user.alertas || {};
  const ev = evaluarEstadoBot(est, { minutosGracia: Number.isFinite(prefs.minutosGracia) ? prefs.minutosGracia : 3 });
  const previo = device.alertaBot || {};
  const quiereEmail = prefs.email !== false && !!user.email;
  const quierePush = typeof notificarPush === 'function' && prefs.push !== false;
  const meta = { tipo: 'sistema', userId: user._id };

  if (ev.caido && !previo.abierta) {
    const desdeEn = new Date(ahora.getTime() - Math.max(0, ...est.slots.filter((s) => ev.slots.includes(s.slot)).map((s) => s.desdeMs)));
    let avisadoEn = null;
    if (quiereEmail) {
      const ok = await enviar({ to: user.email, subject: plantillas.asuntoCaida(), html: plantillas.htmlCaida({ nombre: user.nombre, equipo: device.nombre, motivo: ev.motivo, slots: ev.slots, desdeEn }), meta });
      if (ok) avisadoEn = ahora;
    }
    let avisadoPush = false;
    if (quierePush) {
      const r = await notificarPush({
        titulo: '⚠️ Tu bot dejó de atender',
        cuerpo: ev.motivo === 'sesion' ? 'WhatsApp pidió vincular de nuevo: abrí Akira en tu PC y escaneá el QR.' : `${device.nombre || 'Tu PC'}: el bot se desconectó de WhatsApp y no pudo volver solo.`,
        datos: { tipo: 'caida', deviceId: device.deviceId },
      }).catch(() => null);
      avisadoPush = !!(r && r.enviados > 0);
    }
    device.alertaBot = { abierta: true, desdeEn, avisadoEn, avisadoPush };
    return { accion: 'caida', motivo: ev.motivo, avisado: !!avisadoEn, avisadoPush };
  }

  if (!ev.caido && previo.abierta) {
    device.alertaBot = { abierta: false, desdeEn: null, avisadoEn: null, avisadoPush: false };
    let avisado = false;
    if (quierePush && previo.avisadoPush && est.slots.some((s) => s.deseado && s.conectado)) {
      await notificarPush({ titulo: '✅ Tu bot volvió a atender', cuerpo: `${device.nombre || 'Tu PC'}: ya está conectado de nuevo.`, datos: { tipo: 'recuperado', deviceId: device.deviceId } }).catch(() => null);
    }
    // Solo se avisa "volvió" si antes se avisó la caída y el bot realmente está conectado
    // (si el usuario lo detuvo a propósito, el incidente se cierra en silencio).
    if (quiereEmail && previo.avisadoEn && est.slots.some((s) => s.deseado && s.conectado)) {
      avisado = !!(await enviar({ to: user.email, subject: plantillas.asuntoRecuperado(), html: plantillas.htmlRecuperado({ nombre: user.nombre, equipo: device.nombre, desdeEn: previo.desdeEn, hastaEn: ahora }), meta }));
    }
    return { accion: 'recuperado', avisado };
  }
  return { accion: null };
}

module.exports = { procesarEstadoBot };
