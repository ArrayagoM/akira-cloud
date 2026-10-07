// gestion/reportes.js
// Reportes del negocio sobre un período: servicios más pedidos, clientes frecuentes, horas pico, ausencias y evolución mes a mes.
// Lógica pura: recibe turnos y movimientos ya leídos. Probado en tests/reportes.test.js.
'use strict';

const caja = require('./caja');

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HORA_MIN = 6; const HORA_MAX = 23;

const telClave = (t) => String(t || '').replace(/\D/g, '').slice(-10);
const mesAnterior = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 - n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const finDeDia = (f) => new Date(`${f}T23:59:59.999`);
const iniDeDia = (f) => new Date(`${f}T00:00:00`);

// "Corte de pelo — Ana López" → "Corte de pelo". Los turnos genéricos del bot ("Turno — Ana") se agrupan juntos.
function nombreServicio(resumen) {
  const base = String(resumen || '').split(/\s[—–-]\s/)[0].replace(/\s+/g, ' ').trim();
  if (!base || /^turno$/i.test(base)) return 'Turno (sin detalle)';
  return base.slice(0, 60);
}

// periodo: 'mes' (mes de `hoy`), '3m', '6m', '12m' → { desde, hasta, meses } (hasta = hoy)
function rangoPeriodo(periodo, hoy) {
  const mesHoy = hoy.slice(0, 7);
  const n = { mes: 1, '3m': 3, '6m': 6, '12m': 12 }[periodo] || 1;
  const primerMes = mesAnterior(mesHoy, n - 1);
  return { desde: `${primerMes}-01`, hasta: hoy, meses: Math.max(6, n) };
}

// turnos: todos los del negocio. movimientos: manuales (sin turnos). → reporte
function armar({ turnos = [], movimientos = [], desde, hasta, meses = 6, ahora = new Date() }) {
  const d0 = iniDeDia(desde); const d1 = finDeDia(hasta);
  const enRango = turnos.filter((t) => { const f = new Date(t.fechaInicio); return f >= d0 && f <= d1; });
  const vigentes = enRango.filter((t) => t.estado !== 'cancelado');
  const pasados = vigentes.filter((t) => new Date(t.fechaInicio) < ahora);
  const ausentes = pasados.filter((t) => t.ausente === true);
  const vinieron = pasados.filter((t) => t.ausente !== true && t.estado === 'confirmado');

  // servicios
  const sv = new Map();
  for (const t of vigentes) {
    const k = nombreServicio(t.resumen); const x = sv.get(k) || { nombre: k, cantidad: 0, ingresos: 0 };
    x.cantidad++; if (t.estado === 'confirmado' && t.ausente !== true) x.ingresos += Number(t.pago?.monto) || 0;
    sv.set(k, x);
  }
  const servicios = [...sv.values()].map((x) => ({ ...x, ingresos: redondear(x.ingresos) })).sort((a, b) => b.cantidad - a.cantidad || b.ingresos - a.ingresos).slice(0, 10);

  // clientes frecuentes (por teléfono; sin teléfono, por nombre)
  const cl = new Map();
  for (const t of vinieron) {
    const k = telClave(t.clienteTelefono) || `n:${String(t.clienteNombre || '').toLowerCase()}`;
    if (k === 'n:') continue;
    const x = cl.get(k) || { nombre: t.clienteNombre || 'Sin nombre', telefono: telClave(t.clienteTelefono), visitas: 0, gastado: 0, ultima: '' };
    x.visitas++; x.gastado += Number(t.pago?.monto) || 0; const f = caja.fechaLocal(t.fechaInicio); if (f > x.ultima) x.ultima = f;
    if (t.clienteNombre) x.nombre = t.clienteNombre;
    cl.set(k, x);
  }
  const clientes = [...cl.values()].map((x) => ({ ...x, gastado: redondear(x.gastado) })).sort((a, b) => b.visitas - a.visitas || b.gastado - a.gastado).slice(0, 10);

  // horas pico: matriz [día 0..6][hora]
  const matriz = DIAS.map(() => Array(HORA_MAX - HORA_MIN + 1).fill(0));
  const porHora = {}; const porDia = Array(7).fill(0);
  for (const t of vigentes) {
    const f = new Date(t.fechaInicio); const h = f.getHours();
    if (h < HORA_MIN || h > HORA_MAX) continue;
    matriz[f.getDay()][h - HORA_MIN]++; porDia[f.getDay()]++; porHora[h] = (porHora[h] || 0) + 1;
  }
  const horas = Object.entries(porHora).map(([h, n]) => ({ hora: Number(h), cantidad: n })).sort((a, b) => b.cantidad - a.cantidad || a.hora - b.hora).slice(0, 3);
  const dias = porDia.map((n, i) => ({ dia: DIAS[i], cantidad: n }));
  const diaTop = [...dias].sort((a, b) => b.cantidad - a.cantidad)[0];

  // ausencias
  const au = new Map();
  for (const t of ausentes) {
    const k = telClave(t.clienteTelefono) || `n:${String(t.clienteNombre || '').toLowerCase()}`;
    const x = au.get(k) || { nombre: t.clienteNombre || 'Sin nombre', telefono: telClave(t.clienteTelefono), faltas: 0 };
    x.faltas++; au.set(k, x);
  }
  const ausencias = {
    cantidad: ausentes.length, porcentaje: pasados.length ? Math.round((ausentes.length / pasados.length) * 1000) / 10 : 0,
    perdido: redondear(ausentes.reduce((s, t) => s + (Number(t.pago?.monto) || 0), 0)),
    clientes: [...au.values()].sort((a, b) => b.faltas - a.faltas).slice(0, 5),
  };

  // evolución mes a mes (los últimos `meses` meses que terminan en el mes de `hasta`)
  const mesFin = hasta.slice(0, 7); const evolucion = [];
  for (let i = meses - 1; i >= 0; i--) {
    const mes = mesAnterior(mesFin, i);
    const manuales = movimientos.filter((m) => String(m.fecha || '').startsWith(mes));
    const ing = [...manuales, ...caja.ingresosDeTurnos(turnos, mes)];
    const r = caja.resumen(ing);
    const { desde: a, hasta: b } = caja.rangoMes(mes);
    const tur = turnos.filter((t) => t.estado !== 'cancelado' && new Date(t.fechaInicio) >= a && new Date(t.fechaInicio) < b).length;
    evolucion.push({ mes, ingresos: r.ingresos, gastos: r.gastos, resultado: r.resultado, turnos: tur });
  }

  return {
    desde, hasta,
    resumen: { turnos: vigentes.length, atendidos: vinieron.length, ausentes: ausentes.length, cancelados: enRango.length - vigentes.length, clientesDistintos: cl.size },
    servicios, clientes, horasPico: { matriz, horaMin: HORA_MIN, horas, dias, diaTop: diaTop && diaTop.cantidad > 0 ? diaTop : null, dias7: DIAS },
    ausencias, evolucion,
  };
}

module.exports = { armar, rangoPeriodo, nombreServicio, DIAS, HORA_MIN, HORA_MAX };
