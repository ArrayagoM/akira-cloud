// tests/codigo-barras.test.js — códigos de barras: Code 128, códigos propios, búsqueda por lector y etiquetas en PDF.
'use strict';

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const cb = require('../main/gestion/codigo-barras');

(async () => {
  console.log('\n[código de barras] Tests:');
  // La tabla de símbolos de Code 128 debe cumplir sus invariantes (si un número estuviera mal escrito, alguna se rompe)
  const P = cb.PATRONES;
  assert(P.length === 107, 'hay 107 símbolos (0-102 datos, 3 inicios y el fin)');
  assert(P.slice(0, 106).every((p) => p.length === 6 && p.split('').reduce((s, d) => s + Number(d), 0) === 11), 'cada símbolo mide 11 módulos en 6 elementos');
  assert(P[106].length === 7 && P[106].split('').reduce((s, d) => s + Number(d), 0) === 13, 'el símbolo final mide 13 módulos en 7 elementos');
  assert(new Set(P).size === 107, 'no hay símbolos repetidos');
  assert(P.slice(0, 106).every((p) => p.split('').every((d) => d >= 1 && d <= 4) && (Number(p[0]) + Number(p[2]) + Number(p[4])) % 2 === 0), 'cada símbolo tiene anchos de 1 a 4 y las barras suman un número par (paridad de Code 128)');

  // Vector conocido: "A" en el juego B = inicio B(104) + 'A'(33) + control (104+33)%103=34 + fin
  const a = cb.codificar('A');
  assert(a.join('') === '211214' + '111323' + '131123' + '2331112', 'codifica "A": inicio, dato, dígito de control y fin');
  const t = cb.codificar('Hello 123');
  const mod = t.reduce((s, x) => s + x, 0);
  assert(mod === 11 * (1 + 9 + 1) + 13 && t.length === 6 * 11 + 7, 'el largo en módulos es el esperado (inicio + datos + control + fin)');
  // control de un texto largo, recalculado a mano
  const txt = 'AK000123'; const vals = [...txt].map((c) => c.charCodeAt(0) - 32); const ctrl = (104 + vals.reduce((s, v, i) => s + v * (i + 1), 0)) % 103;
  assert(cb.codificar(txt).join('').includes(P[ctrl]), 'el dígito de control coincide con el cálculo a mano');
  assert(cb.codificar('') === null && cb.codificar('   ') === null && cb.codificar('ñandú') === null && cb.codificar('x'.repeat(41)) === null, 'no codifica vacío, caracteres que no son ASCII ni más de 40');

  assert(cb.sanear('  7790001234567 ') === '7790001234567' && cb.sanear('ñ') === '' && cb.sanear(null) === '' && cb.sanear('a\nb') === 'a b' && cb.sanear('x'.repeat(60)).length === 40, 'limpia el código que escribe el dueño');

  // códigos propios
  assert(cb.generar([]) === 'AK000001' && cb.generar(['AK000007', '7790001', 'ak000003']) === 'AK000008', 'el código propio sigue la numeración y no choca');
  const r = cb.completar([{ nombre: 'A', codigo: '7790001234567' }, { nombre: 'B' }, { nombre: 'C', codigo: '' }, { nombre: 'D', codigo: 'ñ' }]);
  assert(r.asignados === 3 && r.catalogo[0].codigo === '7790001234567' && r.catalogo[1].codigo === 'AK000001' && r.catalogo[2].codigo === 'AK000002' && r.catalogo[3].codigo === 'AK000003', 'completa solo los que no tienen código (no toca los que ya tienen)');
  assert(new Set(r.catalogo.map((p) => p.codigo)).size === 4, '…y todos quedan distintos');

  // lector
  const cat = [{ nombre: 'Cera', codigo: 'AK000001' }, { nombre: 'Peine', codigo: '7790001234567' }, { nombre: 'Sin código' }];
  assert(cb.buscarPorCodigo(cat, ' 7790001234567\n').nombre === 'Peine' && cb.buscarPorCodigo(cat, 'ak000001').nombre === 'Cera' && cb.buscarPorCodigo(cat, '999') === null && cb.buscarPorCodigo(cat, '') === null, 'busca el producto por el código que leyó el lector');

  // etiquetas
  const pdf = await cb.generarEtiquetas([{ nombre: 'Cera modeladora', precio: 6200, codigo: 'AK000001' }, { nombre: 'Sin código', precio: 1, codigo: '' }, ...Array.from({ length: 30 }, (_, i) => ({ nombre: `Producto ${i}`, precio: 100 + i, codigo: `77900${String(i).padStart(8, '0')}` }))], { negocio: 'Tincho' });
  assert(pdf.slice(0, 4).toString() === '%PDF' && pdf.length > 3000, 'genera las etiquetas en PDF (varias hojas)');
  const vacio = await cb.generarEtiquetas([{ nombre: 'x', codigo: '' }]);
  assert(vacio.slice(0, 4).toString() === '%PDF', 'sin códigos no se rompe');

  console.log('\n✅ Todos los tests de códigos de barras pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
