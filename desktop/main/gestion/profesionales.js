// gestion/profesionales.js
// Profesionales con agenda propia y comisiones. Cada turno se asigna a un profesional (desde la Agenda); al asignarlo queda anotado su
// porcentaje de comisión de ese momento (si después se cambia el porcentaje, lo ya liquidado no se mueve).
// La liquidación del período suma lo cobrado en los turnos que ya se hicieron (no cuenta cancelados ni ausentes).
// Probado en tests/profesionales.test.js.
'use strict';

const caja = require('./caja');

const MAX_PROFESIONALES = 40;
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const COLORES = ['#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#f87171', '#fb923c', '#2dd4bf', '#f472b6'];
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Horario semanal propio (opcional): { lunes: { activo, inicio, fin }, … }. Lo que no es válido se ignora.
function sanearHorario(h) {
  if (!h || typeof h !== 'object') return {};
  const salida = {};
  for (const d of DIAS) {
    const x = h[d]; if (!x || typeof x !== 'object') continue;
    if (x.activo !== true) { salida[d] = { activo: false }; continue; }
    if (!HORA_RE.test(x.inicio) || !HORA_RE.test(x.fin) || x.inicio >= x.fin) continue;
    salida[d] = { activo: true, inicio: x.inicio, fin: x.fin };
  }
  return salida;
}

// → { ok, dato } | { ok:false, error }
function sanear(b = {}, previo = {}) {
  const nombre = texto(b.nombre ?? previo.nombre, 40);
  if (!nombre) return { ok: false, error: 'Poné el nombre del profesional.' };
  const pct = b.comisionPct === undefined ? (previo.comisionPct ?? 0) : Number(String(b.comisionPct).replace(',', '.'));
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, error: 'La comisión es un porcentaje entre 0 y 100.' };
  const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : (previo.color || COLORES[0]);
  const servicios = Array.isArray(b.servicios) ? [...new Set(b.servicios.map((s) => texto(s, 60)).filter(Boolean))].slice(0, 40) : (previo.servicios || []);
  const sucursalId = b.sucursalId === undefined ? (previo.sucursalId || '') : String(b.sucursalId || '').slice(0, 40);
  return { ok: true, dato: { nombre, sucursalId, comisionPct: redondear(pct), color, servicios, horario: b.horario === undefined ? (previo.horario || {}) : sanearHorario(b.horario), activo: b.activo === undefined ? previo.activo !== false : b.activo === true, telefono: texto(b.telefono ?? previo.telefono, 20) } };
}

// Turnos que cuentan para liquidar: confirmados, ya hechos (la hora de inicio pasó), a los que vino el cliente.
const cuenta = (t, ahora) => t.estado === 'confirmado' && t.ausente !== true && new Date(t.fechaInicio) < ahora;

// → { periodo, profesionales: [{ id, nombre, color, comisionPct, turnos, facturado, comision, paraElLocal }], sinAsignar: {turnos, facturado}, totales }
function liquidacion(turnos, profesionales, { desde, hasta, ahora = new Date() }) {
  const d0 = new Date(`${desde}T00:00:00`); const d1 = new Date(`${hasta}T23:59:59.999`);
  const filas = new Map(profesionales.map((p) => [String(p._id), { id: String(p._id), nombre: p.nombre, color: p.color, comisionPct: p.comisionPct || 0, activo: p.activo !== false, turnos: 0, facturado: 0, comision: 0, paraElLocal: 0 }]));
  const sin = { turnos: 0, facturado: 0 };
  for (const t of turnos) {
    const f = new Date(t.fechaInicio);
    if (!cuenta(t, ahora) || f < d0 || f > d1) continue;
    const monto = Number(t.pago?.monto) || 0;
    const fila = t.profesionalId ? filas.get(String(t.profesionalId)) : null;
    if (!fila) { sin.turnos++; sin.facturado += monto; continue; }
    fila.turnos++; fila.facturado += monto;
    fila.comision += monto * (Number.isFinite(t.comisionPct) ? t.comisionPct : fila.comisionPct) / 100; // el % de cuando se asignó
  }
  const lista = [...filas.values()].map((x) => ({ ...x, facturado: redondear(x.facturado), comision: redondear(x.comision), paraElLocal: redondear(x.facturado - x.comision) }))
    .filter((x) => x.turnos > 0 || x.activo).sort((a, b) => b.facturado - a.facturado);
  const t = (k) => redondear(lista.reduce((s, x) => s + x[k], 0));
  return { desde, hasta, profesionales: lista, sinAsignar: { turnos: sin.turnos, facturado: redondear(sin.facturado) }, totales: { turnos: lista.reduce((s, x) => s + x.turnos, 0) + sin.turnos, facturado: redondear(t('facturado') + sin.facturado), comision: t('comision'), paraElLocal: redondear(t('paraElLocal') + sin.facturado) } };
}

// Detalle de un profesional (para entregarle su liquidación)
function detalle(turnos, profesional, { desde, hasta, ahora = new Date() }) {
  const d0 = new Date(`${desde}T00:00:00`); const d1 = new Date(`${hasta}T23:59:59.999`);
  return turnos.filter((t) => cuenta(t, ahora) && String(t.profesionalId) === String(profesional._id) && new Date(t.fechaInicio) >= d0 && new Date(t.fechaInicio) <= d1)
    .sort((a, b) => new Date(a.fechaInicio) - new Date(b.fechaInicio))
    .map((t) => { const m = Number(t.pago?.monto) || 0; const pct = Number.isFinite(t.comisionPct) ? t.comisionPct : profesional.comisionPct || 0; return { fecha: caja.fechaLocal(t.fechaInicio), cliente: t.clienteNombre || '', servicio: String(t.resumen || '').split(/\s[—–-]\s/)[0], monto: m, comisionPct: pct, comision: redondear((m * pct) / 100) }; });
}

module.exports = { sanear, sanearHorario, liquidacion, detalle, cuenta, MAX_PROFESIONALES, COLORES, DIAS };
