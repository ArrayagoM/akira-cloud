// tests/ayuda.test.js — centro de ayuda: buscador, y que cada artículo sea consistente (id único, pasos, categoría válida).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

// El archivo del frontend es un módulo ES: se evalúa sin los "export" para probarlo acá
const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/data/ayuda.js'), 'utf8').replace(/^export /gm, '');
const ctx = {}; vm.createContext(ctx); vm.runInContext(`${src}\nthis.ARTICULOS = ARTICULOS; this.CATEGORIAS = CATEGORIAS; this.buscar = buscar;`, ctx);
const { ARTICULOS, CATEGORIAS, buscar } = ctx;

console.log('\n[ayuda] Tests:');
assert(ARTICULOS.length >= 30, `hay artículos (${ARTICULOS.length})`);
assert(new Set(ARTICULOS.map((a) => a.id)).size === ARTICULOS.length && ARTICULOS.every((a) => /^[a-z0-9-]+$/.test(a.id)), 'cada artículo tiene un id único (sirve como enlace)');
assert(ARTICULOS.every((a) => CATEGORIAS.includes(a.cat) && a.titulo && a.pasos.length >= 2 && a.pasos.every((p) => p.length > 10)), 'todos tienen categoría válida, título y al menos dos pasos');
assert(CATEGORIAS.every((c) => ARTICULOS.some((a) => a.cat === c)), 'ninguna categoría queda vacía');
assert(buscar('').length === ARTICULOS.length && buscar('   ').length === ARTICULOS.length, 'sin búsqueda se muestran todos');
const top = (q) => buscar(q)[0]?.id;
assert(top('seña') === 'senas' && top('SEÑA') === 'senas' && top('sena') === 'senas', 'ignora mayúsculas y tildes');
assert(top('importar clientes excel') === 'importar-clientes' && top('el bot no responde') === 'bot-no-responde' && top('cerrar caja') === 'cierre-caja', 'encuentra lo que la gente escribiría');
assert(top('codigo de barras') === 'codigo-barras' && top('comision profesional') === 'profesionales' && top('pin empleado') === 'perfiles', 'por palabras clave, no solo por el título');
assert(top('olvide mi pin') === 'perfiles' || buscar('olvide pin').some((a) => a.id === 'perfiles'), 'también por lo que dice el texto');
assert(buscar('zzzzqqqq').length === 0, 'una búsqueda sin sentido no trae nada (y la pantalla ofrece escribir a soporte)');
assert(buscar('caja').length >= 3 && buscar('mercadopago').length >= 3, 'palabras generales traen varios resultados');
const sinSoporte = ARTICULOS.filter((a) => /@/.test(`${a.consejo} ${a.pasos.join(' ')}`) && !/soporte@akiracloud\.lat/.test(`${a.consejo} ${a.pasos.join(' ')}`));
assert(sinSoporte.length === 0, 'el único email que aparece es el de soporte');

console.log('\n✅ Todos los tests de ayuda pasaron.\n');
