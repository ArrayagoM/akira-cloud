// services/bot/catalogo-busqueda.js
// Cómo el bot ve el catálogo de productos: búsqueda tolerante (sin tildes, plurales, varias palabras), cómo se muestran el precio y el stock,
// y el resumen que va dentro del prompt (con tope, para que un catálogo grande no se coma toda la memoria de la IA). Lógica pura.
//
// Antes: la búsqueda exigía que TODA la frase del cliente estuviera dentro del nombre ("remera roja talle M" no encontraba "Remera"),
// distinguía tildes ("cafe" no encontraba "Café"), un producto sin precio salía como "$0" y uno agotado salía como disponible.
'use strict';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'con', 'sin', 'para', 'por', 'que', 'tenes', 'tienen', 'hay', 'quiero', 'busco', 'necesito', 'precio', 'cuanto', 'sale', 'cuesta', 'me', 'te', 'y', 'o', 'en', 'al', 'lo', 'mi', 'su']);
const palabras = (s) => norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (t.length > 3 && t.endsWith('es') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));

// Disponible salvo que el dueño lo haya desmarcado (los importados desde Excel o WhatsApp Business pueden no traer el campo).
const disponible = (p) => !!p && p.disponible !== false && String(p.nombre || '').trim() !== '';
const conPrecio = (p) => Number(p.precio) > 0;
const enStock = (p) => !(Number(p.stock) === 0); // stock -1 = sin control; 0 = agotado
const pesos = (n) => `$${Number(n).toLocaleString('es-AR')}`;

const precioTexto = (p) => (conPrecio(p) ? `${pesos(p.precio)}${p.moneda && p.moneda !== 'ARS' ? ` ${p.moneda}` : ''}` : 'precio a consultar');
const stockTexto = (p) => (Number(p.stock) === 0 ? 'SIN STOCK por ahora' : Number(p.stock) > 0 ? `quedan ${p.stock}` : '');

// Cuántas palabras de la búsqueda aparecen en el producto (el nombre pesa más que la descripción o la categoría).
function puntaje(p, qp) {
  const nom = palabras(p.nombre); const resto = palabras(`${p.descripcion || ''} ${p.categoria || ''}`);
  const coincide = (lista, t) => lista.some((w) => w === t || (t.length >= 3 && (w.startsWith(t) || t.startsWith(w))));
  let s = 0; let halladas = 0;
  for (const t of qp) { if (coincide(nom, t)) { s += 3; halladas++; } else if (coincide(resto, t)) { s += 1; halladas++; } }
  return { s, halladas };
}

// → productos que sirven para la consulta, mejores primero. Sin búsqueda ni categoría devuelve los primeros del catálogo.
function buscar(catalogo, { query = '', categoria = '' } = {}, { max = 8 } = {}) {
  const lista = (catalogo || []).filter(disponible);
  const cat = norm(categoria);
  const base = cat ? lista.filter((p) => norm(p.categoria).includes(cat)) : lista;
  const qp = palabras(query);
  if (!qp.length) return base.slice(0, max);
  const puntuados = base.map((p) => ({ p, ...puntaje(p, qp) })).filter((x) => x.halladas > 0);
  // Si alguna coincide con TODAS las palabras, solo esas (búsqueda precisa); si no, las que coinciden con más palabras.
  const todas = puntuados.filter((x) => x.halladas === qp.length);
  const pool = todas.length ? todas : puntuados.filter((x) => x.halladas === Math.max(0, ...puntuados.map((y) => y.halladas)));
  return pool.sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.p);
}

// Respuesta de la herramienta consultar_catalogo.
function textoResultados(productos) {
  return productos.map((p) => `*${p.nombre}* — ${precioTexto(p)}${p.descripcion ? `\n${p.descripcion}` : ''}${p.categoria ? ` [${p.categoria}]` : ''}${stockTexto(p) ? `\n${stockTexto(p)}` : ''}`).join('\n\n');
}

// Lo que va dentro del prompt. Con más de `max` productos solo se listan los primeros y se avisa que hay más (el bot los busca con la herramienta).
function resumenParaPrompt(catalogo, { max = 40 } = {}) {
  const lista = (catalogo || []).filter(disponible);
  if (!lista.length) return '';
  const linea = (p) => `• *${p.nombre}*: ${precioTexto(p)}${p.categoria ? ` [${p.categoria}]` : ''}${p.descripcion ? ` — ${String(p.descripcion).slice(0, 90)}` : ''}${stockTexto(p) ? ` (${stockTexto(p)})` : ''}`;
  const vistos = lista.slice(0, max).map(linea).join('\n');
  if (lista.length <= max) return vistos;
  const cats = [...new Set(lista.map((p) => String(p.categoria || '').trim()).filter(Boolean))].slice(0, 12);
  return `${vistos}\n… y ${lista.length - max} productos más${cats.length ? ` (categorías: ${cats.join(', ')})` : ''}. Para cualquier producto que no esté en esta lista, usá consultar_catalogo.`;
}

module.exports = { norm, palabras, disponible, enStock, precioTexto, stockTexto, buscar, textoResultados, resumenParaPrompt };
