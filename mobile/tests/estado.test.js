// mobile/tests/estado.test.js — lo que ve el usuario según el estado de su PC (lógica pura, corre con Node).
'use strict';
const { describirBot, hace, pesos, accionesDisponibles, lineasResumen, vigenciaResumen, avisoResumen, ETIQUETAS } = require('../src/estado');

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

// ── Números al día: lo que la PC mandó ayer (o el mes pasado) no se muestra como si fuera de ahora ──
const AHORA = new Date('2026-10-13T15:00:00Z'); // 12:00 en Argentina
const R = { mes: '2026-10', mensajesHoy: 34, turnosHoy: 5, turnosMes: 80, ingresosMes: 842500, gastosMes: 100000, teDeben: 64000, debes: 1000, clientes: 12 };
const v1 = vigenciaResumen(R, '2026-10-13T14:50:00Z', AHORA);
assert(v1.conocido && !v1.obsoleto && v1.esDeHoy && v1.esDelMes && avisoResumen(v1, '2026-10-13T14:50:00Z', AHORA) === null, 'de hace 10 minutos: al día, sin aviso');
assert(lineasResumen(R, v1).length === 8, 'al día: se muestran los 8 contadores que vinieron');
const v2 = vigenciaResumen(R, '2026-10-13T13:00:00Z', AHORA);
assert(v2.obsoleto && v2.esDeHoy && /no están al día/.test(avisoResumen(v2, '2026-10-13T13:00:00Z', AHORA)) && lineasResumen(R, v2).length === 8, 'de hace 2 horas pero de hoy: se muestra con aviso');
const v3 = vigenciaResumen(R, '2026-10-12T20:00:00Z', AHORA);
const claves3 = lineasResumen(R, v3).map((x) => x.clave);
assert(!v3.esDeHoy && v3.esDelMes && !claves3.includes('mensajesHoy') && !claves3.includes('turnosHoy') && claves3.includes('ingresosMes') && /de “hoy”/.test(avisoResumen(v3, '2026-10-12T20:00:00Z', AHORA)), 'de ayer: se ocultan "mensajes hoy" y "turnos hoy" (eran de ayer) y se avisa');
const v4 = vigenciaResumen({ ...R, mes: '2026-09' }, '2026-09-30T20:00:00Z', AHORA);
const claves4 = lineasResumen({ ...R, mes: '2026-09' }, v4).map((x) => x.clave);
assert(!v4.esDelMes && !claves4.includes('ingresosMes') && !claves4.includes('gastosMes') && !claves4.includes('turnosMes') && claves4.includes('teDeben') && /“del mes”/.test(avisoResumen(v4, '2026-09-30T20:00:00Z', AHORA)), 'del mes pasado: se ocultan ingresos/gastos/turnos "del mes" pero no los saldos');
assert(vigenciaResumen(R, '2026-10-14T02:30:00Z', new Date('2026-10-14T03:10:00Z')).esDeHoy === false, 'el día cambia a la medianoche de Argentina (03:00 UTC), no a la de Greenwich');
assert(vigenciaResumen(R, '2026-10-14T02:50:00Z', new Date('2026-10-14T02:55:00Z')).esDeHoy === true, 'a las 23:55 en Argentina todavía es el mismo día');
assert(vigenciaResumen(null, null, AHORA).conocido === false && avisoResumen(vigenciaResumen(null, null, AHORA), null, AHORA) === null && lineasResumen(R, vigenciaResumen(null, null, AHORA)).length === 8, 'sin fecha de resumen no se inventa nada ni se oculta nada');

// la app web del celular usa la misma lógica (copia en frontend/src/lib/estadoMovil.js): tienen que dar lo mismo
(async () => {
  const W = await import('file:///' + require('path').resolve(__dirname, '../../frontend/src/lib/estadoMovil.js').split('\\').join('/'));
  for (const [r, en] of [[R, '2026-10-13T14:50:00Z'], [R, '2026-10-12T20:00:00Z'], [{ ...R, mes: '2026-09' }, '2026-09-30T20:00:00Z'], [R, '2026-10-13T13:00:00Z'], [null, null]]) {
    const a = vigenciaResumen(r, en, AHORA); const b = W.vigenciaResumen(r, en, AHORA);
    assert(JSON.stringify(a) === JSON.stringify(b) && avisoResumen(a, en, AHORA) === W.avisoResumen(b, en, AHORA) && JSON.stringify(lineasResumen(r, a)) === JSON.stringify(W.lineasResumen(r, b)), `la app nativa y la web del celular muestran lo mismo (${en || 'sin datos'})`);
  }
  console.log('\n✅ mobile/estado OK\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
