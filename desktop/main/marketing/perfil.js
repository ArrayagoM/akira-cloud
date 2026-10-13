// main/marketing/perfil.js
// Cómo vende el negocio, para que el equipo de marketing hable el idioma correcto: al público (minorista), por mayor (a comercios y
// empresas, "para los que venden en cantidad") o las dos cosas. Incluye las condiciones comerciales que carga el dueño (pedido mínimo,
// escalas, plazos, zonas de entrega): los especialistas usan SOLO esas condiciones, nunca inventan escalas de precios ni mínimos.
'use strict';

const fs = require('fs');
const path = require('path');

const TIPOS = { minorista: 'Al público', mayorista: 'Por mayor (a comercios y empresas)', ambos: 'Las dos' };
const MAX_CONDICIONES = 600;
const archivo = (dir) => path.join(dir, 'marketing.json');
const limpiar = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

function leer(dir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(dir), 'utf8')); } catch { /* sin configurar */ }
  return { tipoVenta: TIPOS[j.tipoVenta] ? j.tipoVenta : 'minorista', condiciones: limpiar(j.condiciones, MAX_CONDICIONES) };
}

// → { ok, perfil } | { ok:false, error }
function guardar(dir, b = {}) {
  const actual = leer(dir);
  if (b.tipoVenta !== undefined && !TIPOS[b.tipoVenta]) return { ok: false, error: 'Elegí cómo vendés: al público, por mayor o las dos.' };
  if (b.condiciones !== undefined && typeof b.condiciones !== 'string') return { ok: false, error: 'Las condiciones tienen que ser texto.' };
  if (typeof b.condiciones === 'string' && b.condiciones.length > MAX_CONDICIONES) return { ok: false, error: `Las condiciones son demasiado largas (máximo ${MAX_CONDICIONES} letras).` };
  const nuevo = { tipoVenta: b.tipoVenta ?? actual.tipoVenta, condiciones: b.condiciones !== undefined ? limpiar(b.condiciones, MAX_CONDICIONES) : actual.condiciones };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(archivo(dir), JSON.stringify(nuevo));
  return { ok: true, perfil: nuevo };
}

const vendePorMayor = (p) => p?.tipoVenta === 'mayorista' || p?.tipoVenta === 'ambos';

module.exports = { leer, guardar, vendePorMayor, TIPOS, MAX_CONDICIONES };
