// lib/estado-bot.js
// Estado del bot que informa la app de escritorio en cada señal de vida: por cada cuenta de WhatsApp
// (slot) si el usuario la quiere activa, si lo está, si está conectada y cuánto hace que no lo está.
// Solo booleanos y números: nada de mensajes, nombres ni teléfonos. Acá se valida que llegue solo eso
// y se decide si hay una "caída" que merezca avisar al dueño por un canal que no sea el propio WhatsApp.
'use strict';

const MAX_SLOTS = 10;
const MAX_DESDE_MS = 7 * 24 * 3600 * 1000;

function sanearEstadoBot(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.slots)) return null;
  const slots = [];
  for (const s of raw.slots.slice(0, MAX_SLOTS)) {
    if (!s || typeof s !== 'object') continue;
    const slot = Number(s.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) continue;
    const desde = Number(s.desdeMs);
    slots.push({
      slot,
      deseado: s.deseado === true,
      activo: s.activo === true,
      conectado: s.conectado === true,
      requiereQR: s.requiereQR === true,
      desdeMs: Number.isFinite(desde) && desde > 0 ? Math.min(Math.round(desde), MAX_DESDE_MS) : 0,
    });
  }
  return { slots, pausado: raw.pausado === true, vacaciones: raw.vacaciones === true };
}

// Una cuenta está "caída" si el usuario la quiere activa y no está conectada, y además: pide un QR nuevo
// (hay que intervenir ya) o lleva desconectada más que la gracia (el bot suele reconectarse solo en segundos).
function evaluarEstadoBot(estado, { minutosGracia = 3 } = {}) {
  const caidos = [];
  let porSesion = false;
  for (const s of estado?.slots || []) {
    if (!s.deseado || s.conectado || estado.pausado) continue;
    if (s.requiereQR) { caidos.push(s.slot); porSesion = true; }
    else if (s.desdeMs >= minutosGracia * 60 * 1000) caidos.push(s.slot);
  }
  return { caido: caidos.length > 0, slots: caidos, motivo: caidos.length ? (porSesion ? 'sesion' : 'desconexion') : null };
}

module.exports = { sanearEstadoBot, evaluarEstadoBot };
