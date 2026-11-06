// lib/versionPc.js
// ¿La Akira de la PC es lo bastante nueva para una función? Sirve para avisarle al usuario en la app del celular
// cuando su PC tiene una versión vieja (por ejemplo la de Microsoft Store, que se actualiza más tarde) en vez de dejar
// que cargue productos que la PC nunca va a recibir. Función pura: probada en desktop/tests/version-pc.test.js.

// Primera versión de Akira (PC) que recibe productos cargados desde el celular.
export const VERSION_MIN_PRODUCTOS = '1.0.34';

const partes = (v) => String(v || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10));

// true si `version` >= `minima`. Si la versión no se conoce (vacía o rara) devuelve true: no se bloquea por desconocimiento.
export function versionAlcanza(version, minima) {
  const a = partes(version); const b = partes(minima);
  if (!a.length || a.some((n) => Number.isNaN(n))) return true;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0; const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}
