// tests/sesion-wa.test.js — cuándo se borra la vinculación de WhatsApp (QR nuevo) y cuándo se reintenta con la sesión guardada.
'use strict';
const { decidirDesconexion, MAX_500, ESTABLE_MS } = require('../main/bot-engine/services/bot/sesion-wa');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

console.log('\n[sesion-wa] Tests:');
const HORA = 60 * 60 * 1000;

assert(decidirDesconexion({ code: 401 }).accion === 'borrar', '401 (cerrada desde el celular): se borra, la vinculación ya no sirve');
assert(decidirDesconexion({ code: 440 }).accion === 'borrar', '440 (reemplazada por otro dispositivo): se borra');
for (const c of [408, 428, 515, 503, undefined, 0]) assert(decidirDesconexion({ code: c }).accion === 'reintentar', `código ${c}: cortes normales, nunca se borra`);

// el caso real: conectado horas, errores Bad MAC y un 500 → antes borraba todo, ahora reintenta
let d = decidirDesconexion({ code: 500, previoSeguidos: 0, abrioDesdeElUltimo: true, msAbierta: 5 * HORA });
assert(d.accion === 'reintentar' && d.seguidos === 1, 'un 500 aislado después de horas conectado: se reintenta con la sesión guardada (NO se borra)');

// si la sesión de verdad está rota, los reintentos fallan enseguida y recién ahí se borra
let seguidos = d.seguidos;
d = decidirDesconexion({ code: 500, previoSeguidos: seguidos, abrioDesdeElUltimo: false, msAbierta: 0 });
assert(d.accion === 'reintentar' && d.seguidos === 2, 'segundo 500 sin llegar a conectar: todavía reintenta');
d = decidirDesconexion({ code: 500, previoSeguidos: d.seguidos, abrioDesdeElUltimo: false, msAbierta: 0 });
assert(MAX_500 === 3 && d.accion === 'borrar' && d.motivo === 'corrupta-repetida', `el tercer 500 seguido (${MAX_500}): la sesión está perdida, se borra y se pide el QR`);

// conexiones que abren y se caen enseguida no cuentan como sanas
d = decidirDesconexion({ code: 500, previoSeguidos: 2, abrioDesdeElUltimo: true, msAbierta: 5000 });
assert(d.accion === 'borrar', 'si abre y se cae a los segundos con 500, no se considera una conexión sana: sigue contando');
d = decidirDesconexion({ code: 500, previoSeguidos: 2, abrioDesdeElUltimo: true, msAbierta: ESTABLE_MS + 1 });
assert(d.accion === 'reintentar' && d.seguidos === 1, 'si estuvo conectada más de un minuto, el contador vuelve a empezar');

// los otros códigos no tocan el contador
assert(decidirDesconexion({ code: 408, previoSeguidos: 2 }).seguidos === 2, 'un corte de internet en el medio no reinicia ni suma el contador de 500');
assert(decidirDesconexion().accion === 'reintentar', 'sin datos: reintenta (nunca borra por error)');

console.log('\n✅ Todos los tests de sesion-wa pasaron.\n');
