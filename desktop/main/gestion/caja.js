// gestion/caja.js
// Lógica pura de la Caja: ingresos y gastos del negocio por mes.
//  · Ingresos "automáticos": cada turno CONFIRMADO con pago (MercadoPago o
//    transferencia confirmada) cuenta como ingreso en la fecha del turno. No se
//    copian a la base: se calculan al leer, así nunca quedan desactualizados.
//  · Movimientos manuales: gastos, cobros en efectivo, etc. (los carga el dueño,
//    los importa de una planilla o salen de un comprobante de la bandeja).
// Probada en tests/caja.test.js.
'use strict';

const METODOS = ['efectivo', 'transferencia', 'mercadopago', 'tarjeta', 'otro'];
const TIPOS = ['ingreso', 'gasto'];

const pad = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const esMes = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const mesActual = () => fechaLocal(new Date()).slice(0, 7);

function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return { desde: new Date(y, m - 1, 1, 0, 0, 0, 0), hasta: new Date(y, m, 1, 0, 0, 0, 0) };
}

function esFechaValida(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Valida y limpia un movimiento que viene de la pantalla o de una planilla. Devuelve { ok, dato | error }.
function sanearMovimiento(b = {}) {
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : null;
  if (!tipo) return { ok: false, error: 'Indicá si es un ingreso o un gasto' };
  const monto = redondear(b.monto);
  if (!(monto > 0) || monto > 1e10) return { ok: false, error: 'El monto tiene que ser mayor a cero' };
  const fecha = b.fecha || fechaLocal(new Date());
  if (!esFechaValida(fecha)) return { ok: false, error: 'La fecha no es válida' };
  const metodo = METODOS.includes(b.metodo) ? b.metodo : 'efectivo';
  return {
    ok: true,
    dato: {
      tipo, monto, fecha, metodo,
      categoria: texto(b.categoria, 40) || (tipo === 'gasto' ? 'Otros gastos' : 'Otros ingresos'),
      descripcion: texto(b.descripcion, 200),
      cliente: texto(b.cliente, 80),
      documentoId: b.documentoId ? String(b.documentoId).slice(0, 40) : null,
      sucursalId: String(b.sucursalId ?? '').slice(0, 40), // local al que pertenece (opcional)
      proveedorId: b.tipo === 'gasto' && b.proveedorId ? String(b.proveedorId).slice(0, 40) : null, // gasto de una compra a ese proveedor
    },
  };
}

// Turnos cobrados del mes → ingresos automáticos (solo lectura).
function ingresosDeTurnos(turnos, mes) {
  const { desde, hasta } = rangoMes(mes);
  return turnos
    .filter((t) => t.estado === 'confirmado' && Number(t.pago?.monto) > 0 && new Date(t.fechaInicio) >= desde && new Date(t.fechaInicio) < hasta)
    .map((t) => ({
      _id: `turno-${t._id}`,
      origen: 'turno',
      tipo: 'ingreso',
      monto: redondear(t.pago.monto),
      fecha: fechaLocal(t.fechaInicio),
      metodo: METODOS.includes(t.pago.metodo) ? t.pago.metodo : 'otro',
      categoria: 'Turnos',
      descripcion: texto(t.resumen || 'Turno', 200),
      cliente: texto(t.clienteNombre, 80),
      turnoId: String(t._id),
    }));
}

// Lo que todavía no se cobró: turnos pendientes de pago que siguen vigentes.
function porCobrar(turnos, ahora = new Date()) {
  const p = turnos.filter((t) => t.estado === 'pendiente' && new Date(t.fechaInicio) >= ahora && Number(t.pago?.monto) > 0);
  return { cantidad: p.length, total: redondear(p.reduce((s, t) => s + Number(t.pago.monto), 0)) };
}

function ordenar(movs) {
  return [...movs].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function resumen(movs, mes) {
  const r = { ingresos: 0, gastos: 0, resultado: 0, cantidad: movs.length, porMetodo: {}, categoriasGasto: {}, categoriasIngreso: {}, porDia: [] };
  const dias = {};
  for (const m of movs) {
    const esIng = m.tipo === 'ingreso';
    if (esIng) r.ingresos += m.monto; else r.gastos += m.monto;
    if (esIng) { r.porMetodo[m.metodo] = redondear((r.porMetodo[m.metodo] || 0) + m.monto); r.categoriasIngreso[m.categoria] = redondear((r.categoriasIngreso[m.categoria] || 0) + m.monto); }
    else r.categoriasGasto[m.categoria] = redondear((r.categoriasGasto[m.categoria] || 0) + m.monto);
    dias[m.fecha] = dias[m.fecha] || { fecha: m.fecha, ingresos: 0, gastos: 0 };
    dias[m.fecha][esIng ? 'ingresos' : 'gastos'] += m.monto;
  }
  r.ingresos = redondear(r.ingresos); r.gastos = redondear(r.gastos); r.resultado = redondear(r.ingresos - r.gastos);
  if (mes) {
    const { desde, hasta } = rangoMes(mes);
    for (let d = new Date(desde); d < hasta; d.setDate(d.getDate() + 1)) {
      const f = fechaLocal(d); const x = dias[f] || { fecha: f, ingresos: 0, gastos: 0 };
      r.porDia.push({ fecha: f, ingresos: redondear(x.ingresos), gastos: redondear(x.gastos) });
    }
  }
  return r;
}

// Fecha de una planilla: "05/10/2026", "5-10-26", "2026-10-05" o ya ISO → "YYYY-MM-DD" (o null)
function parsearFecha(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : fechaLocal(v);
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) { const f = `${m[1]}-${pad(m[2])}-${pad(m[3])}`; return esFechaValida(f) ? f : null; }
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
  if (m) { const a = +m[3] < 100 ? 2000 + +m[3] : +m[3]; const f = `${a}-${pad(m[2])}-${pad(m[1])}`; return esFechaValida(f) ? f : null; }
  return null;
}

const claveDuplicado = (m) => `${m.fecha}|${m.tipo}|${m.monto}|${String(m.descripcion || '').toLowerCase()}`;

module.exports = { METODOS, TIPOS, esMes, mesActual, rangoMes, fechaLocal, esFechaValida, sanearMovimiento, ingresosDeTurnos, porCobrar, ordenar, resumen, parsearFecha, claveDuplicado, redondear };
