// tests/derivacion-horario.test.js — derivar a una persona (pedido o reclamo) y respuestas fuera de horario.
'use strict';
const { motivoDerivacion, resumenCharla, mensajeParaDueno, respuestaAlCliente } = require('../main/bot-engine/services/bot/derivacion.service');
const { estadoAhora, notaFueraDeHorario } = require('../main/bot-engine/services/bot/horario-atencion');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[derivacion-horario] Tests:');

// ── derivación ──
for (const t of ['Quiero hablar con una persona', 'necesito hablar con el dueño por favor', 'pasame con el encargado', 'No quiero hablar con un bot!!', 'quiero ATENCIÓN HUMANA', '¿puedo hablar con alguien?']) {
  assert(motivoDerivacion(t, 'Martín') === 'pide-persona', `pide una persona: "${t}"`);
}
assert(motivoDerivacion('quiero hablar con martín', 'Martín') === 'pide-persona', 'pide al dueño por su nombre (sin importar tildes ni mayúsculas)');
for (const t of ['Esto es una estafa', 'quiero hacer un reclamo', 'Pésimo servicio, una vergüenza', 'me cobraron de más', 'quiero mi plata ya', 'los voy a denunciar']) {
  assert(motivoDerivacion(t, 'Martín') === 'reclamo', `reclamo: "${t}"`);
}
assert(motivoDerivacion('es una estafa, quiero hablar con una persona') === 'reclamo', 'si hay reclamo y pedido a la vez, manda el reclamo (más urgente)');
for (const t of ['hola, quiero un turno para mañana', '¿sos un bot?', 'pasame a buscar a las 5', 'el servicio estuvo muy bien, gracias', 'no hay ningún problema', '¿cuánto sale el corte?', 'quiero cambiar mi turno', 'me quedó mal el color jaja pero lo amo', 'hablar con mi hermana', 'mal tiempo hoy']) {
  assert(motivoDerivacion(t, 'Martín') === null, `NO deriva (conversación normal): "${t}"`);
}

const hist = [
  { role: 'user', content: 'Hola quiero turno' }, { role: 'assistant', content: '¡Hola! ¿Para qué día?' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'x' }] }, { role: 'tool', content: '{"ok":1}' },
  { role: 'user', content: 'Me cobraron de más la última vez, quiero mi plata' + ' ¡MUY enojado!'.repeat(30) },
];
const rc = resumenCharla(hist);
assert(rc.split('\n').length === 3 && !/tool|ok":1/.test(rc), 'el resumen incluye solo mensajes de texto (sin herramientas internas)');
assert(rc.split('\n')[2].length <= 150 && rc.endsWith('…'), 'recorta los mensajes largos');
assert(resumenCharla(Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: 'm' + i }))).split('\n').length === 6, 'toma solo los últimos 6 mensajes');
const msgR = mensajeParaDueno({ nombre: 'Ana', numero: '5492241497226', motivo: 'reclamo', historial: hist });
assert(/molesto\/a o hizo un reclamo/.test(msgR) && /Ana/.test(msgR) && /\+5492241497226/.test(msgR) && /Lo último de la charla/.test(msgR), 'aviso al dueño por reclamo: quién es, por qué y lo último de la charla');
const msgP = mensajeParaDueno({ nombre: '', numero: '5492241497226', motivo: 'pide-persona', historial: [] });
assert(/quiere hablar con vos directamente/.test(msgP) && !/Lo último/.test(msgP), 'aviso por pedido simple (sin historial no inventa nada)');
assert(/Lamento mucho/.test(respuestaAlCliente({ nombre: 'Ana', dueno: 'Martín', motivo: 'reclamo' })) && /Dale, Ana/.test(respuestaAlCliente({ nombre: 'Ana', dueno: 'Martín', motivo: 'pide-persona' })), 'al cliente le contesta con el tono que corresponde');

// ── horario ──
const H = {
  lunes: { activo: true, inicio: '09:00', fin: '18:00' }, martes: { activo: true, inicio: '09:00', fin: '18:00' }, miercoles: { activo: true, franjas: [{ inicio: '09:00', fin: '13:00' }, { inicio: '17:00', fin: '21:00' }] },
  jueves: { activo: true, inicio: '09:00', fin: '18:00' }, viernes: { activo: true, inicio: '09:00', fin: '18:00' }, sabado: { activo: false }, domingo: { activo: false },
};
const d = (y, m, dia, h, min = 0) => new Date(y, m - 1, dia, h, min); // 2026-10-05 = lunes
assert(estadoAhora({}, [], d(2026, 10, 5, 3)).configurado === false && estadoAhora(undefined, [], d(2026, 10, 5, 3)).abierto === true, 'sin horarios cargados: no inventa nada (se considera abierto)');
assert(estadoAhora(H, [], d(2026, 10, 5, 10)).abierto === true, 'lunes 10:00 → abierto');
assert(estadoAhora(H, [], d(2026, 10, 5, 18)).abierto === false, 'lunes 18:00 en punto → ya cerró');
let e = estadoAhora(H, [], d(2026, 10, 5, 22));
assert(!e.abierto && e.proxima.texto === 'mañana a las 09:00', 'lunes 22:00 → "mañana a las 09:00"');
e = estadoAhora(H, [], d(2026, 10, 5, 7, 30));
assert(!e.abierto && e.proxima.texto === 'hoy a las 09:00', 'lunes 7:30 → "hoy a las 09:00"');
e = estadoAhora(H, [], d(2026, 10, 7, 14));
assert(!e.abierto && e.proxima.texto === 'hoy a las 17:00', 'miércoles en el corte de mediodía → "hoy a las 17:00" (respeta las franjas)');
e = estadoAhora(H, [], d(2026, 10, 9, 20));
assert(!e.abierto && e.proxima.texto === 'el lunes a las 09:00', 'viernes a la noche → "el lunes a las 09:00" (sábado y domingo cerrados)');
e = estadoAhora(H, ['2026-10-06'], d(2026, 10, 5, 20));
assert(e.proxima.texto === 'el miércoles a las 09:00', 'salta los días bloqueados (feriados)');
assert(estadoAhora(H, ['2026-10-05'], d(2026, 10, 5, 10)).abierto === false, 'un día bloqueado está cerrado aunque el horario normal diga abierto');

const nota = notaFueraDeHorario(H, [], d(2026, 10, 5, 22), { dueno: 'Martín' });
assert(/FUERA DE HORARIO/.test(nota) && /mañana a las 09:00/.test(nota) && /Martín/.test(nota) && /seguir tomando turnos/.test(nota), 'la nota para el bot dice cuándo abren y que igual puede tomar turnos');
assert(notaFueraDeHorario(H, [], d(2026, 10, 5, 10)) === '' && notaFueraDeHorario({}, [], d(2026, 10, 5, 22)) === '', 'abierto o sin horarios → no agrega nada al prompt');
assert(notaFueraDeHorario(H, [], d(2026, 10, 5, 22), { modoPausa: true }) === '', 'en modo pausa no se mezcla con el aviso de fuera de horario');

console.log('\n✅ Todos los tests de derivacion-horario pasaron.\n');
