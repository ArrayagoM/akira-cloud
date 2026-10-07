// tests/senas.test.js — señas por servicio: cobrar solo una parte para reservar (o todo, como siempre si no se configura).
'use strict';

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const s = require('../main/gestion/senas');

console.log('\n[señas] Tests:');
let c = s.calcular({ nombre: 'Corte', precio: 9000 }, 9000);
assert(c.cobrar === 9000 && c.saldo === 0 && !c.esSena, 'sin seña configurada se cobra todo (comportamiento de siempre)');
c = s.calcular({ sena: { tipo: 'porcentaje', valor: 30 } }, 9000);
assert(c.cobrar === 2700 && c.saldo === 6300 && c.esSena && c.total === 9000, 'seña del 30 %');
c = s.calcular({ sena: { tipo: 'monto', valor: 2000 } }, 9000);
assert(c.cobrar === 2000 && c.saldo === 7000 && c.esSena, 'seña de monto fijo');
c = s.calcular({ sena: { tipo: 'porcentaje', valor: 33 } }, 1001);
assert(Number.isInteger(c.cobrar) && c.cobrar === 330 && c.saldo === 671, 'redondea a pesos enteros (Mercado Pago no cobra centavos sueltos)');
assert(s.calcular({ sena: { tipo: 'monto', valor: 9000 } }, 9000).esSena === false && s.calcular({ sena: { tipo: 'monto', valor: 20000 } }, 9000).cobrar === 9000, 'si la seña es igual o mayor al precio, se cobra todo');
assert(s.calcular({ sena: { tipo: 'porcentaje', valor: 100 } }, 9000).esSena === false && s.calcular({ sena: { tipo: 'porcentaje', valor: 0 } }, 9000).esSena === false, '0 % o 100 % = sin seña');
assert(s.calcular({ sena: { tipo: 'raro', valor: 50 } }, 9000).cobrar === 9000 && s.calcular({ sena: 'x' }, 9000).cobrar === 9000 && s.calcular(null, 9000).cobrar === 9000 && s.calcular(undefined, 0).cobrar === 0, 'datos raros no rompen nada: se cobra el total');
assert(s.calcular({ sena: { tipo: 'porcentaje', valor: 1 } }, 100).cobrar === 1, 'una seña mínima sigue siendo válida');
assert(s.calcular({ sena: { tipo: 'porcentaje', valor: 0.4 } }, 100).cobrar === 1, 'porcentajes menores a 1 se toman como 1 %');
assert(s.calcular({ sena: { tipo: 'monto', valor: 0.3 } }, 100).esSena === false && s.calcular({ sena: { tipo: 'monto', valor: 0.3 } }, 100).cobrar === 100, 'un monto menor a $1 no se aplica (se cobra todo)');
assert(JSON.stringify(s.sanear({ tipo: 'porcentaje', valor: '30,4' }, 100)) === '{"tipo":"porcentaje","valor":30}' && s.sanear({ tipo: 'porcentaje', valor: 150 }, 100) === null && s.sanear({ tipo: 'monto', valor: -3 }, 100) === null, 'sanear limpia lo que escribe el dueño');
assert(/resto, \$6300/.test(s.textoSena(s.calcular({ sena: { tipo: 'porcentaje', valor: 30 } }, 9000))) && s.textoSena(s.calcular({}, 9000)) === '', 'texto para el cliente solo cuando hay seña');

console.log('\n✅ Todos los tests de señas pasaron.\n');
