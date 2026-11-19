// lib/resumenVer.js — "Elegir qué ver" del resumen del negocio (lógica sin pantalla, para poder probarla).
// La lista de datos y su orden vienen del servidor (GET /auth/resumen-ver → disponibles); acá solo se decide qué pasa al tocar uno.

// Tocar un dato: lo agrega o lo saca. Si al sacarlo no quedaría ninguno devuelve null (siempre tiene que verse al menos uno).
export function alternarGrupo(actuales, id, disponibles) {
  const orden = (disponibles || []).map((d) => d.id);
  if (!orden.includes(id)) return actuales;
  const hay = new Set(actuales || []);
  if (hay.has(id)) { if (hay.size <= 1) return null; hay.delete(id); } else hay.add(id);
  return orden.filter((x) => hay.has(x));
}

// Texto corto de lo que se está viendo ("Todo" o "3 de 6").
export function resumenDeEleccion(grupos, disponibles) {
  const total = (disponibles || []).length;
  const n = (grupos || []).length;
  return !total || n >= total ? 'Todo' : `${n} de ${total}`;
}

// Mensaje para cuando lo elegido todavía no llegó de la PC (p. ej. una PC con una versión vieja que no manda ese dato).
export const AVISO_SIN_DATO = 'Todavía no llegó ninguno de los datos que elegiste. Probá con otros o abrí Akira en la PC para que los envíe.';
