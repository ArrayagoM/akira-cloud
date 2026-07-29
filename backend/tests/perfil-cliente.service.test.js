// tests/perfil-cliente.service.test.js
// Tests de las partes PURAS de la memoria de largo plazo por cliente
// (perfilResumen). NO se testea la llamada real a Groq (actualizarPerfilResumen
// internamente la usa) porque requiere GROQ_API_KEY — en cambio se inyecta un
// groqSvc falso para verificar la orquestación sin red.
'use strict';

const {
  MAX_RESUMEN_CHARS,
  debeActualizarPerfil,
  armarPromptResumen,
  extraerTextoResumen,
  formatearNotaPerfil,
  actualizarPerfilResumen,
} = require('../services/bot/perfil-cliente.service');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[perfil-cliente.service] Tests:');

// ── debeActualizarPerfil ───────────────────────────────────────────────
(() => {
  assert(debeActualizarPerfil(new Array(31), 30) === true, 'debeActualizarPerfil: 31 > 30 → true');
  assert(debeActualizarPerfil(new Array(30), 30) === false, 'debeActualizarPerfil: 30 == 30 → false (no dispara antes de tiempo)');
  assert(debeActualizarPerfil(new Array(5), 30) === false, 'debeActualizarPerfil: historial corto → false');
  assert(debeActualizarPerfil(null, 30) === false, 'debeActualizarPerfil: historial no-array → false, no explota');
  assert(debeActualizarPerfil([1, 2, 3], 0) === false, 'debeActualizarPerfil: maxHist=0 → false');
  assert(debeActualizarPerfil([1, 2, 3], -5) === false, 'debeActualizarPerfil: maxHist negativo → false');
  assert(debeActualizarPerfil([1, 2, 3], NaN) === false, 'debeActualizarPerfil: maxHist NaN → false');
})();

// ── armarPromptResumen ─────────────────────────────────────────────────
(() => {
  const historial = [
    { role: 'user', content: 'Hola, quiero un turno' },
    { role: 'assistant', content: 'Dale, ¿qué día te queda bien?' },
    { role: 'tool', content: 'Horarios libres: 10, 11' }, // debe ignorarse
    { role: 'user', content: 'El de las 10 porfa, y tratame de usted' },
  ];
  const msgs = armarPromptResumen({ perfilActual: 'Cliente formal', historial, nombreCliente: 'Carlos' });

  assert(Array.isArray(msgs) && msgs.length === 2, 'armarPromptResumen: devuelve [system, user]');
  assert(msgs[0].role === 'system', 'armarPromptResumen: primer mensaje es system');
  assert(msgs[1].role === 'user', 'armarPromptResumen: segundo mensaje es user');
  assert(!msgs.some((m) => m.role === 'tool'), 'armarPromptResumen: nunca incluye mensajes role=tool');
  assert(msgs[1].content.includes('Cliente formal'), 'armarPromptResumen: incluye el perfil actual');
  assert(msgs[1].content.includes('Carlos'), 'armarPromptResumen: incluye el nombre del cliente');
  assert(msgs[1].content.includes('tratame de usted'), 'armarPromptResumen: incluye contenido de la conversación');
  assert(!msgs[1].content.includes('Horarios libres'), 'armarPromptResumen: NO incluye mensajes de tools');

  // Sin perfil previo
  const msgsSinPerfil = armarPromptResumen({ perfilActual: '', historial, nombreCliente: 'Carlos' });
  assert(msgsSinPerfil[1].content.includes('sin datos previos'), 'armarPromptResumen: sin perfil previo usa placeholder');

  // Sin historial ni nombre — no debe explotar
  const msgsVacio = armarPromptResumen({});
  assert(Array.isArray(msgsVacio) && msgsVacio.length === 2, 'armarPromptResumen: no explota sin args');
  assert(msgsVacio[1].content.includes('el cliente'), 'armarPromptResumen: nombre por defecto "el cliente"');

  // Respeta el límite de mensajes recientes
  const historialLargo = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg${i}` }));
  const msgsLimitados = armarPromptResumen({ historial: historialLargo, maxMensajes: 5 });
  const apariciones = (msgsLimitados[1].content.match(/msg\d+/g) || []).length;
  assert(apariciones <= 5, `armarPromptResumen: respeta maxMensajes (encontró ${apariciones})`);
})();

// ── extraerTextoResumen ────────────────────────────────────────────────
(() => {
  assert(extraerTextoResumen('Cliente frecuente, prefiere trato formal.') === 'Cliente frecuente, prefiere trato formal.', 'extraerTextoResumen: texto simple se conserva');
  assert(extraerTextoResumen('  con espacios  \n') === 'con espacios', 'extraerTextoResumen: recorta espacios');
  assert(extraerTextoResumen('"entre comillas"') === 'entre comillas', 'extraerTextoResumen: quita comillas envolventes');
  assert(extraerTextoResumen('```json\n{}\n```texto real') === 'texto real', 'extraerTextoResumen: quita bloques de código');
  assert(extraerTextoResumen('', 'perfil viejo') === 'perfil viejo', 'extraerTextoResumen: string vacío conserva el anterior');
  assert(extraerTextoResumen(null, 'perfil viejo') === 'perfil viejo', 'extraerTextoResumen: null conserva el anterior');
  assert(extraerTextoResumen(undefined, '') === '', 'extraerTextoResumen: sin anterior ni nuevo → string vacío');
  assert(extraerTextoResumen(123, 'anterior') === 'anterior', 'extraerTextoResumen: tipo no-string conserva el anterior');

  const largo = 'a'.repeat(MAX_RESUMEN_CHARS + 200);
  const recortado = extraerTextoResumen(largo);
  assert(recortado.length <= MAX_RESUMEN_CHARS + 1, 'extraerTextoResumen: trunca a MAX_RESUMEN_CHARS');
  assert(recortado.endsWith('…'), 'extraerTextoResumen: agrega elipsis al truncar');
})();

// ── formatearNotaPerfil ────────────────────────────────────────────────
(() => {
  assert(formatearNotaPerfil('') === '', 'formatearNotaPerfil: vacío devuelve string vacío (no ensucia el prompt)');
  assert(formatearNotaPerfil(null) === '', 'formatearNotaPerfil: null devuelve string vacío');
  assert(formatearNotaPerfil('   ') === '', 'formatearNotaPerfil: solo espacios devuelve string vacío');
  const linea = formatearNotaPerfil('Prefiere trato informal, suele cancelar.');
  assert(linea.includes('Notas sobre este cliente'), 'formatearNotaPerfil: incluye el prefijo esperado');
  assert(linea.includes('Prefiere trato informal, suele cancelar.'), 'formatearNotaPerfil: incluye el contenido del perfil');
  assert(linea.endsWith('\n'), 'formatearNotaPerfil: termina en salto de línea (formato de línea de sysContent)');
})();

// ── actualizarPerfilResumen (orquestación, con groqSvc FALSO — sin red) ──
(async () => {
  // Caso feliz: el groqSvc falso devuelve un resumen nuevo
  const groqOk = {
    llamarGroq: async (msgs, conTools) => {
      assert(conTools === false, 'actualizarPerfilResumen: llama a Groq con conTools=false (sin tools)');
      assert(Array.isArray(msgs) && msgs.length === 2, 'actualizarPerfilResumen: pasa [system, user] a Groq');
      return { choices: [{ message: { content: 'Cliente nuevo: prefiere trato informal.' } }] };
    },
  };
  const logs = [];
  const nuevo = await actualizarPerfilResumen({
    groqSvc: groqOk,
    perfilActual: '',
    historial: [{ role: 'user', content: 'dale, tratame de vos' }],
    nombreCliente: 'Mica',
    maxHist: 30,
    log: (m) => logs.push(m),
  });
  assert(nuevo === 'Cliente nuevo: prefiere trato informal.', 'actualizarPerfilResumen: devuelve el resumen generado');
  assert(logs.some((l) => l.includes('actualizado')), 'actualizarPerfilResumen: loggea la actualización');

  // Caso de error: Groq tira una excepción → conserva el perfil anterior, no lanza
  const groqFalla = { llamarGroq: async () => { throw new Error('RATE_LIMIT'); } };
  const conservado = await actualizarPerfilResumen({
    groqSvc: groqFalla,
    perfilActual: 'Perfil previo intacto',
    historial: [],
    nombreCliente: 'Mica',
  });
  assert(conservado === 'Perfil previo intacto', 'actualizarPerfilResumen: si Groq falla, conserva el perfil anterior');

  // Sin groqSvc (defensivo) → conserva el perfil anterior sin explotar
  const sinServicio = await actualizarPerfilResumen({ perfilActual: 'Base', historial: [] });
  assert(sinServicio === 'Base', 'actualizarPerfilResumen: sin groqSvc conserva el perfil anterior');

  console.log('\n✅ Todos los tests de perfil-cliente.service pasaron.\n');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
