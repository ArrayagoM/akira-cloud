// tests/respuesta-final-listar-opciones.test.js
// Regresión de un bug real detectado en producción: cuando un cliente
// pregunta "¿qué horarios tenés disponibles?", el LLM (llama-3.1-8b-instant)
// a veces resume el resultado de consultar_disponibilidad en vez de listar
// los horarios reales — responde "Disponemos de varias opciones, ¿cuál
// preferís?" en vez de "Tenés libre las 9, 10 y 11 hs. ¿Cuál te queda mejor?".
//
// El fix refuerza el system prompt de la 2da llamada a Groq (la que redacta
// la respuesta final usando el resultado de la tool) para exigir que liste
// TODAS las opciones concretas cuando la tool ejecutada fue una de las que
// devuelve una lista de opciones (consultar_disponibilidad,
// consultar_disponibilidad_alojamiento, consultar_catalogo).
//
// No podemos testear la llamada real a Groq sin API key, así que este test
// verifica que construirSystemPromptRespuestaFinal() arma el prompt reforzado
// exactamente cuando corresponde, y NO lo agrega para otras tools
// (agendar_turno, cancelar_turno, etc.) para no cambiarles el comportamiento.
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akira-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const crearAkiraBot = require('../services/akira.bot');
const { construirSystemPromptRespuestaFinal } = crearAkiraBot;

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[respuesta-final-listar-opciones] Tests:');

const toolCall = (nombre) => ({ id: 'x', type: 'function', function: { name: nombre } });

// ── consultar_disponibilidad → debe reforzar el prompt ──────────
{
  const prompt = construirSystemPromptRespuestaFinal(
    'Peluquería Vero',
    'Juan',
    [toolCall('consultar_disponibilidad')],
    null,
  );
  assert(
    /LISTALOS TODOS/.test(prompt),
    'consultar_disponibilidad agrega la instrucción de listar todas las opciones',
  );
  assert(
    !/varias opciones/i.test(prompt.split('LISTALOS')[0]) || /NO/.test(prompt),
    'el refuerzo prohíbe respuestas genéricas tipo "varias opciones"',
  );
  assert(prompt.includes('Peluquería Vero'), 'conserva el nombre del negocio');
  assert(prompt.includes('Juan'), 'conserva el nombre del cliente');
}

// ── consultar_disponibilidad_alojamiento → también debe reforzar ─
{
  const prompt = construirSystemPromptRespuestaFinal(
    'Cabañas del Sur',
    'Ana',
    [toolCall('consultar_disponibilidad_alojamiento')],
    null,
  );
  assert(
    /LISTALOS TODOS/.test(prompt),
    'consultar_disponibilidad_alojamiento agrega la instrucción de listar todas las opciones',
  );
}

// ── consultar_catalogo → también debe reforzar ───────────────────
{
  const prompt = construirSystemPromptRespuestaFinal(
    'Kiosco Don José',
    'Pedro',
    [toolCall('consultar_catalogo')],
    null,
  );
  assert(
    /LISTALOS TODOS/.test(prompt),
    'consultar_catalogo agrega la instrucción de listar todas las opciones',
  );
}

// ── agendar_turno → NO debe cambiar (comportamiento ya probado) ──
{
  const prompt = construirSystemPromptRespuestaFinal(
    'Peluquería Vero',
    'Juan',
    [toolCall('agendar_turno')],
    null,
  );
  assert(
    !/LISTALOS TODOS/.test(prompt),
    'agendar_turno NO agrega la instrucción de listar opciones',
  );
  assert(
    prompt === 'Sos Akira de Peluquería Vero. Natural, cálido, WhatsApp con Juan. Max 3 líneas.',
    'agendar_turno mantiene el prompt base exacto (sin cambios de comportamiento)',
  );
}

// ── cancelar_turno / reagendar_turno → tampoco cambian ───────────
{
  const prompt = construirSystemPromptRespuestaFinal(
    'Peluquería Vero',
    'Juan',
    [toolCall('cancelar_turno')],
    null,
  );
  assert(!/LISTALOS TODOS/.test(prompt), 'cancelar_turno NO agrega la instrucción de listar opciones');
}

// ── sin tool_calls (respuesta sin tools) → prompt base sin refuerzo ─
{
  const prompt = construirSystemPromptRespuestaFinal('Negocio', 'Cliente', [], null);
  assert(!/LISTALOS TODOS/.test(prompt), 'sin tool_calls no agrega el refuerzo');
}
{
  const prompt = construirSystemPromptRespuestaFinal('Negocio', 'Cliente', null, null);
  assert(!/LISTALOS TODOS/.test(prompt), 'tool_calls null no rompe ni agrega el refuerzo');
}

// ── múltiples tools en el mismo turno: si UNA es de opciones, refuerza ─
{
  const prompt = construirSystemPromptRespuestaFinal(
    'Negocio',
    'Cliente',
    [toolCall('consultar_disponibilidad'), toolCall('agendar_turno')],
    null,
  );
  assert(
    /LISTALOS TODOS/.test(prompt),
    'si entre varias tools llamadas hay una de listar opciones, se refuerza el prompt',
  );
}

// ── linkMP se combina correctamente con el refuerzo cuando aplica ─
{
  const prompt = construirSystemPromptRespuestaFinal(
    'Negocio',
    'Cliente',
    [toolCall('agendar_turno')],
    'https://www.mercadopago.com.ar/xyz',
  );
  assert(
    prompt.includes('El link de pago se agrega automáticamente'),
    'agendar_turno con linkMP sigue agregando la instrucción de no mencionar el link',
  );
  assert(!/LISTALOS TODOS/.test(prompt), 'agendar_turno con linkMP no agrega el refuerzo de listar opciones');
}

console.log('\n✅ Todos los tests de respuesta-final-listar-opciones pasaron.\n');
