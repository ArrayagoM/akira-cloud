// src/negocio.js — piezas puras (sin React Native) de la pantalla "Negocio": agenda, caja, clientes y catálogo que la PC sube
// cuando el usuario activa "Ver los datos de mi negocio en el celular". Se pueden probar con Node (tests/negocio.test.js).
'use strict';

const AR_MS = 3 * 60 * 60 * 1000; // Argentina es UTC-3 fijo (sin cambio horario): se calcula sin Intl para que ande igual en todos los celulares
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dosDigitos = (n) => String(n).padStart(2, '0');
const ar = (iso) => { if (iso === null || iso === undefined || iso === '') return null; const t = new Date(iso); return Number.isFinite(t.getTime()) ? new Date(t.getTime() - AR_MS) : null; };

function horaAR(iso) { const d = ar(iso); return d ? `${dosDigitos(d.getUTCHours())}:${dosDigitos(d.getUTCMinutes())}` : ''; }
function diaAR(iso) { const d = ar(iso); return d ? d.toISOString().slice(0, 10) : ''; }

// '2026-11-19' + hoy → "Hoy · jueves 19/11", "Mañana · viernes 20/11", "Ayer · miércoles 18/11" o "lunes 23/11".
function etiquetaDia(dia, hoyDia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia)); if (!m) return String(dia || '');
  const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const base = `${DIAS[f.getUTCDay()]} ${dosDigitos(+m[3])}/${dosDigitos(+m[2])}`;
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hoyDia));
  if (!h) return base;
  const dif = Math.round((f.getTime() - Date.UTC(+h[1], +h[2] - 1, +h[3])) / 86400000);
  const prefijo = dif === 0 ? 'Hoy · ' : dif === 1 ? 'Mañana · ' : dif === -1 ? 'Ayer · ' : '';
  return prefijo + base;
}

function etiquetaMes(mes) { const m = /^(\d{4})-(\d{2})$/.exec(String(mes)); return m && MESES[+m[2] - 1] ? `${MESES[+m[2] - 1]} ${m[1]}` : ''; }

// Turnos agrupados por día (en hora argentina), en orden. Cada turno trae la hora de inicio y de fin ya formateadas.
function agruparTurnos(turnos, ahoraISO) {
  const hoy = diaAR(ahoraISO || new Date().toISOString());
  const porDia = new Map();
  for (const t of [...(turnos || [])].sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))) {
    const d = diaAR(t.inicio); if (!d) continue;
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push({ ...t, hora: horaAR(t.inicio), hasta: t.fin ? horaAR(t.fin) : '' });
  }
  return [...porDia.keys()].sort().map((d) => ({ dia: d, etiqueta: etiquetaDia(d, hoy), esHoy: d === hoy, turnos: porDia.get(d) }));
}

// Cómo se muestra el estado de un turno.
function estadoTurno(t) {
  if (t.cobrado) return { texto: 'Cobrado', tono: 'ok' };
  if (t.estado === 'pendiente') return { texto: 'Pendiente', tono: 'aviso' };
  if (t.estado === 'cancelado') return { texto: 'Cancelado', tono: 'error' };
  return { texto: 'Confirmado', tono: 'neutro' };
}

const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

// Movimientos de la caja agrupados por fecha (la más reciente primero).
function agruparMovimientos(movs) {
  const porDia = new Map();
  for (const m of movs || []) { if (!porDia.has(m.fecha)) porDia.set(m.fecha, []); porDia.get(m.fecha).push(m); }
  return [...porDia.keys()].sort().reverse().map((fecha) => ({ fecha, etiqueta: etiquetaDia(fecha, null), movimientos: porDia.get(fecha) }));
}

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Búsqueda simple: todas las palabras escritas tienen que aparecer en alguno de los campos (sin importar mayúsculas ni tildes).
function filtrarTexto(lista, consulta, campos) {
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return lista || [];
  return (lista || []).filter((x) => { const pajar = sinTildes(campos.map((c) => x[c]).join(' ')); return palabras.every((p) => pajar.includes(p)); });
}

function textoStock(stock, disponible) {
  if (disponible === false) return { texto: 'No disponible', tono: 'error' };
  if (!(stock >= 0)) return { texto: 'Sin control de stock', tono: 'neutro' };
  if (stock === 0) return { texto: 'Sin stock', tono: 'error' };
  return { texto: `${stock} en stock`, tono: stock <= 3 ? 'aviso' : 'ok' };
}

// ¿Conviene avisar que los datos pueden no estar al día? (la PC apagada o sin internet no los actualiza)
function avisoViejo(actualizadoEn, ahoraISO) {
  const t = new Date(actualizadoEn).getTime(); const a = new Date(ahoraISO || Date.now()).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(a)) return null;
  const min = Math.round((a - t) / 60000);
  return min > 12 * 60 ? 'Estos datos pueden no estar al día: tu PC no los actualiza desde hace mucho. Abrí Akira en la PC (prendida y con internet) y se corrigen solos.' : null;
}

// Etiquetas de las secciones, en orden.
const SECCIONES = [
  { id: 'agenda', etiqueta: 'Agenda' }, { id: 'caja', etiqueta: 'Caja' }, { id: 'clientes', etiqueta: 'Clientes' }, { id: 'catalogo', etiqueta: 'Catálogo' },
];

module.exports = { AR_MS, SECCIONES, horaAR, diaAR, etiquetaDia, etiquetaMes, agruparTurnos, estadoTurno, pesos, agruparMovimientos, filtrarTexto, textoStock, avisoViejo };
