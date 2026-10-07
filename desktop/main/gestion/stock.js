// gestion/stock.js
// Stock del catálogo: descontar lo vendido, devolverlo si se cancela y avisar cuando queda poco.
// stock < 0 = el producto no controla stock (siempre disponible). Se opera sobre la lista del catálogo (Config.catalogo).
'use strict';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const UMBRAL_POCO_STOCK = 3;

// Resta `items` ([{nombre, cantidad}]) del catálogo. → { catalogo, bajos: [{nombre, stock}], faltantes: [{nombre, pedido, habia}] }
// Nunca deja stock negativo: si se vendió más de lo que había queda en 0 y se informa en "faltantes".
function descontar(catalogo, items) {
  const bajos = []; const faltantes = [];
  const nuevo = (catalogo || []).map((p) => ({ ...p }));
  for (const it of items || []) {
    const p = nuevo.find((x) => norm(x.nombre) === norm(it.nombre));
    if (!p || !(p.stock >= 0)) continue; // no existe o no controla stock
    if (it.cantidad > p.stock) faltantes.push({ nombre: p.nombre, pedido: it.cantidad, habia: p.stock });
    p.stock = Math.max(0, p.stock - it.cantidad);
    if (p.stock <= UMBRAL_POCO_STOCK) bajos.push({ nombre: p.nombre, stock: p.stock });
  }
  return { catalogo: nuevo, bajos, faltantes };
}

// Devuelve unidades al stock (cancelación de un pedido ya descontado).
function reponer(catalogo, items) {
  const nuevo = (catalogo || []).map((p) => ({ ...p }));
  for (const it of items || []) {
    const p = nuevo.find((x) => norm(x.nombre) === norm(it.nombre));
    if (p && p.stock >= 0) p.stock += it.cantidad;
  }
  return nuevo;
}

// Lectura y escritura sobre el modelo Config (con la misma forma que usa el resto de la app).
async function descontarEnConfig(Config, userId, items) {
  const cfg = await Config.findOne({ userId: String(userId) }).lean();
  const r = descontar(cfg?.catalogo || [], items);
  if (r.catalogo.length) await Config.findOneAndUpdate({ userId: String(userId) }, { $set: { catalogo: r.catalogo } });
  return r;
}
async function reponerEnConfig(Config, userId, items) {
  const cfg = await Config.findOne({ userId: String(userId) }).lean();
  const nuevo = reponer(cfg?.catalogo || [], items);
  if (nuevo.length) await Config.findOneAndUpdate({ userId: String(userId) }, { $set: { catalogo: nuevo } });
  return nuevo;
}

const textoPocoStock = (bajos) => (bajos?.length ? `📉 Poco stock: ${bajos.map((b) => `${b.nombre} (${b.stock === 0 ? 'se agotó' : `quedan ${b.stock}`})`).join(', ')}.` : '');

module.exports = { descontar, reponer, descontarEnConfig, reponerEnConfig, textoPocoStock, UMBRAL_POCO_STOCK };
