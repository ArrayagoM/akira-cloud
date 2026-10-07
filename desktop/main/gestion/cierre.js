// gestion/cierre.js
// Cierre de caja diario: el sistema calcula cuánto EFECTIVO debería haber en el cajón y el dueño anota cuánto contó.
// esperado = fondo inicial (lo que quedó el día anterior) + ingresos en efectivo − gastos en efectivo.
// La diferencia (sobra / falta) queda registrada. Lo que entró por MercadoPago, transferencia o tarjeta se muestra aparte (no está en el cajón).
// Probado en tests/cierre.test.js.
'use strict';

const caja = require('./caja');

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

// movs: movimientos del día (ya con los ingresos de turnos). → { porMetodo, efectivoIngresos, efectivoGastos, otrosIngresos, gastosOtros, cantidad }
function totalesDelDia(movs) {
  const r = { porMetodo: {}, efectivoIngresos: 0, efectivoGastos: 0, otrosIngresos: 0, otrosGastos: 0, cantidad: movs.length };
  for (const m of movs) {
    const ing = m.tipo === 'ingreso'; const ef = m.metodo === 'efectivo';
    if (ing) r.porMetodo[m.metodo] = redondear((r.porMetodo[m.metodo] || 0) + m.monto);
    if (ef) { if (ing) r.efectivoIngresos += m.monto; else r.efectivoGastos += m.monto; } else if (ing) r.otrosIngresos += m.monto; else r.otrosGastos += m.monto;
  }
  for (const k of ['efectivoIngresos', 'efectivoGastos', 'otrosIngresos', 'otrosGastos']) r[k] = redondear(r[k]);
  return r;
}

// El fondo con el que arranca el día: lo contado en el último cierre anterior a esa fecha (o 0 si nunca cerró).
function fondoInicial(cierres, fecha) {
  const previos = (cierres || []).filter((c) => c.fecha < fecha).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return previos.length ? redondear(previos[0].contado) : 0;
}

// → { ok, dato } | { ok:false, error }
function sanear(b = {}, fecha) {
  if (!caja.esFechaValida(fecha)) return { ok: false, error: 'La fecha no es válida' };
  const contado = Number(String(b.contado ?? '').replace(',', '.'));
  if (b.contado === undefined || b.contado === '' || !Number.isFinite(contado) || contado < 0 || contado > 1e10) return { ok: false, error: 'Anotá cuánto efectivo contaste (puede ser 0)' };
  const inicial = b.inicial === undefined || b.inicial === '' || b.inicial === null ? null : Number(String(b.inicial).replace(',', '.'));
  if (inicial !== null && (!Number.isFinite(inicial) || inicial < 0 || inicial > 1e10)) return { ok: false, error: 'El fondo inicial no es válido' };
  return { ok: true, dato: { contado: redondear(contado), inicial: inicial === null ? null : redondear(inicial), nota: String(b.nota ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) } };
}

// Arma el cierre completo. → { fecha, inicial, esperado, contado, diferencia, estado: 'justo'|'sobra'|'falta', ...totales }
function calcular(movs, fecha, { inicial = 0, contado = null } = {}) {
  const t = totalesDelDia(movs);
  const esperado = redondear(inicial + t.efectivoIngresos - t.efectivoGastos);
  const salida = { fecha, inicial: redondear(inicial), esperado, ...t, contado: null, diferencia: null, estado: null };
  if (contado !== null && contado !== undefined) {
    salida.contado = redondear(contado);
    salida.diferencia = redondear(contado - esperado);
    salida.estado = Math.abs(salida.diferencia) < 0.005 ? 'justo' : salida.diferencia > 0 ? 'sobra' : 'falta';
  }
  return salida;
}

const textoDiferencia = (c) => (c.estado === 'justo' ? 'La caja cerró justa ✅' : c.estado === 'sobra' ? `Sobran $${Math.round(c.diferencia).toLocaleString('es-AR')}` : c.estado === 'falta' ? `Faltan $${Math.round(-c.diferencia).toLocaleString('es-AR')}` : '');

module.exports = { totalesDelDia, fondoInicial, sanear, calcular, textoDiferencia };
