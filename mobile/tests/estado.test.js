// mobile/tests/estado.test.js — lo que ve el usuario según el estado de su PC (lógica pura, corre con Node).
'use strict';
const { describirBot, hace, pesos, accionesDisponibles, lineasResumen, ETIQUETAS } = require('../src/estado');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[mobile/estado] Tests:');

assert(describirBot({ bot: 'conectado' }).tono === 'ok' && describirBot({ bot: 'conectado' }).titulo === 'Atendiendo', 'conectado → "Atendiendo" en verde');
assert(/vacaciones/.test(describirBot({ bot: 'conectado', vacaciones: true }).detalle), 'conectado en vacaciones lo aclara');
const q = describirBot({ bot: 'caido', motivo: 'sesion' });
assert(q.tono === 'error' && /QR/.test(q.detalle) && /Dispositivos vinculados/.test(q.detalle), 'caído por sesión: explica cómo volver a vincular WhatsApp');
assert(/internet/.test(describirBot({ bot: 'caido', motivo: 'desconexion' }).detalle), 'caído por desconexión: explica qué revisar');
assert(describirBot({ bot: 'pc-sin-senal' }).tono === 'error' && describirBot({ bot: 'pausado-licencia' }).tono === 'error', 'PC sin señal y pausado por licencia son errores');
assert(describirBot({ bot: 'detenido' }).tono === 'aviso' && /reanudarlo/.test(describirBot({ bot: 'detenido' }).detalle), 'detenido a propósito: aviso y dice que se puede reanudar');
assert(describirBot(null).tono === 'neutro' && describirBot({ bot: 'algo-nuevo' }).titulo === 'Sin información todavía', 'estados desconocidos no rompen');

const ahora = new Date('2026-10-08T15:00:00Z');
assert(hace('2026-10-08T14:59:50Z', ahora) === 'hace instantes' && hace('2026-10-08T14:55:00Z', ahora) === 'hace 5 min', 'hace instantes / minutos');
assert(hace('2026-10-08T13:00:00Z', ahora) === 'hace 2 horas' && hace('2026-10-08T14:00:00Z', ahora) === 'hace 1 hora', 'horas (singular y plural)');
assert(hace('2026-10-06T15:00:00Z', ahora) === 'hace 2 días' && hace(null, ahora) === 'nunca' && hace('2026-10-09T15:00:00Z', ahora) === 'hace instantes', 'días, nunca y fechas futuras');
assert(pesos(64000) === '$64.000' && pesos('x') === '$0', 'pesos con formato argentino');

const p = (bot, online = true) => accionesDisponibles({ bot, online });
assert(p('conectado').puedePausar && !p('conectado').puedeReanudar, 'conectado: se puede pausar');
assert(!p('caido').puedePausar && !p('caido').puedeReanudar, 'caído: no hay nada que pausar ni reanudar (hay que intervenir en la PC)');
assert(p('detenido').puedeReanudar && !p('detenido').puedePausar, 'detenido: se puede reanudar');
assert(!p('conectado', false).puedePausar && !p('detenido', false).puedeReanudar, 'con la PC sin señal no se ofrece ninguna acción');
assert(!p('pausado-licencia').puedePausar && !p('pausado-licencia').puedeReanudar, 'pausado por licencia: no hay acciones (hay que renovar el plan)');

const l = lineasResumen({ mensajesHoy: 34, ingresosMes: 842500, teDeben: 64000, clientes: 0, extra: 'x' });
assert(l.map((x) => x.clave).join() === 'mensajesHoy,ingresosMes,teDeben,clientes' && l[1].valor === '$842.500' && l[3].valor === '0', 'el resumen muestra solo lo que vino, en orden y sin campos desconocidos');
assert(lineasResumen(null).length === 0, 'sin resumen: lista vacía');
assert(Object.keys(ETIQUETAS).length === 4, 'las 4 órdenes tienen etiqueta');

console.log('\n✅ mobile/estado OK\n');
