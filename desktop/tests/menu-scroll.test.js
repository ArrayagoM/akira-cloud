// tests/menu-scroll.test.js — el menú lateral recuerda dónde estaba al cambiar de perfil y deja a la vista la pantalla actual
// (frontend/src/lib/menuScroll.js, usado por frontend/src/components/Layout.jsx)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', f)).href);

(async () => {
  console.log('\n[menu-scroll] Tests:');
  const { guardarScrollMenu, leerScrollMenu, scrollParaVerItem } = await lib('menuScroll.js');

  // ── el valor recordado (sobrevive a que el menú se desmonte y se vuelva a montar al cambiar de perfil) ──
  assert(leerScrollMenu() === 0, 'sin haber tocado el menú, arranca arriba (0)');
  guardarScrollMenu(340.4);
  assert(leerScrollMenu() === 340, 'recuerda dónde estaba el menú (redondeado)');
  guardarScrollMenu(-5); assert(leerScrollMenu() === 0, 'un valor negativo vuelve a 0');
  guardarScrollMenu(NaN); assert(leerScrollMenu() === 0, 'un valor inválido vuelve a 0 (no rompe el menú)');
  guardarScrollMenu(undefined); assert(leerScrollMenu() === 0, 'sin valor: 0');

  // ── ítem activo a la vista: menú de 500 px de alto, ítems de 40 px ──
  const base = { altoVisible: 500, itemAlto: 40 };
  assert(scrollParaVerItem({ ...base, actual: 0, itemTop: 100 }) === 0, 'un ítem que ya se ve no mueve el menú');
  assert(scrollParaVerItem({ ...base, actual: 300, itemTop: 600 }) === 300, 'un ítem visible en el medio tampoco mueve el menú (queda donde estaba)');
  // Caja está abajo de todo: el menú se resetea a 0 al cambiar de perfil y Caja (top 900) queda fuera de la vista
  assert(scrollParaVerItem({ ...base, actual: 0, itemTop: 900 }) === 900 + 40 + 12 - 500, 'Caja abajo de todo con el menú arriba: el menú baja lo justo para que se vea');
  assert(scrollParaVerItem({ ...base, actual: 400, itemTop: 100 }) === 88, 'un ítem tapado por arriba: el menú sube lo justo');
  assert(scrollParaVerItem({ ...base, actual: 0, itemTop: 5 }) === 0, 'un ítem pegado al borde de arriba no da scroll negativo');
  assert(scrollParaVerItem({ ...base, actual: 200, itemTop: 200 + 500 - 40 - 12 }) === 200, 'justo en el borde de abajo con aire: no se mueve');
  assert(scrollParaVerItem({ ...base, actual: 200, itemTop: 200 + 500 - 40 - 11 }) === 201, 'a 1 px de quedar tapado por abajo: se corrige');

  // ── datos raros (menú todavía sin medidas, ítem inexistente): no se mueve nada ni se rompe ──
  assert(scrollParaVerItem({ actual: 120, altoVisible: 0, itemTop: 900, itemAlto: 40 }) === 120, 'menú sin alto medido (oculto): se deja como estaba');
  assert(scrollParaVerItem({ actual: 120, altoVisible: 500, itemTop: 900, itemAlto: 0 }) === 120, 'ítem sin alto: se deja como estaba');
  assert(scrollParaVerItem({ actual: undefined, altoVisible: 500, itemTop: 10, itemAlto: 40 }) === 0, 'scroll actual inválido: se trata como 0');
  assert(scrollParaVerItem({ actual: NaN, altoVisible: NaN, itemTop: NaN, itemAlto: NaN }) === 0, 'todo inválido: 0, sin NaN');

  // ── el escenario real: estoy en Caja, cambio de perfil, el menú vuelve a montarse ──
  guardarScrollMenu(460);                       // el menú estaba bajado hasta Caja
  const alVolver = leerScrollMenu();            // al montarse se restaura el valor guardado
  assert(alVolver === 460 && scrollParaVerItem({ ...base, actual: alVolver, itemTop: 900 }) === alVolver, 'después de cambiar de perfil el menú vuelve a donde estaba y Caja se sigue viendo (no hay que bajar de nuevo)');

  console.log('✅ menu-scroll: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
