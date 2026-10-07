// services/bot/pedidos.service.js
// Pedidos con carrito por WhatsApp: el cliente arma su pedido charlando (agregar / quitar productos), el bot calcula el total
// y genera el link de pago. Lógica PURA: los precios y el stock SIEMPRE salen del catálogo del negocio (nunca de lo que
// diga la IA ni el cliente). Probada en tests/pedidos.test.js.
'use strict';

const MAX_LINEAS = 15;
const MAX_CANTIDAD = 50;

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const palabras = (s) => norm(s).split(' ').filter((t) => t.length > 1).map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const vendibles = (catalogo) => (catalogo || []).filter((p) => p && p.disponible !== false && Number(p.precio) > 0 && String(p.nombre || '').trim());

// → { ok: true, producto } | { ok: false, motivo: 'no-encontrado' | 'ambiguo', opciones: [nombres] }
function buscarProducto(catalogo, texto) {
  const lista = vendibles(catalogo);
  const q = norm(texto);
  if (!q) return { ok: false, motivo: 'no-encontrado', opciones: [] };
  const exacto = lista.filter((p) => norm(p.nombre) === q);
  if (exacto.length === 1) return { ok: true, producto: exacto[0] };
  const qp = palabras(texto);
  const cand = lista.filter((p) => { const np = palabras(p.nombre); return qp.length > 0 && qp.every((t) => np.some((w) => w === t || w.startsWith(t) || t.startsWith(w))); });
  if (cand.length === 1) return { ok: true, producto: cand[0] };
  if (cand.length > 1) {
    // si uno es contenido exacto de la búsqueda (ej. "shampoo" y "shampoo reparador"), gana el nombre más corto cuando coincide por completo
    const igual = cand.filter((p) => palabras(p.nombre).length === qp.length);
    if (igual.length === 1) return { ok: true, producto: igual[0] };
    return { ok: false, motivo: 'ambiguo', opciones: cand.slice(0, 5).map((p) => p.nombre) };
  }
  return { ok: false, motivo: 'no-encontrado', opciones: lista.slice(0, 5).map((p) => p.nombre) };
}

const enCarrito = (carrito, nombre) => (carrito || []).find((i) => norm(i.nombre) === norm(nombre));

// Suma `cantidad` del producto. Respeta stock (stock < 0 = sin control) y límites. → { carrito, error? , agregado }
function agregar(carrito, producto, cantidad = 1) {
  const n = Math.floor(Number(cantidad));
  if (!Number.isFinite(n) || n < 1) return { carrito: carrito || [], error: 'La cantidad tiene que ser al menos 1.' };
  const actual = enCarrito(carrito, producto.nombre);
  const nuevaCant = (actual ? actual.cantidad : 0) + n;
  if (nuevaCant > MAX_CANTIDAD) return { carrito: carrito || [], error: `Por pedido podemos tomar hasta ${MAX_CANTIDAD} unidades de cada producto.` };
  if (producto.stock >= 0 && nuevaCant > producto.stock) {
    return { carrito: carrito || [], error: producto.stock === 0 ? `Por ahora no tenemos stock de ${producto.nombre}.` : `Solo nos quedan ${producto.stock} de ${producto.nombre}${actual ? ` (ya tenés ${actual.cantidad} en el pedido)` : ''}.` };
  }
  if (!actual && (carrito || []).length >= MAX_LINEAS) return { carrito: carrito || [], error: `El pedido puede tener hasta ${MAX_LINEAS} productos distintos.` };
  const lista = actual ? carrito.map((i) => (i === actual ? { ...i, cantidad: nuevaCant, precio: redondear(producto.precio) } : i)) : [...(carrito || []), { nombre: producto.nombre, precio: redondear(producto.precio), cantidad: n }];
  return { carrito: lista, agregado: n };
}

// Quita `cantidad` (o todo si no se indica) → { carrito, error? }
function quitar(carrito, nombre, cantidad = null) {
  const item = enCarrito(carrito, nombre);
  if (!item) return { carrito: carrito || [], error: 'Ese producto no está en tu pedido.' };
  const n = cantidad == null ? item.cantidad : Math.floor(Number(cantidad));
  if (!Number.isFinite(n) || n < 1) return { carrito, error: 'La cantidad tiene que ser al menos 1.' };
  const resto = item.cantidad - n;
  return { carrito: resto > 0 ? carrito.map((i) => (i === item ? { ...i, cantidad: resto } : i)) : carrito.filter((i) => i !== item) };
}

const subtotal = (carrito) => redondear((carrito || []).reduce((s, i) => s + i.precio * i.cantidad, 0));
const unidades = (carrito) => (carrito || []).reduce((s, i) => s + i.cantidad, 0);
const pesos = (n) => '$' + Number(n).toLocaleString('es-AR', Number.isInteger(Number(n)) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function resumenTexto(carrito, { envio = 0 } = {}) {
  if (!carrito?.length) return 'Tu pedido está vacío.';
  const lineas = carrito.map((i) => `• ${i.cantidad} × ${i.nombre} — ${pesos(i.precio * i.cantidad)}`);
  const sub = subtotal(carrito);
  const extra = envio > 0 ? [`Envío: ${pesos(envio)}`] : [];
  return [...lineas, ...extra, `*Total: ${pesos(sub + (envio > 0 ? envio : 0))}*`].join('\n');
}

// Al confirmar: recalcula TODO desde el catálogo actual (precio y stock pueden haber cambiado desde que se agregó).
// → { ok, items, subtotal, problemas: [textos] }
function revalidar(carrito, catalogo) {
  const problemas = []; const items = [];
  for (const i of carrito || []) {
    const r = buscarProducto(catalogo, i.nombre);
    if (!r.ok) { problemas.push(`${i.nombre} ya no está disponible`); continue; }
    const p = r.producto;
    if (p.stock >= 0 && i.cantidad > p.stock) { problemas.push(p.stock === 0 ? `No queda stock de ${p.nombre}` : `De ${p.nombre} solo quedan ${p.stock}`); continue; }
    items.push({ nombre: p.nombre, precio: redondear(p.precio), cantidad: i.cantidad });
  }
  return { ok: problemas.length === 0 && items.length > 0, items, subtotal: subtotal(items), problemas };
}

const ENTREGAS = ['retiro', 'envio'];

module.exports = { buscarProducto, agregar, quitar, subtotal, unidades, resumenTexto, revalidar, vendibles, pesos, norm, ENTREGAS, MAX_LINEAS, MAX_CANTIDAD };
