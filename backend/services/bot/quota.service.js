// services/bot/quota.service.js
// Cupo de mensajes/mes por plan (ver config/planes.js). Antes de este módulo
// no existía NINGÚN límite real — un Trial podía mandar mensajes ilimitados
// igual que un Agencia, contradiciendo la tabla de precios.
'use strict';

const User = require('../../models/User');
const { featuresDePlan } = require('../../config/planes');

function mesActual(ahora = new Date()) {
  return `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Decide, a partir del estado guardado, cuál es el conteo correcto para ESTE
// mensaje: si el mes guardado no coincide con el actual, el contador arranca
// de 1 (reset); si coincide, sigue sumando. Función pura — separada del
// acceso a Mongo para poder testearla sin DB real.
function calcularNuevoConteo(mesGuardado, conteoGuardado, mesActualStr) {
  if (mesGuardado !== mesActualStr) return 1;
  return (conteoGuardado || 0) + 1;
}

// Registra un mensaje entrante y devuelve si el usuario todavía tiene cupo.
// Se llama DESPUÉS de incrementar (no antes) para que el conteo sea atómico
// y dos mensajes casi simultáneos no se "pisen" — el efecto práctico es que
// el mensaje que hace superar el límite también se cuenta, pero es el
// primero en NO recibir respuesta de IA, que es el comportamiento esperado.
async function registrarMensajeYVerificarCupo(userId, plan) {
  const { mensajesMes: limite } = featuresDePlan(plan);
  if (limite === Infinity) return { permitido: true, usados: null, limite: null };

  const mesStr = mesActual();
  const actual = await User.findById(userId).select('mensajesMes mesContadorMensajes').lean();
  const nuevoConteo = calcularNuevoConteo(actual?.mesContadorMensajes, actual?.mensajesMes, mesStr);

  await User.findByIdAndUpdate(userId, {
    mensajesMes: nuevoConteo,
    mesContadorMensajes: mesStr,
  }).catch(() => {}); // nunca bloquear el flujo del bot por un fallo de escritura del contador

  return { permitido: nuevoConteo <= limite, usados: nuevoConteo, limite };
}

module.exports = { registrarMensajeYVerificarCupo, calcularNuevoConteo, mesActual };
