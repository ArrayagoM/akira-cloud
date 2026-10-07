// services/bot/ausencias.service.js
// Ausencias: turnos que el cliente no cumplió ("no vino"). Quien falta seguido tiene que abonar por adelantado.
// El dueño marca "no vino" en la ficha del cliente (el turno sigue contando como cobrado si había seña).
'use strict';

const UMBRAL_AUSENCIAS = 2; // a partir de acá el bot pide el pago por adelantado

const ultimos8 = (tel) => String(tel || '').replace(/\D/g, '').slice(-8);

// ¿Cuántas veces faltó? turnos: lista de { clienteTelefono, ausente }
function contar(turnos, telefono) {
  const t8 = ultimos8(telefono);
  if (t8.length < 8) return 0;
  return (turnos || []).filter((t) => t.ausente === true && ultimos8(t.clienteTelefono) === t8).length;
}

// Línea para el prompt del bot. Solo si el negocio tiene cómo cobrar por adelantado.
function notaAusencias(n, { puedeCobrarAdelantado }) {
  if (n < UMBRAL_AUSENCIAS || !puedeCobrarAdelantado) return '';
  return `⚠️ AUSENCIAS: este cliente faltó ${n} turnos sin avisar. Antes de confirmar un turno nuevo, explicale con amabilidad y sin reproches que, por las ausencias anteriores, el turno se reserva abonándolo por adelantado (seña), y no lo des por confirmado hasta que pague.\n`;
}

module.exports = { UMBRAL_AUSENCIAS, contar, notaAusencias, ultimos8 };
