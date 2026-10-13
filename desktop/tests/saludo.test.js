// tests/saludo.test.js — un saludo solo ("Hola") se responde con calidez y sin pasar por la IA; y los prompts piden voseo y amabilidad.
'use strict';
const fs = require('fs');
const path = require('path');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const { esSoloSaludo, armarSaludo, saludoDelMomento } = require('../main/bot-engine/services/bot/saludo.service');

(async () => {
require('../main/db/store').abrir(path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'akira-saludo-')), 'akira.db'));
await require('../main/esm-compat').preparar();
const crearAkiraBot = require('../main/bot-engine/services/akira.bot');
console.log('\n[saludo] Tests:');
for (const t of ['Hola', 'hola!', 'HOLAAA', 'Holaa', 'holis', 'ola', 'Hey', 'Buenas', 'Buen día', 'Buenos días', 'buenas tardes!', 'Buenas noches', 'Hola, buen día', 'Hola buenas', 'hola 😊', 'Hola, ¿qué tal?', 'Hola que tal', 'Hola, ¿cómo andás?', 'como estas', 'qué tal?', 'Buen día, ¿cómo va?', '¡¡Hola!!', '  hola  ']) {
  assert(esSoloSaludo(t) === true, `"${t}" es solo un saludo`);
}
for (const t of ['Hola, ¿tenés turno?', 'hola quiero un turno', 'Hola, cuánto sale el corte?', 'bien', 'todo bien', 'ok', 'buen precio', 'qué tal el turno de mañana', 'dale', 'si', 'Buen día, necesito cancelar', 'hola hola hola hola hola hola hola', 'Hola ' + 'x'.repeat(60), '', '   ', '😊']) {
  assert(esSoloSaludo(t) === false, `"${t.slice(0, 30)}" NO es solo un saludo (va a la IA)`);
}
assert(esSoloSaludo(null) === false && esSoloSaludo(undefined) === false && esSoloSaludo(123) === false, 'valores raros no rompen nada');

const a = (h) => new Date(2026, 9, 13, h, 0);
assert(saludoDelMomento(9) === '¡Buen día' && saludoDelMomento(15) === '¡Buenas tardes' && saludoDelMomento(22) === '¡Buenas noches' && saludoDelMomento(3) === '¡Buenas noches' && saludoDelMomento(6) === '¡Buen día' && saludoDelMomento(13) === '¡Buenas tardes' && saludoDelMomento(20) === '¡Buenas noches', 'el saludo cambia según la hora');
const s1 = armarSaludo({ nombre: 'Lucía', negocio: 'Aurora Estudio', ahora: a(10) });
assert(s1.startsWith('¡Buen día, Lucía!') && s1.includes('Soy Akira') && s1.includes('*Aurora Estudio*') && /¿En qué te puedo ayudar\?/.test(s1), 'primer saludo: cálido, se presenta y pregunta en qué ayudar');
assert(!/\d{1,2}:\d{2}|libre|horarios libres:/.test(s1) && !/tienes|quieres/.test(s1), 'el saludo no vuelca horarios y habla con voseo');
assert(armarSaludo({ nombre: 'Lucía', conocido: true, ahora: a(16) }) === '¡Buenas tardes, Lucía! 😊 ¿En qué te puedo ayudar hoy?', 'a quien ya habló antes le da un saludo corto');
assert(armarSaludo({ ahora: a(21) }).startsWith('¡Buenas noches!') && armarSaludo({ miNombre: 'Pedro', ahora: a(9) }).includes('de Pedro'), 'sin nombre no queda una coma suelta; si no hay negocio usa el nombre del dueño');

// Los prompts piden voseo y amabilidad (probado sobre el texto real que se le manda a la IA)
const final = crearAkiraBot.construirSystemPromptRespuestaFinal('Lucía', 'Ana', [{ function: { name: 'consultar_disponibilidad' } }], null);
assert(/voseo/.test(final) && /nunca con tuteo/.test(final) && /devolvé el saludo/.test(final) && /cerrá con una pregunta amable/.test(final), 'el prompt de la respuesta final pide voseo, devolver el saludo y cerrar con una pregunta amable');
assert(/LISTALOS TODOS/.test(final), 'cuando el cliente SÍ pidió horarios, igual se listan todos');
const fuente = fs.readFileSync(path.join(__dirname, '../main/bot-engine/services/akira.bot.js'), 'utf8');
assert(fuente.includes('SI EL MENSAJE ES SOLO UN SALUDO') && fuente.includes('NO llames a ninguna herramienta') && fuente.includes('saludoSvc.esSoloSaludo(texto)'), 'el prompt principal prohíbe herramientas ante un saludo y el atajo está conectado al flujo de mensajes');
assert(/nunca con tuteo/.test(fuente.split('ESTILO DE RESPUESTA')[1] || ''), 'el estilo del prompt principal también pide voseo');

console.log('\n✅ Todos los tests de saludo pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
