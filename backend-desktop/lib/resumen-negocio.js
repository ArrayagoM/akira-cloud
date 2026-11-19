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

// ── Qué números quiere VER cada usuario ──────────────────────────────────────────────────────────────────────
// La PC manda todos los contadores permitidos (los que el usuario aceptó al activar "Ver tu negocio desde el celular"); cada usuario
// elige cuáles se le MUESTRAN en la web, en la app del celular y en el .apk. El filtro se aplica acá, al responder, así que sirve
// igual para las versiones ya instaladas. Sin elección guardada (undefined) se muestra todo, como siempre.
const GRUPOS = {
  mensajes:   { etiqueta: 'Mensajes de hoy', campos: ['mensajesHoy'] },
  turnos:     { etiqueta: 'Turnos de hoy y del mes', campos: ['turnosHoy', 'turnosMes'] },
  caja:       { etiqueta: 'Caja: ingresos, gastos y resultado del mes', campos: ['ingresosMes', 'gastosMes'] },
  deudas:     { etiqueta: 'Lo que te deben y lo que debés', campos: ['teDeben', 'debes'] },
  clientes:   { etiqueta: 'Cantidad de clientes', campos: ['clientes'] },
  documentos: { etiqueta: 'Documentos sin revisar', campos: ['documentosPendientes'] },
};
const IDS_GRUPOS = Object.keys(GRUPOS);

// Devuelve la lista limpia (solo grupos que existen, sin repetidos, en el orden de siempre) o null si no es una lista válida.
function sanearGrupos(g) {
  if (!Array.isArray(g)) return null;
  if (g.some((x) => typeof x !== 'string')) return null;
  const pedidos = new Set(g);
  return IDS_GRUPOS.filter((id) => pedidos.has(id));
}

// grupos: undefined/null (sin elección guardada) → el resumen tal cual. Con lista → solo esos contadores (más el mes). No modifica el original.
function filtrarResumen(resumen, grupos) {
  if (!resumen || typeof resumen !== 'object') return resumen || null;
  const elegidos = sanearGrupos(grupos);
  if (grupos === undefined || grupos === null || elegidos === null) return resumen;
  const salida = {};
  if (resumen.mes !== undefined) salida.mes = resumen.mes;
  for (const id of elegidos) for (const k of GRUPOS[id].campos) if (resumen[k] !== undefined) salida[k] = resumen[k];
  return salida;
}

const sanearVersion = (v) => (typeof v === 'string' && /^\d{1,3}(\.\d{1,4}){1,3}$/.test(v.trim()) ? v.trim() : null);

module.exports = { sanearResumen, sanearVersion, CAMPOS, GRUPOS, IDS_GRUPOS, sanearGrupos, filtrarResumen };
