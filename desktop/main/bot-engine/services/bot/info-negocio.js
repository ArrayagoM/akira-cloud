// services/bot/info-negocio.js
// Los datos de contacto y ubicación del negocio que el bot puede dar a sus clientes (dónde están, cómo llegar, teléfono, Instagram, web),
// y la herramienta con la que el bot le avisa al dueño cuando no sabe algo. Lógica pura.
//
// Antes la dirección y el link de Google Maps solo existían para los alojamientos: una peluquería, un lavadero o un comercio no tenían
// dónde cargarlos y el bot no podía responder "¿dónde están?". Y cuando no sabía algo decía "le aviso al dueño" sin avisarle a nadie.
'use strict';

const limpio = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Normaliza lo que carga el dueño: tope de largo, sin saltos de línea (no puede romper el prompt) y links solo http(s).
function sanear(d = {}) {
  const url = (v) => { const s = limpio(v, 300); return /^https?:\/\//i.test(s) ? s : ''; };
  const ig = limpio(d.instagramNegocio ?? d.instagram, 60).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  return {
    direccion: limpio(d.direccionPropiedad ?? d.direccion, 160),
    linkUbicacion: url(d.linkUbicacion),
    telefono: limpio(d.telefonoNegocio ?? d.telefono, 40),
    instagram: /^[a-z0-9._]{1,40}$/i.test(ig) ? ig : '',
    web: url(d.webNegocio ?? d.web),
    comoLlegar: limpio(d.comoLlegar, 300),
  };
}

// Bloque para el prompt. Vacío si el dueño no cargó nada.
function bloquePrompt(d = {}, { dueno = 'el dueño' } = {}) {
  const x = sanear(d);
  const l = [];
  if (x.direccion) l.push(`📍 Dirección: ${x.direccion}`);
  if (x.linkUbicacion) l.push(`🗺️ Ubicación en Google Maps: ${x.linkUbicacion}`);
  if (x.comoLlegar) l.push(`🚗 Cómo llegar / estacionamiento: ${x.comoLlegar}`);
  if (x.telefono) l.push(`📞 Teléfono de contacto: ${x.telefono}`);
  if (x.instagram) l.push(`📷 Instagram: @${x.instagram}`);
  if (x.web) l.push(`🌐 Web: ${x.web}`);
  if (!l.length) return '';
  return `${l.join('\n')}\nSi te preguntan dónde están o cómo contactarnos, usá SOLO estos datos. No inventes ningún otro dato de contacto.\n`;
}

// Texto de la herramienta que avisa al dueño (rate limit: una vez cada `esperaMs` por cliente, para que nadie le llene el celular).
const ESPERA_AVISO_MS = 20 * 60 * 1000;
function puedeAvisar(ultimoAvisoMs, ahoraMs = Date.now(), esperaMs = ESPERA_AVISO_MS) {
  return !ultimoAvisoMs || ahoraMs - ultimoAvisoMs >= esperaMs;
}
function mensajeAlDueno({ nombre, numero, pregunta }) {
  const q = limpio(pregunta, 280);
  return `❓ *Un cliente preguntó algo que Akira no sabe*\n\nCliente: ${limpio(nombre, 60) || 'sin nombre'} (${limpio(numero, 20) || 'sin número'})\nPregunta: «${q || 'sin detalle'}»\n\nRespondele vos desde WhatsApp. Para que el bot lo sepa la próxima vez, cargalo en Akira → Conocimiento.`;
}

module.exports = { sanear, bloquePrompt, puedeAvisar, mensajeAlDueno, ESPERA_AVISO_MS };
