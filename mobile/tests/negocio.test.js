// mobile/tests/negocio.test.js — pantalla "Negocio" del .apk (agenda, caja, clientes y catálogo que sube la PC): lógica sin pantalla.
'use strict';
const fs = require('fs');
const path = require('path');
const N = require('../src/negocio');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[mobile/negocio] Tests:');

// ── horas en Argentina (UTC-3) ──
assert(N.horaAR('2026-11-19T13:00:00.000Z') === '10:00' && N.horaAR('2026-11-19T02:30:00.000Z') === '23:30', 'la hora se muestra en hora argentina (UTC-3), también pasada la medianoche UTC');
assert(N.diaAR('2026-11-19T02:30:00.000Z') === '2026-11-18' && N.diaAR('2026-11-19T13:00:00.000Z') === '2026-11-19', 'un turno de las 23:30 pertenece al día argentino anterior');
assert(N.horaAR('basura') === '' && N.diaAR(null) === '', 'una fecha inválida no rompe');

// ── días ──
const hoy = '2026-11-19';
assert(N.etiquetaDia('2026-11-19', hoy) === 'Hoy · jueves 19/11' && N.etiquetaDia('2026-11-20', hoy) === 'Mañana · viernes 20/11' && N.etiquetaDia('2026-11-18', hoy) === 'Ayer · miércoles 18/11', 'etiquetas: hoy, mañana y ayer con el día de la semana');
assert(N.etiquetaDia('2026-11-23', hoy) === 'lunes 23/11' && N.etiquetaDia('2026-11-23', null) === 'lunes 23/11' && N.etiquetaDia('xx', hoy) === 'xx', 'otros días: solo el día y la fecha; una fecha rara se deja como viene');
assert(N.etiquetaMes('2026-11') === 'noviembre 2026' && N.etiquetaMes('') === '' && N.etiquetaMes('2026-13') === '', 'etiqueta del mes');

// ── agenda ──
const turnos = [
  { id: 'c', inicio: '2026-11-20T12:00:00.000Z', fin: '2026-11-20T13:00:00.000Z', cliente: 'Mañana', estado: 'pendiente', cobrado: false },
  { id: 'b', inicio: '2026-11-19T18:00:00.000Z', fin: '2026-11-19T19:00:00.000Z', cliente: 'Tarde', estado: 'confirmado', cobrado: true },
  { id: 'a', inicio: '2026-11-19T13:00:00.000Z', cliente: 'Mañana temprano', estado: 'confirmado', cobrado: false },
  { id: 'x', inicio: 'no-es-fecha', cliente: 'Roto' },
];
const dias = N.agruparTurnos(turnos, '2026-11-19T15:00:00.000Z');
assert(dias.length === 2 && dias[0].dia === '2026-11-19' && dias[0].esHoy === true && dias[0].etiqueta === 'Hoy · jueves 19/11', 'la agenda se agrupa por día y marca el de hoy');
assert(dias[0].turnos.map((t) => t.id).join() === 'a,b' && dias[0].turnos[0].hora === '10:00' && dias[0].turnos[0].hasta === '' && dias[0].turnos[1].hasta === '16:00', 'dentro del día van ordenados por hora, con hora de inicio y de fin');
assert(dias[1].etiqueta === 'Mañana · viernes 20/11' && !JSON.stringify(dias).includes('Roto'), 'el día siguiente se llama "Mañana" y un turno sin fecha válida no aparece');
assert(N.agruparTurnos(undefined, null).length === 0 && N.agruparTurnos([], null).length === 0, 'sin turnos → lista vacía');
assert(N.estadoTurno({ cobrado: true }).texto === 'Cobrado' && N.estadoTurno({ estado: 'pendiente' }).tono === 'aviso' && N.estadoTurno({ estado: 'confirmado' }).texto === 'Confirmado' && N.estadoTurno({ estado: 'cancelado' }).tono === 'error', 'estado del turno: cobrado, pendiente, confirmado, cancelado');

// ── caja ──
const grupos = N.agruparMovimientos([{ fecha: '2026-11-03', tipo: 'gasto', monto: 15000 }, { fecha: '2026-11-10', tipo: 'ingreso', monto: 12000 }, { fecha: '2026-11-10', tipo: 'gasto', monto: 500 }]);
assert(grupos.map((g) => g.fecha).join() === '2026-11-10,2026-11-03' && grupos[0].movimientos.length === 2, 'la caja se agrupa por fecha, la más reciente primero');
assert(N.pesos(12000) === '$' + (12000).toLocaleString('es-AR') && N.pesos('x') === '$0' && N.pesos(1234.6) === '$' + (1235).toLocaleString('es-AR'), 'los montos se muestran como pesos enteros');

// ── búsqueda ──
const clientes = [{ nombre: 'María Pérez', telefono: '5492241497226' }, { nombre: 'Juan Gómez', telefono: '2241000111' }, { nombre: 'Ana López', telefono: '' }];
assert(N.filtrarTexto(clientes, 'maria', ['nombre', 'telefono']).length === 1 && N.filtrarTexto(clientes, 'PEREZ', ['nombre']).length === 1, 'la búsqueda no distingue mayúsculas ni tildes');
assert(N.filtrarTexto(clientes, '2241', ['nombre', 'telefono']).length === 2 && N.filtrarTexto(clientes, 'juan 000', ['nombre', 'telefono']).length === 1, 'busca por teléfono y exige todas las palabras');
assert(N.filtrarTexto(clientes, '', ['nombre']).length === 3 && N.filtrarTexto(clientes, '   ', ['nombre']).length === 3 && N.filtrarTexto(null, 'x', ['nombre']).length === 0 && N.filtrarTexto(clientes, 'zzz', ['nombre']).length === 0, 'sin texto muestra todo; sin coincidencias, nada; sin lista no rompe');

// ── stock ──
assert(N.textoStock(-1, true).texto === 'Sin control de stock' && N.textoStock(0, true).tono === 'error' && N.textoStock(2, true).tono === 'aviso' && N.textoStock(12, true).texto === '12 en stock' && N.textoStock(5, false).texto === 'No disponible', 'estado del stock: sin control, sin stock, pocas unidades, normal, no disponible');

// ── datos viejos ──
assert(N.avisoViejo('2026-11-19T10:00:00.000Z', '2026-11-19T10:30:00.000Z') === null && /no estar al día/.test(N.avisoViejo('2026-11-18T10:00:00.000Z', '2026-11-19T10:30:00.000Z')) && N.avisoViejo('basura', null) === null, 'avisa que los datos pueden no estar al día solo si pasaron muchas horas sin novedades');
assert(N.SECCIONES.map((s) => s.id).join() === 'agenda,caja,clientes,catalogo', 'las cuatro secciones, en orden');

// ── cableado (comprobación de código) ──
const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
assert(/leerDatos = \(tipo\) => pedir\(`\/mobile\/datos\?tipo=\$\{encodeURIComponent\(tipo\)\}`\)/.test(leer('src', 'api.js')), 'api.js: lee /mobile/datos?tipo=…');
const app = leer('App.js');
assert(/id: 'negocio', etiqueta: 'Negocio'/.test(app) && /tab === 'negocio' && <Negocio \/>/.test(app), 'App.js: hay una pestaña "Negocio"');
assert(/leerDatos\(seccion\)/.test(leer('src', 'pantallas', 'Negocio.js')), 'la pantalla pide los datos de la sección elegida');
console.log('✅ mobile/negocio: OK');
