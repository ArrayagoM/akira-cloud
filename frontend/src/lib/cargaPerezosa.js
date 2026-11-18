// lib/cargaPerezosa.js
// Carga diferida de pantallas (React.lazy) con una red de seguridad: si el navegador tiene abierta una versión vieja de la web
// y entre tanto se publicó una nueva, el archivo de la pantalla que pide ya no existe ("Failed to fetch dynamically imported
// module") y la pantalla quedaría rota. En ese caso se recarga la página UNA vez (trae la versión nueva); si vuelve a fallar
// se muestra el error de siempre. Sin dependencias de React: probado en desktop/tests/carga-perezosa.test.js.

const CLAVE = 'akira_recarga_por_version';
const VENTANA_MS = 60_000; // no se recarga más de una vez por minuto (evita un bucle si el archivo de verdad no está)

export function esErrorDeCarga(err) {
  const m = String((err && err.message) || err || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk .* failed/i.test(m);
}

// ¿Pasó el tiempo suficiente desde la última recarga automática?
export function puedeRecargar(ultima, ahora) {
  const u = Number(ultima);
  return !Number.isFinite(u) || u <= 0 || ahora - u > VENTANA_MS;
}

export function conReintentoDeCarga(importador) {
  return importador().catch((err) => {
    if (esErrorDeCarga(err)) {
      try {
        const ahora = Date.now();
        if (puedeRecargar(sessionStorage.getItem(CLAVE), ahora)) {
          sessionStorage.setItem(CLAVE, String(ahora));
          window.location.reload();
          return new Promise(() => {}); // mientras recarga se sigue viendo la pantalla de carga
        }
      } catch { /* sin sessionStorage: se muestra el error */ }
    }
    throw err;
  });
}
