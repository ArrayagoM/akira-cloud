// tests/resumen-ver-ui.test.js — "Elegir qué ver" del resumen del negocio: lógica de la pantalla (frontend/src/lib/resumenVer.js)
// y comprobación de que la web y la página del celular lo usan y no rellenan con ceros lo que no llegó.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

(async () => {
  console.log('\n[resumen-ver-ui] Tests:');
  const R = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/lib/resumenVer.js')).href);
  const E = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/lib/estadoMovil.js')).href);
  const disp = [{ id: 'mensajes' }, { id: 'turnos' }, { id: 'caja' }, { id: 'deudas' }, { id: 'clientes' }, { id: 'documentos' }];

  assert(R.alternarGrupo(['mensajes', 'caja'], 'turnos', disp).join() === 'mensajes,turnos,caja', 'tocar un dato apagado lo agrega, en el orden de siempre');
  assert(R.alternarGrupo(['mensajes', 'turnos', 'caja'], 'turnos', disp).join() === 'mensajes,caja', 'tocar un dato encendido lo saca');
  assert(R.alternarGrupo(['caja'], 'caja', disp) === null, 'no deja sacar el último dato: tiene que verse al menos uno');
  const orig = ['mensajes', 'caja'];
  R.alternarGrupo(orig, 'turnos', disp);
  assert(orig.join() === 'mensajes,caja', 'no modifica la lista original');
  assert(R.alternarGrupo(['caja'], 'inventado', disp).join() === 'caja', 'un dato que no existe se ignora');
  assert(R.alternarGrupo(undefined, 'caja', disp).join() === 'caja', 'sin lista previa arranca con el dato tocado');
  assert(R.resumenDeEleccion(disp.map((d) => d.id), disp) === 'Todo' && R.resumenDeEleccion(['caja', 'turnos'], disp) === '2 de 6' && R.resumenDeEleccion([], []) === 'Todo', 'el texto del botón: "Todo" o "2 de 6"');
  assert(/Todavía no llegó/.test(R.AVISO_SIN_DATO), 'hay un aviso para cuando lo elegido no llegó de la PC');

  // las pantallas del celular y del .apk solo listan lo que llegó (el servidor ya filtra)
  const filtrado = { mes: '2026-11', ingresosMes: 250000, gastosMes: 90000 };
  assert(E.lineasResumen(filtrado).map((l) => l.clave).join() === 'ingresosMes,gastosMes', 'la página del celular lista solo ingresos y gastos si eso es lo elegido (sin ceros inventados)');
  assert(E.lineasResumen({ mes: '2026-11' }).length === 0, 'si no llegó ningún dato, no hay líneas');
  const movil = require('../../mobile/src/estado');
  assert(movil.lineasResumen(filtrado).map((l) => l.clave).join() === 'ingresosMes,gastosMes', 'la app nativa (.apk) también lista solo lo que llegó');

  // el código de las pantallas
  const panel = leer('frontend', 'src', 'pages', 'CuentaPanel.jsx');
  assert(/<ElegirResumen alCambiar=\{cargarEquipos\}/.test(panel), 'el panel de la web muestra "Elegir qué ver" y vuelve a cargar al cambiar');
  assert(/\.filter\(\(\[claves\]\) => claves\.every\(\(k\) => rs\[k\] !== undefined && rs\[k\] !== null\)\)/.test(panel), 'el panel de la web oculta las tarjetas de datos que no llegaron');
  assert(/\['ingresosMes', 'gastosMes'\], TrendingUp, 'Resultado del mes'/.test(panel), '"Resultado del mes" exige que lleguen ingresos Y gastos (si no, no se calcula con la mitad)');
  const cel = leer('frontend', 'src', 'pages', 'CelularPage.jsx');
  assert(/<ElegirResumen alCambiar=\{recargar\}/.test(cel) && /<PestañaResumen estado=\{estado\} recargar=\{refrescar\}/.test(cel), 'la página del celular también lo muestra');
  const comp = leer('frontend', 'src', 'components', 'ElegirResumen.jsx');
  assert(/api\.get\('\/auth\/resumen-ver'\)/.test(comp) && /api\.put\('\/auth\/resumen-ver', \{ grupos: nuevos \}\)/.test(comp), 'el componente lee y guarda en /auth/resumen-ver');
  assert(/setDatos\(antes\)/.test(comp), 'si no se pudo guardar, vuelve a lo anterior y avisa');
  console.log('✅ resumen-ver-ui: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
