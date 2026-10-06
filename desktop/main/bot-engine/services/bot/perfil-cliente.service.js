// services/bot/perfil-cliente.service.js
// Memoria de LARGO PLAZO por cliente ("perfilResumen"): unas pocas líneas que
// resumen cómo tratar a un cliente puntual (formal/informal, cliente frecuente,
// suele cancelar, método de pago preferido, etc). A diferencia de
// usuario.historial (que se trunca a MAX_HIST mensajes en akira.bot.js), este
// campo NUNCA se resetea — vive en el documento del cliente en MongoDB y
// persiste indefinidamente.
//
// Para no gastar tokens de más, NO se actualiza en cada mensaje: solo cuando
// el historial local está a punto de truncarse (llega al límite MAX_HIST), se
// le pide al LLM una llamada corta y SIN tools que actualice el resumen antes
// de que esos mensajes viejos se descarten del contexto.
//
// Este módulo separa la lógica PURA (testeable sin red) de la orquestación
// que sí llama a Groq (actualizarPerfilResumen) — esa parte no se puede testear
// sin API key, así que los tests cubren únicamente las funciones puras.
'use strict';

// Tope de longitud del resumen persistido — "unas pocas líneas", no un historial.
const MAX_RESUMEN_CHARS = 600;

// ── Pura: ¿corresponde actualizar el perfil ahora? ────────────────────────
// Se dispara justo cuando el historial CRUDO (antes de recortar) alcanza o
// supera el límite que se usa para armar el contexto de Groq (MAX_HIST) —
// es decir, en el mismo momento en que esos mensajes viejos van a quedar
// afuera del historial que se manda al LLM.
function debeActualizarPerfil(historial, maxHist) {
  if (!Array.isArray(historial)) return false;
  if (!Number.isFinite(maxHist) || maxHist <= 0) return false;
  return historial.length > maxHist;
}

// ── Pura: arma los mensajes para la llamada corta a Groq (SIN tools) ─────
function armarPromptResumen({ perfilActual, historial, nombreCliente, maxMensajes = 30 } = {}) {
  const nombre = nombreCliente && String(nombreCliente).trim() ? String(nombreCliente).trim() : 'el cliente';

  const conversacion = (Array.isArray(historial) ? historial : [])
    .slice(-maxMensajes)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => `${m.role === 'user' ? nombre : 'Asistente'}: ${String(m.content).slice(0, 300)}`)
    .join('\n');

  const sysContent =
    'Sos un analista que arma notas cortas de atención al cliente para un negocio de WhatsApp. ' +
    'A partir del perfil actual (si existe) y la conversación reciente, actualizá el perfil en 2 a 4 ' +
    'líneas MUY breves. Incluí SOLO datos útiles y estables para atender mejor la próxima vez: ' +
    'cómo prefiere que le hablen (formal/informal), si es cliente frecuente, si suele cancelar o ' +
    'llegar tarde, método de pago preferido, preferencias de horario, y cualquier otra nota relevante ' +
    'para la atención. NO incluyas fechas u horas de turnos puntuales ni datos sensibles (no repitas ' +
    'contraseñas, tokens ni datos bancarios). Respondé SOLO con el texto del perfil actualizado, sin ' +
    'encabezados, sin comillas y sin explicaciones adicionales.';

  const userContent =
    `Perfil actual de ${nombre}: ${perfilActual && String(perfilActual).trim() ? perfilActual : '(sin datos previos)'}\n\n` +
    `Conversación reciente:\n${conversacion || '(sin mensajes)'}\n\n` +
    `Actualizá el perfil de ${nombre}.`;

  return [
    { role: 'system', content: sysContent },
    { role: 'user', content: userContent },
  ];
}

// ── Pura: limpia/normaliza el texto que devuelve el LLM ───────────────────
// Si el LLM no devuelve nada usable, conserva el perfil anterior (nunca borra
// el conocimiento acumulado por una respuesta vacía o rara).
function extraerTextoResumen(respuestaTexto, perfilAnterior = '') {
  const anterior = perfilAnterior ? String(perfilAnterior).trim() : '';
  if (!respuestaTexto || typeof respuestaTexto !== 'string') return anterior;

  let t = respuestaTexto
    .replace(/```[\s\S]*?```/g, '') // bloques de código sueltos
    .replace(/^["'`]+|["'`]+$/g, '') // comillas envolventes
    .trim();

  if (!t) return anterior;
  if (t.length > MAX_RESUMEN_CHARS) t = `${t.slice(0, MAX_RESUMEN_CHARS).trim()}…`;
  return t;
}

// ── Pura: línea a insertar en el system prompt del bot ────────────────────
function formatearNotaPerfil(perfilResumen) {
  if (!perfilResumen || !String(perfilResumen).trim()) return '';
  return `📝 Notas sobre este cliente: ${String(perfilResumen).trim()}\n`;
}

// ── Orquesta la llamada real a Groq (NO testeable sin GROQ_API_KEY) ───────
// Devuelve el nuevo perfilResumen, o el anterior si algo falla — nunca lanza.
async function actualizarPerfilResumen({ groqSvc, perfilActual, historial, nombreCliente, maxHist = 30, log } = {}) {
  const anterior = perfilActual ? String(perfilActual).trim() : '';
  try {
    if (!groqSvc || typeof groqSvc.llamarGroq !== 'function') return anterior;
    const msgs = armarPromptResumen({ perfilActual: anterior, historial, nombreCliente, maxMensajes: maxHist });
    // conTools=false: llamada corta, sin herramientas — solo texto.
    const resp = await groqSvc.llamarGroq(msgs, false);
    const texto = resp?.choices?.[0]?.message?.content;
    const nuevo = extraerTextoResumen(texto, anterior);
    log?.(`[PerfilCliente] 🧠 Perfil de largo plazo actualizado (${nuevo.length} chars)`);
    return nuevo;
  } catch (e) {
    log?.(`[PerfilCliente] ⚠️ No se pudo actualizar el perfil de largo plazo: ${e.message}`);
    return anterior;
  }
}

module.exports = {
  MAX_RESUMEN_CHARS,
  debeActualizarPerfil,
  armarPromptResumen,
  extraerTextoResumen,
  formatearNotaPerfil,
  actualizarPerfilResumen,
};
