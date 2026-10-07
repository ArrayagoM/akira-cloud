// gestion/ventas.js
// Ventas rápidas del mostrador: el dueño toca los productos, elige cómo le pagaron y listo. Descuenta el stock, suma el ingreso
// a la Caja y avisa si quedó poco. Se puede anular (devuelve el stock y quita el ingreso). Idempotente por `clave` (doble toque).
// Los precios salen del Catálogo; el dueño puede cambiarlos a mano para esa venta. Probado en tests/ventas.test.js.
'use strict';

const stock = require('./stock');
const caja = require('./caja');

const MAX_LINEAS = 40;
const MAX_CANTIDAD = 9999;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Valida el pedido de venta contra el catálogo. → { ok, lineas, total, faltantes } | { ok:false, error }
// items: [{ nombre, cantidad, precio? }]. Si el nombre no está en el catálogo es una "venta libre" (hay que poner el precio).
function armar(catalogo, items, { descuentoPct = 0 } = {}) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: 'Agregá al menos un producto.' };
  if (items.length > MAX_LINEAS) return { ok: false, error: `Máximo ${MAX_LINEAS} productos por venta.` };
  const lineas = []; const faltantes = [];
  const pedidos = new Map(); // total por producto (por si el mismo viene repetido)
  for (const it of items) {
    const nombre = String(it?.nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!nombre) return { ok: false, error: 'Hay un producto sin nombre.' };
    const cantidad = Math.floor(Number(it.cantidad));
    if (!(cantidad >= 1) || cantidad > MAX_CANTIDAD) return { ok: false, error: `La cantidad de "${nombre}" no es válida.` };
    const p = (catalogo || []).find((x) => norm(x.nombre) === norm(nombre));
    const manual = it.precio !== undefined && it.precio !== null && it.precio !== '';
    const precio = manual ? redondear(it.precio) : (p ? redondear(p.precio) : NaN);
    if (!(precio >= 0) || precio > 1e9) return { ok: false, error: p ? `El precio de "${nombre}" no es válido.` : `"${nombre}" no está en el catálogo: indicá su precio.` };
    const nombreFinal = p ? p.nombre : nombre;
    lineas.push({ nombre: nombreFinal, precio, cantidad, enCatalogo: !!p });
    if (p && p.stock >= 0) pedidos.set(norm(nombreFinal), (pedidos.get(norm(nombreFinal)) || 0) + cantidad);
  }
  for (const [k, qty] of pedidos) {
    const p = catalogo.find((x) => norm(x.nombre) === k);
    if (qty > p.stock) faltantes.push({ nombre: p.nombre, pedido: qty, habia: p.stock });
  }
  const bruto = redondear(lineas.reduce((s, l) => s + l.precio * l.cantidad, 0));
  const pct = Math.min(100, Math.max(0, Number(descuentoPct) || 0));
  const descuento = redondear(bruto * pct / 100);
  const total = redondear(bruto - descuento);
  if (!(total > 0)) return { ok: false, error: 'El total tiene que ser mayor a cero.' };
  return { ok: true, lineas, bruto, descuento, descuentoPct: pct, total, faltantes };
}

// Registra la venta. Si falta stock y no se pidió `forzar`, no hace nada y devuelve `faltantes` (409).
// → { ok, yaEstaba, venta, bajos, faltantes } | { ok:false, error, faltantes? }
async function vender({ Config, Movimiento }, userId, body = {}, ahora = new Date()) {
  const uid = String(userId);
  const clave = body.clave ? String(body.clave).slice(0, 60) : '';
  if (clave) {
    const previa = await Movimiento.findOne({ userId: uid, origen: 'venta', ventaClave: clave }).lean();
    if (previa) return { ok: true, yaEstaba: true, venta: previa, bajos: [], faltantes: [] };
  }
  const cfg = await Config.findOne({ userId: uid }).lean();
  const a = armar(cfg?.catalogo || [], body.items, { descuentoPct: body.descuentoPct });
  if (!a.ok) return a;
  if (a.faltantes.length && !body.forzar) return { ok: false, error: 'No alcanza el stock de: ' + a.faltantes.map((f) => `${f.nombre} (quedan ${f.habia})`).join(', ') + '.', faltantes: a.faltantes, sinStock: true };
  const metodo = caja.METODOS.includes(body.metodo) ? body.metodo : 'efectivo';
  const r = await stock.descontarEnConfig(Config, uid, a.lineas);
  const resumen = a.lineas.map((l) => `${l.cantidad > 1 ? `${l.cantidad}× ` : ''}${l.nombre}`).join(', ');
  const venta = await Movimiento.create({
    userId: uid, origen: 'venta', ventaClave: clave || undefined, tipo: 'ingreso', monto: a.total, fecha: caja.fechaLocal(ahora), metodo, categoria: 'Ventas',
    descripcion: `Venta: ${resumen}`.slice(0, 200), cliente: String(body.cliente || '').replace(/\s+/g, ' ').trim().slice(0, 80), documentoId: null,
    items: a.lineas, descuento: a.descuento, por: String(body.por || '').slice(0, 40), sucursalId: String(body.sucursalId || '').slice(0, 40),
  });
  return { ok: true, yaEstaba: false, venta, bajos: r.bajos, faltantes: r.faltantes };
}

// Anula una venta: devuelve el stock y quita el ingreso. → { ok } | { ok:false, error }
async function anular({ Config, Movimiento }, userId, ventaId) {
  const uid = String(userId);
  const v = await Movimiento.findOne({ _id: ventaId, userId: uid }).lean();
  if (!v || v.origen !== 'venta') return { ok: false, error: 'Venta no encontrada' };
  const borrada = await Movimiento.deleteOne({ _id: ventaId, userId: uid });
  if (!borrada.deletedCount) return { ok: true, yaEstaba: true }; // otro aviso ya la anuló: no reponer dos veces
  await stock.reponerEnConfig(Config, uid, v.items || []);
  return { ok: true };
}

module.exports = { armar, vender, anular, MAX_LINEAS };
