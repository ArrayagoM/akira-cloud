// gestion/metas.js
// Metas del mes: "quiero facturar $X" y/o "quiero tener N turnos". Se muestra el avance, lo que falta por día y, si sigue a este ritmo,
// cuánto va a terminar el mes. Probado en tests/metas.test.js.
'use strict';

const fs = require('fs');
const path = require('path');
const caja = require('./caja');

const archivo = (dir) => path.join(dir, 'metas.json');
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MAX = 1e10;

function leer(userDataDir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(userDataDir), 'utf8')); } catch { /* sin metas */ }
  const num = (v, tope) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= tope ? n : 0; };
  return { ingresos: redondear(num(j.ingresos, MAX)), turnos: Math.floor(num(j.turnos, 100000)) };
}

// Acepta { ingresos?, turnos? }; vacío/0 = sin meta. → { ok, metas } | { ok:false, error }
function guardar(userDataDir, b = {}) {
  const actual = leer(userDataDir);
  const campo = (v, previo, nombre, tope, entero) => {
    if (v === undefined) return { ok: true, valor: previo };
    if (v === '' || v === null || Number(v) === 0) return { ok: true, valor: 0 };
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > tope) return { ok: false, error: `La meta de ${nombre} no es válida` };
    return { ok: true, valor: entero ? Math.floor(n) : redondear(n) };
  };
  const i = campo(b.ingresos, actual.ingresos, 'ingresos', MAX, false); if (!i.ok) return i;
  const t = campo(b.turnos, actual.turnos, 'turnos', 100000, true); if (!t.ok) return t;
  const nuevo = { ingresos: i.valor, turnos: t.valor };
  fs.writeFileSync(archivo(userDataDir), JSON.stringify(nuevo));
  return { ok: true, metas: nuevo };
}

const diasDelMes = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// Avance de UNA meta. `logrado` = lo hecho hasta hoy; `hoy` = 'YYYY-MM-DD'.
function avance(meta, logrado, mes, hoy) {
  if (!(meta > 0)) return null;
  const total = diasDelMes(mes);
  const esActual = hoy.startsWith(mes);
  const dia = esActual ? Number(hoy.slice(8, 10)) : (hoy.slice(0, 7) > mes ? total : 0);
  const restantes = esActual ? total - dia : (dia === total ? 0 : total);
  const falta = Math.max(0, redondear(meta - logrado));
  return {
    meta, logrado: redondear(logrado), porcentaje: Math.min(999, Math.round((logrado / meta) * 100)), falta, cumplida: logrado >= meta,
    porDiaNecesario: restantes > 0 && falta > 0 ? redondear(falta / restantes) : 0,
    proyeccion: esActual && dia > 0 ? redondear((logrado / dia) * total) : null,
    diasRestantes: restantes,
  };
}

// movs: movimientos del mes (con ingresos de turnos). turnos: turnos del mes sin cancelar.
function progreso(metas, { ingresosMes, turnosMes }, mes, hoy) {
  return { ingresos: avance(metas.ingresos, ingresosMes, mes, hoy), turnos: avance(metas.turnos, turnosMes, mes, hoy) };
}

module.exports = { leer, guardar, avance, progreso, diasDelMes };
