// gestion/sucursales.js
// Sucursales (locales): cada movimiento de la Caja puede pertenecer a un local, y cada turno también (se lo asigna el dueño, o lo hereda del
// profesional que lo atiende). Con eso se filtra la Caja por local y se ve un resumen por sucursal. Probado en tests/sucursales.test.js.
//
// Alcance: separa la PLATA y los TURNOS por local. El bot sigue siendo uno solo (mismo catálogo, servicios y horarios) para todo el negocio.
'use strict';

const caja = require('./caja');

const MAX_SUCURSALES = 20;
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// → { ok, dato } | { ok:false, error }
function sanear(b = {}, previo = {}) {
  const nombre = texto(b.nombre ?? previo.nombre, 40);
  if (!nombre) return { ok: false, error: 'Poné el nombre de la sucursal.' };
  return { ok: true, dato: { nombre, direccion: texto(b.direccion ?? previo.direccion, 120), telefono: texto(b.telefono ?? previo.telefono, 20), activo: b.activo === undefined ? previo.activo !== false : b.activo === true } };
}

// Sucursal de un turno: la que se le asignó, o la del profesional que lo atiende.
function sucursalDeTurno(t, profesionalesPorId = new Map()) {
  return String(t.sucursalId || profesionalesPorId.get(String(t.profesionalId || ''))?.sucursalId || '');
}

// sucursal: '' o undefined = todas; 'sin' = lo que no tiene sucursal; otro = ese id.
const coincide = (sucursal, id) => !sucursal || (sucursal === 'sin' ? !id : id === sucursal);

function filtrarTurnos(turnos, profesionales, sucursal) {
  if (!sucursal) return turnos;
  const por = new Map(profesionales.map((p) => [String(p._id), p]));
  return turnos.filter((t) => coincide(sucursal, sucursalDeTurno(t, por)));
}
const filtrarMovimientos = (movs, sucursal) => (sucursal ? movs.filter((m) => coincide(sucursal, String(m.sucursalId || ''))) : movs);

// movimientos: manuales del mes; turnos: todos; → por sucursal (y "sin sucursal") del mes
function resumen({ movimientos, turnos, profesionales, sucursales, mes }) {
  const por = new Map(profesionales.map((p) => [String(p._id), p]));
  const filas = new Map(sucursales.map((s) => [String(s._id), { id: String(s._id), nombre: s.nombre, activo: s.activo !== false, ingresos: 0, gastos: 0, resultado: 0, turnos: 0 }]));
  filas.set('', { id: '', nombre: 'Sin sucursal', activo: true, ingresos: 0, gastos: 0, resultado: 0, turnos: 0 });
  const fila = (id) => filas.get(filas.has(id) ? id : '');
  const { desde, hasta } = caja.rangoMes(mes);
  for (const m of movimientos.filter((x) => String(x.fecha || '').startsWith(mes))) { const f = fila(String(m.sucursalId || '')); if (m.tipo === 'ingreso') f.ingresos += m.monto; else f.gastos += m.monto; }
  for (const m of caja.ingresosDeTurnos(turnos, mes)) { const t = turnos.find((x) => String(x._id) === m.turnoId); fila(sucursalDeTurno(t || {}, por)).ingresos += m.monto; }
  for (const t of turnos) { const f = new Date(t.fechaInicio); if (t.estado !== 'cancelado' && f >= desde && f < hasta) fila(sucursalDeTurno(t, por)).turnos++; }
  const lista = [...filas.values()].map((x) => ({ ...x, ingresos: redondear(x.ingresos), gastos: redondear(x.gastos), resultado: redondear(x.ingresos - x.gastos) }))
    .filter((x) => (x.ingresos || x.gastos || x.turnos) || (x.id !== '' && x.activo)); // una sucursal activa se muestra aunque no tenga movimiento; una dada de baja solo si tuvo actividad
  return { mes, sucursales: lista, totales: { ingresos: redondear(lista.reduce((s, x) => s + x.ingresos, 0)), gastos: redondear(lista.reduce((s, x) => s + x.gastos, 0)), turnos: lista.reduce((s, x) => s + x.turnos, 0) } };
}

module.exports = { sanear, sucursalDeTurno, filtrarTurnos, filtrarMovimientos, resumen, coincide, MAX_SUCURSALES };
