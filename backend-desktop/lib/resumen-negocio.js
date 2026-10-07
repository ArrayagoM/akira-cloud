// lib/resumen-negocio.js
// "Ver tu negocio desde la web" (OPCIONAL, lo activa el usuario en la app): la PC manda de vez
// en cuando unos pocos NÚMEROS agregados (cuántos mensajes, turnos, cuánto entró/salió, cuánto
// te deben…). Nunca nombres, teléfonos, conversaciones ni documentos. Acá se valida que lo que
// llega sea solo eso: una lista fija de contadores numéricos, nada más.
'use strict';

const CAMPOS = ['mensajesHoy', 'turnosHoy', 'turnosMes', 'ingresosMes', 'gastosMes', 'teDeben', 'debes', 'clientes', 'documentosPendientes'];
const MAX = 1e12;

function sanearResumen(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const salida = {};
  for (const k of CAMPOS) {
    const v = Number(r[k]);
    if (r[k] !== undefined && r[k] !== null && Number.isFinite(v) && v >= 0 && v <= MAX) salida[k] = Math.round(v * 100) / 100;
  }
  if (!Object.keys(salida).length) return null;
  if (typeof r.mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.mes)) salida.mes = r.mes;
  return salida;
}

const sanearVersion = (v) => (typeof v === 'string' && /^\d{1,3}(\.\d{1,4}){1,3}$/.test(v.trim()) ? v.trim() : null);

module.exports = { sanearResumen, sanearVersion, CAMPOS };
