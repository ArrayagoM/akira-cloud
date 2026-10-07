// gestion/conciliacion.js
// Conciliación con MercadoPago: se traen los cobros aprobados de la cuenta y se cruzan con lo que está anotado en la app
// (turnos y pedidos pagados, y ingresos de la Caja). Lo que entró a MercadoPago y no figura en la Caja se puede registrar con un toque;
// lo que figura en la Caja como MercadoPago y no aparece en la cuenta se marca para revisar. Probado en tests/conciliacion.test.js.
'use strict';

const caja = require('./caja');

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const diasEntre = (a, b) => Math.abs(Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000));
const TOLERANCIA_DIAS = 2;
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return caja.fechaLocal(d); };

// Un cobro de la API de MercadoPago → el formato que usamos. null si no es un cobro aprobado y utilizable.
function normalizarPago(p) {
  if (!p || p.status !== 'approved' || !p.id) return null;
  const monto = redondear(p.transaction_amount);
  if (!(monto > 0)) return null;
  const neto = p.transaction_details?.net_received_amount != null ? redondear(p.transaction_details.net_received_amount) : monto;
  const f = p.date_approved || p.date_created;
  const d = f ? new Date(f) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const quien = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ') || p.payer?.email || '';
  return { id: String(p.id), fecha: caja.fechaLocal(d), monto, neto, comision: redondear(monto - neto), descripcion: String(p.description || p.external_reference || '').slice(0, 120), pagador: String(quien).slice(0, 80), medio: String(p.payment_type_id || p.payment_method_id || '').slice(0, 30) };
}

// pagos: normalizados. turnos / pedidos / movimientos: documentos de la base.
// ventana { desde, hasta }: solo los ingresos de la Caja de ese período (con unos días de margen) se consideran para "figura en la Caja pero no en MercadoPago".
function cruzar({ pagos = [], turnos = [], pedidos = [], movimientos = [], ventana = null }) {
  const ids = new Map(); // id de cobro → de dónde se anotó
  for (const t of turnos) if (t.pago?.comprobante) ids.set(String(t.pago.comprobante), 'turno');
  for (const p of pedidos) if (p.pago?.comprobante) ids.set(String(p.pago.comprobante), 'pedido');
  for (const m of movimientos) if (m.mpId) ids.set(String(m.mpId), 'caja');
  // Ingresos de la Caja con MercadoPago que no tienen id (cargados a mano) y que un cobro podría explicar por monto y fecha
  const candidatos = movimientos.filter((m) => m.tipo === 'ingreso' && m.metodo === 'mercadopago' && !m.mpId && !['turno', 'pedido'].includes(m.origen) && (!ventana || (m.fecha >= sumarDias(ventana.desde, -TOLERANCIA_DIAS) && m.fecha <= sumarDias(ventana.hasta, TOLERANCIA_DIAS)))).map((m) => ({ m, usado: false }));
  const conciliados = []; const sinRegistrar = [];
  for (const p of pagos) {
    if (ids.has(p.id)) { conciliados.push({ ...p, via: ids.get(p.id) }); continue; }
    const c = candidatos.find((x) => !x.usado && Math.abs(x.m.monto - p.monto) < 0.01 && diasEntre(x.m.fecha, p.fecha) <= TOLERANCIA_DIAS);
    if (c) { c.usado = true; conciliados.push({ ...p, via: 'monto', movimientoId: String(c.m._id) }); continue; }
    sinRegistrar.push(p);
  }
  const sinPago = candidatos.filter((x) => !x.usado).map((x) => ({ _id: String(x.m._id), fecha: x.m.fecha, monto: x.m.monto, descripcion: x.m.descripcion || x.m.categoria || '', cliente: x.m.cliente || '' }));
  const suma = (l, k) => redondear(l.reduce((s, x) => s + x[k], 0));
  return {
    conciliados, sinRegistrar, sinPago,
    totales: { cobros: pagos.length, bruto: suma(pagos, 'monto'), comision: suma(pagos, 'comision'), neto: suma(pagos, 'neto'), sinRegistrarMonto: suma(sinRegistrar, 'monto') },
  };
}

// El ingreso de Caja para un cobro de MercadoPago que no estaba anotado.
const movimientoDeCobro = (userId, p) => ({ userId: String(userId), origen: 'mercadopago', mpId: p.id, tipo: 'ingreso', monto: p.monto, fecha: p.fecha, metodo: 'mercadopago', categoria: 'Ventas', descripcion: (`MercadoPago${p.descripcion ? ` — ${p.descripcion}` : ''}`).slice(0, 200), cliente: p.pagador || '', documentoId: null });

// Trae los cobros aprobados del período (con paginado y tope). mpFetch(url) → { status, json }
async function traerCobros(mpFetch, { desde, hasta }, tope = 500) {
  const salida = []; let offset = 0;
  while (salida.length < tope) {
    const url = `https://api.mercadopago.com/v1/payments/search?sort=date_approved&criteria=desc&status=approved&range=date_approved&begin_date=${desde}T00:00:00.000-03:00&end_date=${hasta}T23:59:59.999-03:00&limit=100&offset=${offset}`;
    const r = await mpFetch(url);
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('MercadoPago rechazó la clave: revisá el Access Token en Config.'), { status: 400 });
    if (r.status !== 200) throw Object.assign(new Error(`MercadoPago respondió con un error (${r.status}). Probá de nuevo en unos minutos.`), { status: 502 });
    const lote = r.json?.results || [];
    for (const p of lote) { const n = normalizarPago(p); if (n) salida.push(n); }
    offset += 100;
    if (lote.length < 100 || offset >= (r.json?.paging?.total ?? 0)) break;
  }
  return salida.slice(0, tope);
}

module.exports = { sumarDias, normalizarPago, cruzar, movimientoDeCobro, traerCobros, TOLERANCIA_DIAS };
