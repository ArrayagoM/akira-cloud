// main/estado-bot.js
// Qué estado reporta esta PC a la nube sobre el bot (ver backend-desktop/lib/estado-bot.js, que lo valida
// y decide si hay una caída). Solo booleanos y números: nada de mensajes, nombres ni teléfonos.
//
// "deseado": el usuario quiere esa cuenta activa Y ya había vinculado WhatsApp (hay sesión guardada o ya se
// conectó alguna vez). Una cuenta que todavía espera su primer QR NO es una caída: no se alerta.
'use strict';

function construirEstado({ deseados, activos, conectados, sesionExpirada, huboConexion, desde, tieneSesion, pausado = false, ahora = Date.now() }) {
  const slots = [...new Set([...deseados, ...activos])].sort((a, b) => a - b).map((slot) => {
    const conectado = conectados.has(slot);
    const t = desde.get(slot);
    return {
      slot,
      deseado: deseados.has(slot) && (huboConexion.has(slot) || tieneSesion(slot)),
      activo: activos.has(slot),
      conectado,
      requiereQR: sesionExpirada.has(slot),
      desdeMs: conectado || !t ? 0 : Math.max(0, ahora - t),
    };
  });
  return { slots, pausado: pausado === true };
}

module.exports = { construirEstado };
