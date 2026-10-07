// tests/resumen-negocio.test.js — el resumen opcional del negocio solo admite contadores numéricos.
'use strict';
const { sanearResumen, sanearVersion, CAMPOS } = require('../lib/resumen-negocio');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[resumen-negocio] Tests:');

const ok = sanearResumen({ mensajesHoy: 12, turnosHoy: 3, turnosMes: 40, ingresosMes: 250000.456, gastosMes: 90000, teDeben: 13500, debes: 20000, clientes: 87, documentosPendientes: 2, mes: '2026-10' });
assert(ok && CAMPOS.every((k) => typeof ok[k] === 'number') && ok.ingresosMes === 250000.46 && ok.mes === '2026-10', 'acepta los contadores y redondea los importes a centavos');
assert(!('nombre' in (sanearResumen({ mensajesHoy: 1, nombre: 'Ana', telefono: '2241', conversacion: 'hola', clientesLista: ['Ana'] }) || {})), 'descarta cualquier campo que no sea un contador permitido (nombres, teléfonos, chats)');
assert(Object.keys(sanearResumen({ mensajesHoy: 1, telefono: '2241', x: { a: 1 } })).join() === 'mensajesHoy', 'del resto solo deja el contador permitido');
assert(sanearResumen({ mensajesHoy: -5, turnosHoy: 'abc', ingresosMes: Infinity, gastosMes: 1e15, teDeben: NaN }) === null, 'rechaza negativos, texto, infinitos y valores absurdos');
assert(sanearResumen({ mensajesHoy: '7' }).mensajesHoy === 7, 'acepta un número escrito como texto');
assert(sanearResumen(null) === null && sanearResumen('x') === null && sanearResumen([1, 2]) === null && sanearResumen({}) === null, 'null, texto, listas y objetos vacíos → nada');
assert(sanearResumen({ mensajesHoy: 1, mes: '2026-13' }).mes === undefined, 'un mes inválido se ignora');
assert(sanearVersion('1.0.13') === '1.0.13' && sanearVersion(' 2.1 ') === '2.1' && sanearVersion('1.0.13<script>') === null && sanearVersion(5) === null && sanearVersion('') === null, 'la versión solo admite el formato 1.0.13');

console.log('\n✅ Todos los tests de resumen-negocio pasaron.\n');
