// lib/datos-negocio.js
// "Datos de mi negocio en el celular" (OPCIONAL, lo activa el usuario en la app de la PC): la PC sube una copia de lo que el usuario
// eligió ver desde el celular (agenda, caja, clientes y deudores, catálogo). A diferencia del resumen de números, ACÁ SÍ viajan nombres,
// teléfonos y montos de los clientes del negocio: por eso el servidor valida cada campo (lista fija, largos y cantidades acotados),
// lo guarda cifrado y solo se lo devuelve a la cuenta dueña. Lógica pura: sin base de datos.
'use strict';

const TIPOS = ['agenda', 'caja', 'clientes', 'catalogo'];
const MAX = { turnos: 400, movimientos: 600, clientes: 500, deudores: 200, productos: 800 };
const MAX_NUM = 1e12;

const texto = (v, max) => (v === undefined || v === null ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max));
const num = (v) => { const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= MAX_NUM ? Math.round(n * 100) / 100 : null; };
const monto = (v) => { const n = num(v); return n === null ? 0 : n; };
const fechaISO = (v) => { if (v === undefined || v === null || v === '') return null; const t = new Date(v); return Number.isFinite(t.getTime()) ? t.toISOString() : null; };
const dia = (v) => { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const mes = (v) => { const s = String(v ?? ''); return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : ''; };
const lista = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

const ESTADOS_TURNO = ['pendiente', 'confirmado', 'cancelado', 'completado', 'ausente'];

function agenda(d) {
  const o = objeto(d); if (!o) return null;
  const turnos = [];
  for (const t of lista(o.turnos, MAX.turnos)) {
    const x = objeto(t); if (!x) continue;
    const inicio = fechaISO(x.inicio); if (!inicio) continue;
    turnos.push({
      id: texto(x.id, 40), inicio, fin: fechaISO(x.fin),
      cliente: texto(x.cliente, 80), telefono: texto(x.telefono, 30), titulo: texto(x.titulo, 120), detalle: texto(x.detalle, 300),
      puesto: texto(x.puesto, 40), estado: ESTADOS_TURNO.includes(x.estado) ? x.estado : 'pendiente',
      monto: monto(x.monto), cobrado: x.cobrado === true, metodo: texto(x.metodo, 30),
    });
  }
  return { desde: dia(o.desde), hasta: dia(o.hasta), turnos };
}

function caja(d) {
  const o = objeto(d); if (!o) return null;
  const movimientos = [];
  for (const m of lista(o.movimientos, MAX.movimientos)) {
    const x = objeto(m); if (!x) continue;
    const f = dia(x.fecha); if (!f) continue;
    movimientos.push({ fecha: f, tipo: x.tipo === 'gasto' ? 'gasto' : 'ingreso', monto: Math.abs(monto(x.monto)), categoria: texto(x.categoria, 60), detalle: texto(x.detalle, 160), metodo: texto(x.metodo, 30), origen: texto(x.origen, 20) });
  }
  const r = objeto(o.resumen) || {};
  const ingresos = monto(r.ingresos); const gastos = monto(r.gastos);
  return { mes: mes(o.mes), resumen: { ingresos, gastos, resultado: Math.round((ingresos - gastos) * 100) / 100 }, movimientos };
}

function clientes(d) {
  const o = objeto(d); if (!o) return null;
  const cl = [];
  for (const c of lista(o.clientes, MAX.clientes)) { const x = objeto(c); if (!x) continue; const nombre = texto(x.nombre, 80); const telefono = texto(x.telefono, 30); if (nombre || telefono) cl.push({ nombre, telefono }); }
  const de = [];
  for (const c of lista(o.deudores, MAX.deudores)) {
    const x = objeto(c); if (!x) continue; const saldo = num(x.saldo); if (saldo === null || saldo <= 0) continue;
    de.push({ nombre: texto(x.nombre, 80), telefono: texto(x.telefono, 30), saldo, dias: Math.max(0, Math.min(36500, parseInt(x.dias, 10) || 0)) });
  }
  return { clientes: cl, deudores: de, totalDeben: monto(o.totalDeben) };
}

function catalogo(d) {
  const o = objeto(d); if (!o) return null;
  const productos = [];
  for (const p of lista(o.productos, MAX.productos)) {
    const x = objeto(p); if (!x) continue; const nombre = texto(x.nombre, 120); if (!nombre) continue;
    const stock = parseInt(x.stock, 10);
    productos.push({ nombre, precio: Math.max(0, monto(x.precio)), moneda: texto(x.moneda, 6) || 'ARS', categoria: texto(x.categoria, 60), stock: Number.isFinite(stock) && stock >= 0 ? stock : -1, disponible: x.disponible !== false, codigo: texto(x.codigo, 40) });
  }
  return { productos };
}

const SANEADORES = { agenda, caja, clientes, catalogo };

// → el contenido limpio de ese tipo, o null si no es válido (un tipo desconocido también devuelve null).
function sanearDatos(tipo, datos) { return TIPOS.includes(tipo) ? SANEADORES[tipo](datos) : null; }

// Huella estable del contenido (para no volver a guardar lo que no cambió).
function huella(limpio) { return require('crypto').createHash('sha256').update(JSON.stringify(limpio)).digest('hex'); }

module.exports = { TIPOS, MAX, sanearDatos, huella };
