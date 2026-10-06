// license/offline-grace.js
// Sin internet, la app sigue operando con el último estado de licencia
// conocido hasta una ventana de gracia corta — evita que un corte de
// luz/internet de un rato le impida al negocio seguir atendiendo clientes
// por WhatsApp, sin abrir la puerta a "desconectar internet para siempre y
// usar gratis": pasada la gracia, el bot deja de procesar mensajes nuevos
// (no borra nada) hasta poder revalidar.
'use strict';

const fs = require('fs');
const path = require('path');

const GRACE_HOURS = parseFloat(process.env.LICENSE_GRACE_HOURS || '72');

function archivoEstado(userDataDir) {
  return path.join(userDataDir, 'license-cache.json');
}

function guardar(userDataDir, estado) {
  try {
    fs.writeFileSync(
      archivoEstado(userDataDir),
      JSON.stringify({ ...estado, guardadoEn: Date.now() }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.error('[offline-grace] No se pudo guardar el cache de licencia:', err.message);
  }
}

function leer(userDataDir) {
  try {
    const raw = fs.readFileSync(archivoEstado(userDataDir), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Devuelve { puedeOperar, motivo, dentroDeGracia } — la decisión final de
// si el bot-engine puede arrancar/seguir procesando mensajes.
function evaluar(userDataDir) {
  const cache = leer(userDataDir);
  if (!cache) return { puedeOperar: false, motivo: 'sin_licencia_previa' };

  if (cache.vigente === false) {
    return { puedeOperar: false, motivo: 'suscripcion_vencida' };
  }

  const horasDesdeGuardado = (Date.now() - (cache.guardadoEn || 0)) / 3_600_000;
  if (horasDesdeGuardado <= GRACE_HOURS) {
    return { puedeOperar: true, motivo: 'cache_vigente', dentroDeGracia: horasDesdeGuardado > 0.1 };
  }
  return { puedeOperar: false, motivo: 'gracia_offline_agotada', horasSinRevalidar: horasDesdeGuardado };
}

module.exports = { guardar, leer, evaluar, GRACE_HOURS };
