// tests/tool-hallucination.test.js
// Regresión de un bug real detectado en producción: el LLM a veces devuelve
// el nombre de una tool como texto plano en vez de invocarla (ej: le
// respondió a un cliente real "Consultar_disponibilidad" en vez de llamar
// la función y mostrarle los horarios). esRespuestaSoloNombreDeTool()
// detecta ese caso para que akira.bot.js pueda reintentar en vez de
// mandarle esa respuesta rota al cliente.
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akira-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const crearAkiraBot = require('../services/akira.bot');
const { esRespuestaSoloNombreDeTool } = crearAkiraBot;

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[tool-hallucination] Tests:');

const tools = [
  { type: 'function', function: { name: 'consultar_disponibilidad' } },
  { type: 'function', function: { name: 'agendar_turno' } },
  { type: 'function', function: { name: 'cancelar_turno' } },
];

// ── Casos que SÍ son el bug (deben detectarse) ──────────────────
assert(
  esRespuestaSoloNombreDeTool('Consultar_disponibilidad', tools) === true,
  'detecta el nombre exacto de la tool con mayúscula inicial (el bug real reportado)'
);
assert(
  esRespuestaSoloNombreDeTool('consultar_disponibilidad', tools) === true,
  'detecta el nombre exacto en minúsculas'
);
assert(
  esRespuestaSoloNombreDeTool('consultar disponibilidad', tools) === true,
  'detecta el nombre con espacio en vez de guión bajo'
);
assert(
  esRespuestaSoloNombreDeTool('Consultar_disponibilidad.', tools) === true,
  'ignora el punto final'
);
assert(
  esRespuestaSoloNombreDeTool('  agendar_turno  ', tools) === true,
  'ignora espacios al principio/final'
);
assert(
  esRespuestaSoloNombreDeTool('CANCELAR_TURNO', tools) === true,
  'es case-insensitive'
);
assert(
  esRespuestaSoloNombreDeTool('consultar_disponibilidad{"fecha": "2026-08-14"}', tools) === true,
  'detecta el nombre con el JSON de argumentos pegado sin espacio (bug real visto en el demo)'
);
assert(
  esRespuestaSoloNombreDeTool('agendar_turno{"fecha":"2026-08-14","hora":"10:00"}', tools) === true,
  'detecta con JSON pegado y sin espacios internos'
);
assert(
  esRespuestaSoloNombreDeTool('  Consultar_disponibilidad {"fecha": "2026-08-14"}  ', tools) === true,
  'detecta con espacio entre el nombre y el JSON, más espacios extra alrededor'
);

// ── Casos que NO deben dispararse (evitar falsos positivos) ─────
assert(
  esRespuestaSoloNombreDeTool('Tenés libre las 9, 10 y 11 hs. ¿Cuál te queda mejor? 😊', tools) === false,
  'respuesta normal con horarios no se marca como falla'
);
assert(
  esRespuestaSoloNombreDeTool(
    'Me alegra que estés interesado en saber nuestros horarios disponibles. Para darte una respuesta precisa, te sugiero consultar en el sistema nuestra disponibilidad. Entonces llamemos a la función de consultar disponibilidad.',
    tools
  ) === false,
  'párrafo largo que menciona el tema de paso no dispara (evita falso positivo — se corrige por el refuerzo del prompt, no por esta guardia)'
);
assert(esRespuestaSoloNombreDeTool('', tools) === false, 'texto vacío no dispara');
assert(esRespuestaSoloNombreDeTool(null, tools) === false, 'texto null no dispara');
assert(esRespuestaSoloNombreDeTool('Hola! ¿en qué te puedo ayudar? 😊', tools) === false, 'saludo normal no dispara');
assert(esRespuestaSoloNombreDeTool('consultar_disponibilidad', []) === false, 'sin tools no dispara nunca');
assert(esRespuestaSoloNombreDeTool('consultar_disponibilidad', null) === false, 'tools null no rompe ni dispara');

console.log('\n✅ Todos los tests de tool-hallucination pasaron.\n');
