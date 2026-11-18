// lib/menuScroll.js
// Posición del menú lateral. Al cambiar de perfil (pantalla de PINs) toda la app se desmonta y el menú volvía a quedar arriba del todo:
// quien estaba en una pantalla del final de la lista (por ejemplo Caja) tenía que volver a bajar. Acá se recuerda dónde estaba el menú
// y se asegura que el ítem de la pantalla actual quede a la vista. Funciones puras (salvo el valor recordado): probadas en desktop/tests/menu-scroll.test.js.

// Vive en el módulo: sobrevive a que el menú se desmonte y se vuelva a montar dentro de la misma ventana.
let guardado = 0;

export function guardarScrollMenu(valor) {
  guardado = Number.isFinite(valor) && valor > 0 ? Math.round(valor) : 0;
}

export function leerScrollMenu() {
  return guardado;
}

// Devuelve el scrollTop con el que el ítem activo queda visible. Si ya se ve entero (con `margen` de aire), devuelve `actual` sin tocarlo.
//   actual:       scrollTop actual del menú
//   altoVisible:  alto visible del menú (clientHeight)
//   itemTop:      posición del ítem dentro del contenido scrolleable (no de la pantalla)
//   itemAlto:     alto del ítem
export function scrollParaVerItem({ actual, altoVisible, itemTop, itemAlto, margen = 12 }) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const act = Math.max(0, n(actual)); const alto = n(altoVisible); const top = n(itemTop); const h = n(itemAlto);
  if (alto <= 0 || h <= 0) return act;
  if (top - margen < act) return Math.max(0, Math.round(top - margen));                 // el ítem quedó tapado por arriba
  if (top + h + margen > act + alto) return Math.max(0, Math.round(top + h + margen - alto)); // el ítem quedó tapado por abajo
  return act;
}
