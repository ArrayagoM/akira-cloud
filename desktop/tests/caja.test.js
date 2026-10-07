// tests/caja.test.js — Caja: validación de movimientos, ingresos que salen de los
// turnos cobrados, resumen del mes e importación de planillas de gastos.
'use strict';
const caja = require('../main/gestion/caja');
const m = require('../main/gestion/mapeo');

function assert(c, msg) { if (!c) throw new Error('FAIL: ' + msg); console.log('  ✅ ' + msg); }

console.log('\n[caja] Tests:');

// ── validación ──
let r = caja.sanearMovimiento({ tipo: 'gasto', monto: '15000,50', fecha: '2026-10-05' });
assert(!r.ok, 'un monto en texto con coma se rechaza: la pantalla y las planillas ya lo mandan como número');
r = caja.sanearMovimiento({ tipo: 'gasto', monto: 15000.5, fecha: '2026-10-05', categoria: '  Alquiler ', descripcion: 'Octubre', metodo: 'transferencia' });
assert(r.ok && r.dato.monto === 15000.5 && r.dato.categoria === 'Alquiler' && r.dato.metodo === 'transferencia', 'movimiento válido: limpia espacios y conserva los datos');
assert(!caja.sanearMovimiento({ tipo: 'otro', monto: 5 }).ok, 'rechaza un tipo que no es ingreso ni gasto');
assert(!caja.sanearMovimiento({ tipo: 'gasto', monto: 0 }).ok && !caja.sanearMovimiento({ tipo: 'gasto', monto: -5 }).ok && !caja.sanearMovimiento({ tipo: 'gasto', monto: 'abc' }).ok, 'rechaza montos en cero, negativos o texto');
assert(!caja.sanearMovimiento({ tipo: 'gasto', monto: 5, fecha: '2026-02-30' }).ok && !caja.sanearMovimiento({ tipo: 'gasto', monto: 5, fecha: '05/10/2026' }).ok, 'rechaza fechas imposibles o en otro formato');
assert(caja.sanearMovimiento({ tipo: 'ingreso', monto: 5, fecha: '2026-10-05', metodo: 'bitcoin' }).dato.metodo === 'efectivo', 'un método desconocido queda como efectivo');
assert(caja.sanearMovimiento({ tipo: 'gasto', monto: 5 }).dato.categoria === 'Otros gastos' && caja.sanearMovimiento({ tipo: 'ingreso', monto: 5 }).dato.categoria === 'Otros ingresos', 'sin categoría se asigna una por defecto');
assert(caja.sanearMovimiento({ tipo: 'gasto', monto: 5, descripcion: 'x'.repeat(500) }).dato.descripcion.length === 200, 'las descripciones largas se recortan');

// ── fechas de planilla ──
assert(caja.parsearFecha('05/10/2026') === '2026-10-05' && caja.parsearFecha('5-10-26') === '2026-10-05' && caja.parsearFecha('2026-10-05') === '2026-10-05', 'lee fechas dd/mm/aaaa, d-m-aa e ISO');
assert(caja.parsearFecha('31/02/2026') === null && caja.parsearFecha('hola') === null && caja.parsearFecha('') === null, 'fechas inválidas devuelven null');
assert(caja.parsearFecha(new Date(2026, 9, 5)) === '2026-10-05', 'fechas de Excel (objeto Date) se leen bien');

// ── ingresos que salen de los turnos ──
const t = (id, dia, estado, monto, metodo = 'mercadopago') => ({ _id: id, estado, fechaInicio: new Date(2026, 9, dia, 10, 0), resumen: `Turno — Ana ${id}`, clienteNombre: 'Ana', pago: { monto, metodo } });
const turnos = [t('a', 5, 'confirmado', 7000), t('b', 6, 'pendiente', 3000), t('c', 7, 'cancelado', 5000), t('d', 8, 'confirmado', 0), t('e', 9, 'confirmado', 4500, 'transferencia'), { ...t('f', 1, 'confirmado', 9999), fechaInicio: new Date(2026, 8, 30, 23, 0) }];
const ing = caja.ingresosDeTurnos(turnos, '2026-10');
assert(ing.length === 2 && ing.map((x) => x.turnoId).join() === 'a,e', 'solo cuentan los turnos CONFIRMADOS con pago, del mes pedido (no pendientes, cancelados, sin monto ni de otro mes)');
assert(ing[0].origen === 'turno' && ing[0]._id === 'turno-a' && ing[0].fecha === '2026-10-05' && ing[1].metodo === 'transferencia', 'cada ingreso conserva fecha local, método y un id que lo distingue de los manuales');
assert(caja.porCobrar(turnos, new Date(2026, 9, 1)).total === 3000 && caja.porCobrar(turnos, new Date(2026, 9, 1)).cantidad === 1, 'por cobrar = turnos pendientes de pago que siguen vigentes');
assert(caja.porCobrar(turnos, new Date(2026, 9, 20)).total === 0, 'un turno pendiente que ya pasó no cuenta como por cobrar');

// ── resumen ──
const movs = [...ing, { tipo: 'gasto', monto: 15000, fecha: '2026-10-05', metodo: 'transferencia', categoria: 'Alquiler' }, { tipo: 'gasto', monto: 2500.5, fecha: '2026-10-06', metodo: 'efectivo', categoria: 'Insumos' }, { tipo: 'ingreso', monto: 1000, fecha: '2026-10-06', metodo: 'efectivo', categoria: 'Ventas' }];
const rs = caja.resumen(movs, '2026-10');
assert(rs.ingresos === 12500 && rs.gastos === 17500.5 && rs.resultado === -5000.5, 'totales: ingresos, gastos y resultado (puede ser negativo)');
assert(rs.porMetodo.mercadopago === 7000 && rs.porMetodo.transferencia === 4500 && rs.porMetodo.efectivo === 1000, 'ingresos por método de pago');
assert(rs.categoriasGasto.Alquiler === 15000 && rs.categoriasGasto.Insumos === 2500.5, 'gastos por categoría');
assert(rs.porDia.length === 31 && rs.porDia[4].fecha === '2026-10-05' && rs.porDia[4].ingresos === 7000 && rs.porDia[4].gastos === 15000, 'serie diaria completa del mes (31 días de octubre)');
assert(caja.resumen([], '2026-02').porDia.length === 28 && caja.resumen([], '2028-02').porDia.length === 29, 'febrero tiene 28 o 29 días según el año');

// ── importar una planilla de gastos ──
const cols = ['Fecha', 'Detalle', 'Importe', 'Forma de pago'];
const filas = [['05/10/2026', 'Luz', '$ 15.000,50', 'Transferencia'], ['06/10/2026', 'Café', '-1.200', 'efectivo'], ['32/13/2026', 'x', '5', ''], ['07/10/2026', 'Venta mostrador', '8000', 'Efectivo'], ['', '', '', ''], ['06/10/2026', 'Café', '1200', 'efectivo']];
const mp = m.sugerirMapeo('movimientos', cols, filas);
assert(mp.fecha === 0 && mp.monto === 2 && mp.descripcion === 1 && mp.metodo === 3, 'reconoce Fecha, Importe, Detalle y Forma de pago');
const fs = m.construirFilas('movimientos', filas, { ...mp, tipoPorDefecto: 'gasto' }, []);
assert(fs.map((x) => x.estado).join() === 'nuevo,nuevo,error,nuevo,nuevo', 'filas: 4 válidas y 1 con fecha inválida (la fila vacía se ignora)');
assert(fs[0].dato.monto === 15000.5 && fs[0].dato.metodo === 'transferencia' && fs[1].dato.monto === 1200 && fs[1].dato.tipo === 'gasto', 'monto argentino, método reconocido y negativo = gasto');
assert(fs[2].errores[0].includes('32/13/2026'), 'el error indica el valor de fecha que falló');
const comoIngresos = m.construirFilas('movimientos', filas, { ...mp, tipoPorDefecto: 'ingreso' }, []);
assert(comoIngresos[3].dato.tipo === 'ingreso' && comoIngresos[1].dato.tipo === 'gasto', 'se puede decidir que el archivo son ingresos, pero un monto negativo sigue siendo gasto');
const conTipo = m.construirFilas('movimientos', [['05/10/2026', 'Venta', '500', 'Ingreso'], ['05/10/2026', 'Luz', '300', 'Egreso'], ['05/10/2026', 'Raro', '10', 'quizás']], { fecha: 0, descripcion: 1, monto: 2, tipo: 3 }, []);
assert(conTipo[0].dato.tipo === 'ingreso' && conTipo[1].dato.tipo === 'gasto' && conTipo[2].avisos[0].includes('no reconocido'), 'usa la columna Tipo (Ingreso/Egreso) y avisa si no entiende un valor');

const ya = [{ fecha: '2026-10-05', tipo: 'gasto', monto: 15000.5, descripcion: 'Luz' }];
const dup = m.construirFilas('movimientos', filas, { ...mp, tipoPorDefecto: 'gasto' }, ya);
assert(dup[0].estado === 'duplicado', 'volver a importar el mismo archivo no duplica lo que ya está en la Caja');
const ap = m.aplicarImportacion('movimientos', ya, dup);
assert(ap.agregados === 3 && ap.lista.length === 4 && ap.actualizados === 0 && ap.lista.slice(1).every((x) => x.origen === 'importado'), 'aplicar solo suma movimientos nuevos y los marca como importados');
assert(m.aplicarImportacion('movimientos', ya, dup, { modo: 'reemplazar' }).lista.length === 4, 'en la Caja "reemplazar" no borra nada: siempre se suma');

console.log('\n✅ Todos los tests de caja pasaron.\n');
