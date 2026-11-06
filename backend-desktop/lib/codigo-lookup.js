// lib/codigo-lookup.js
// Dado un código de barras, busca el nombre y la marca en Open Food Facts (base pública y gratuita, sobre todo alimentos y bebidas).
// Solo se manda el código (nada del negocio). Si no lo encuentra o hay un error, devuelve { encontrado:false }: el producto se carga a mano.
// Los datos son una SUGERENCIA para editar, nunca se guardan solos.
'use strict';

const URL_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const CAMPOS = 'product_name,product_name_es,generic_name_es,brands,categories,quantity';

const esCodigo = (c) => /^\d{6,14}$/.test(String(c || ''));
const quitarPrefijoIdioma = (s) => String(s || '').replace(/^[a-z]{2}:/i, '').trim();

// → { encontrado:false } | { encontrado:true, nombre, marca, categoria, cantidad }
async function buscarCodigo(codigo, { fetchFn = globalThis.fetch, timeoutMs = 4000 } = {}) {
  if (!esCodigo(codigo) || typeof fetchFn !== 'function') return { encontrado: false };
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(`${URL_BASE}/${encodeURIComponent(codigo)}.json?fields=${CAMPOS}`, { signal: ctrl.signal, headers: { 'User-Agent': 'AkiraCloud/1.0 (soporte@akiracloud.lat)' } });
    if (!r || !r.ok) return { encontrado: false };
    const j = await r.json();
    const p = j && j.status === 1 && j.product ? j.product : null;
    if (!p) return { encontrado: false };
    const base = String(p.product_name_es || p.product_name || p.generic_name_es || '').trim();
    if (!base) return { encontrado: false };
    const marca = String(p.brands || '').split(',')[0].trim();
    const cantidad = String(p.quantity || '').trim();
    const incluye = (txt) => base.toLowerCase().includes(txt.toLowerCase());
    const nombre = [base, marca && !incluye(marca) ? marca : '', cantidad && !incluye(cantidad) ? cantidad : ''].filter(Boolean).join(' ').slice(0, 120);
    const categoria = quitarPrefijoIdioma(String(p.categories || '').split(',')[0]).slice(0, 60);
    return { encontrado: true, nombre, marca, categoria, cantidad };
  } catch { return { encontrado: false }; } finally { clearTimeout(t); }
}

module.exports = { buscarCodigo, esCodigo };
