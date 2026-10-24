// lib/ingresos.js
// Resumen de ingresos por suscripciones para el panel de administración (puro, sin base de datos: se prueba aparte).
// Entradas: los pagos registrados (modelo Pago) y los usuarios con plan pago. Los meses se cuentan en hora de Argentina (UTC-3).
'use strict';

const AR_MS = 3 * 60 * 60 * 1000;
const mesAR = (fecha) => new Date(new Date(fecha).getTime() - AR_MS).toISOString().slice(0, 7);
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const mesesAtras = (ahora, n) => { const d = new Date(new Date(ahora).getTime() - AR_MS); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };

// planes: { basico_mensual: { key, nombre, periodo, precio, meses }, ... } (lib/cobro.js armarPlanes)
function resumir({ pagos = [], usuarios = [], planes, ahora = new Date(), meses = 6 }) {
  const buenos = pagos.filter((p) => (p.estado || 'aprobado') === 'aprobado' && Number(p.monto) > 0);
  const mesActual = mesAR(ahora); const mesAnterior = mesesAtras(ahora, 1);
  const porMesMapa = new Map(); const porPlanMapa = new Map(); let acumulado = 0;
  for (const p of buenos) {
    const m = mesAR(p.fecha); const x = porMesMapa.get(m) || { mes: m, monto: 0, pagos: 0 }; x.monto += Number(p.monto); x.pagos += 1; porMesMapa.set(m, x);
    const k = `${p.plan}_${p.periodo}`; const y = porPlanMapa.get(k) || { plan: p.plan, periodo: p.periodo, nombre: (planes[k] && planes[k].nombre) || p.plan, pagos: 0, monto: 0 }; y.pagos += 1; y.monto += Number(p.monto); porPlanMapa.set(k, y);
    acumulado += Number(p.monto);
  }
  const porMes = []; for (let i = meses - 1; i >= 0; i--) { const m = mesesAtras(ahora, i); const x = porMesMapa.get(m); porMes.push({ mes: m, monto: redondear(x ? x.monto : 0), pagos: x ? x.pagos : 0 }); }

  // suscripciones vigentes: solo cuentan como "con pago" las de usuarios que tienen al menos un pago registrado; el resto se activó a mano
  const conPago = new Set(buenos.map((p) => String(p.userId)));
  const activas = { basico: 0, pro: 0, agencia: 0, total: 0 }; let mrr = 0; let activadasAMano = 0; const vencen = [];
  const en7 = new Date(new Date(ahora).getTime() + 7 * 86400000);
  for (const u of usuarios) {
    if (!u.planExpira || new Date(u.planExpira) <= ahora || !activas.hasOwnProperty(u.plan) || u.plan === 'total') continue;
    if (!conPago.has(String(u._id))) { activadasAMano++; continue; }
    const info = planes[`${u.plan}_${u.planPeriodo || 'mensual'}`] || planes[`${u.plan}_mensual`];
    activas[u.plan]++; activas.total++; mrr += info ? info.precio / info.meses : 0;
    if (new Date(u.planExpira) <= en7) vencen.push({ email: u.email, plan: u.plan, periodo: u.planPeriodo || 'mensual', expira: u.planExpira });
  }
  vencen.sort((a, b) => new Date(a.expira) - new Date(b.expira));

  const ordenados = [...buenos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return {
    mesActual, mesAnterior,
    ingresos: {
      acumulado: redondear(acumulado), mesActual: redondear((porMesMapa.get(mesActual) || {}).monto || 0), mesAnterior: redondear((porMesMapa.get(mesAnterior) || {}).monto || 0),
      pagos: buenos.length, ticketPromedio: buenos.length ? redondear(acumulado / buenos.length) : 0,
    },
    porMes,
    porPlan: [...porPlanMapa.values()].map((x) => ({ ...x, monto: redondear(x.monto) })).sort((a, b) => b.monto - a.monto),
    suscripciones: { activas, mrr: redondear(mrr), arr: redondear(mrr * 12), activadasAMano, vencenEn7Dias: vencen },
    ultimosPagos: ordenados.slice(0, 20).map((p) => ({ fecha: p.fecha, email: p.email || '', plan: p.plan, periodo: p.periodo, monto: redondear(p.monto), descuentoReferido: p.descuentoReferido || 0 })),
    desde: ordenados.length ? ordenados[ordenados.length - 1].fecha : null,
  };
}

module.exports = { resumir, mesAR };
