// gestion/recurrentes.js
// Gastos fijos y vencimientos: "el alquiler vence el 5 de cada mes", "el monotributo el 20".
//  · cargar: el día del vencimiento se anota solo el gasto en la Caja (si el dueño lo pidió).
//  · avisar: unos días antes le llega un aviso por WhatsApp al dueño (una sola vez por vencimiento).
// Todo idempotente: si la app estuvo cerrada se pone al día (hasta 3 meses atrás) sin duplicar. Probado en tests/recurrentes.test.js.
'use strict';

const caja = require('./caja');

const MAX_MESES_ATRAS = 3;
const MAX_ACTIVOS = 60;
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const pad = (n) => String(n).padStart(2, '0');

// Fecha (YYYY-MM-DD) del vencimiento en un mes: el día 31 en un mes de 30 días cae el último día.
function fechaEnMes(mes, dia) {
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${mes}-${pad(Math.min(Math.max(1, dia), ultimo))}`;
}
const mesSiguiente = (mes) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const mesAnterior = (mes, n = 1) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 - n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

// Valida lo que llega de la pantalla. → { ok, dato } | { ok:false, error }
function sanear(b = {}) {
  const descripcion = texto(b.descripcion, 80);
  if (!descripcion) return { ok: false, error: 'Poné un nombre (ej. Alquiler)' };
  const monto = redondear(b.monto);
  if (b.registrar !== false && (!(monto > 0) || monto > 1e10)) return { ok: false, error: 'El monto tiene que ser mayor a cero' };
  if (b.registrar === false && monto < 0) return { ok: false, error: 'El monto no es válido' };
  const dia = Math.floor(Number(b.dia));
  if (!(dia >= 1 && dia <= 31)) return { ok: false, error: 'El día del mes tiene que estar entre 1 y 31' };
  const avisoDias = b.avisoDias === undefined || b.avisoDias === '' ? 3 : Math.floor(Number(b.avisoDias));
  if (!(avisoDias >= 0 && avisoDias <= 15)) return { ok: false, error: 'Los días de aviso van de 0 a 15 (0 = no avisar)' };
  return {
    ok: true,
    dato: {
      descripcion, monto: monto > 0 ? monto : 0, dia, avisoDias, registrar: b.registrar !== false,
      categoria: texto(b.categoria, 40) || 'Otros gastos', metodo: caja.METODOS.includes(b.metodo) ? b.metodo : 'transferencia', activo: b.activo !== false,
    },
  };
}

// Próximo vencimiento a partir de `hoy` (incluye hoy). → { fecha, dias }
function proximoVencimiento(rec, hoy) {
  const mes = hoy.slice(0, 7);
  let f = fechaEnMes(mes, rec.dia);
  if (f < hoy) f = fechaEnMes(mesSiguiente(mes), rec.dia);
  return { fecha: f, dias: diasEntre(hoy, f) };
}

// Meses que faltan cargar: desde el mes de alta hasta hoy (máx. 3 atrás), solo los vencimientos que ya llegaron.
// `creadoEn` (YYYY-MM-DD): no se cargan vencimientos anteriores al alta (el dueño ya los pudo anotar a mano).
function mesesPendientes(rec, hoy, yaCargados = []) {
  const hasta = hoy.slice(0, 7); const piso = mesAnterior(hasta, MAX_MESES_ATRAS);
  const alta = String(rec.creadoEn || hoy).slice(0, 10);
  const salida = [];
  for (let mes = piso; mes <= hasta; mes = mesSiguiente(mes)) {
    const f = fechaEnMes(mes, rec.dia);
    if (f > hoy || f < alta || yaCargados.includes(mes)) continue;
    salida.push({ mes, fecha: f });
  }
  return salida;
}

const textoAviso = (rec, dias, fecha) => {
  const cuando = dias === 0 ? 'HOY' : dias === 1 ? 'mañana' : `en ${dias} días`;
  const [, m, d] = fecha.split('-');
  return `📅 Vencimiento ${cuando}: ${rec.descripcion} (${d}/${m})${rec.monto > 0 ? ` — $${Math.round(rec.monto).toLocaleString('es-AR')}` : ''}.`;
};

// Hace lo que corresponde HOY. → { cargados: [{id, descripcion, fecha}], avisos: [string] }
// `avisar(texto)` devuelve true si salió. Si no sale (bot desconectado) no se marca y se reintenta en la próxima vuelta.
async function procesar({ Recurrente, Movimiento }, userId, { hoy = caja.fechaLocal(new Date()), avisar = async () => false } = {}) {
  const uid = String(userId);
  const cargados = []; const avisos = [];
  const recs = (await Recurrente.find({ userId: uid }).lean()).filter((r) => r.activo !== false);
  for (const rec of recs) {
    if (rec.registrar !== false) {
      // los meses ya cargados se recuerdan en el propio fijo: si el dueño borra el gasto de la Caja, no reaparece solo
      const cargadosMes = [...(rec.mesesCargados || [])];
      for (const p of mesesPendientes(rec, hoy, cargadosMes)) {
        await Movimiento.create({
          userId: uid, origen: 'recurrente', recurrenteId: String(rec._id), recurrenteMes: p.mes, tipo: 'gasto', monto: rec.monto, fecha: p.fecha,
          metodo: rec.metodo || 'transferencia', categoria: rec.categoria || 'Otros gastos', descripcion: `${rec.descripcion} (fijo)`.slice(0, 200), cliente: '', documentoId: null,
        });
        cargadosMes.push(p.mes);
        await Recurrente.findOneAndUpdate({ _id: rec._id, userId: uid }, { $set: { mesesCargados: cargadosMes.slice(-24) } });
        cargados.push({ id: String(rec._id), descripcion: rec.descripcion, fecha: p.fecha });
      }
    }
    const ad = rec.avisoDias ?? 3; // 0 = no avisar
    if (ad > 0) {
      const prox = proximoVencimiento(rec, hoy);
      if (prox.dias <= ad && rec.avisadoPara !== prox.fecha) {
        const t = textoAviso(rec, prox.dias, prox.fecha);
        if (await avisar(t)) { await Recurrente.findOneAndUpdate({ _id: rec._id, userId: uid }, { $set: { avisadoPara: prox.fecha } }); avisos.push(t); }
      }
    }
  }
  return { cargados, avisos };
}

module.exports = { sanear, fechaEnMes, proximoVencimiento, mesesPendientes, textoAviso, procesar, MAX_ACTIVOS, MAX_MESES_ATRAS };
