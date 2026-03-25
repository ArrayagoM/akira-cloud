// services/bot/groq.service.js
// Llamadas al LLM Groq con manejo de rate-limit y herramientas.
'use strict';

const Groq = require('groq-sdk');

function crearGroqService({ apiKey, modelo, log }) {
  const groq = new Groq({ apiKey });
  let groqBloqueadoHasta = 0;

  function herramientas() {
    return [
      { type: 'function', function: { name: 'consultar_disponibilidad', description: 'Busca horarios libres. Úsala SIEMPRE ante preguntas de disponibilidad.', parameters: { type: 'object', properties: { fecha: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['fecha'] } } },
      { type: 'function', function: { name: 'agendar_turno',            description: 'SOLO llamar si: (1) se consultó disponibilidad, (2) cliente eligió día Y hora, (3) cliente confirmó con sí/dale/reservame.', parameters: { type: 'object', properties: { fecha: { type: 'string' }, hora: { type: 'string' }, hora_fin: { type: 'string' } }, required: ['fecha', 'hora'] } } },
      { type: 'function', function: { name: 'cancelar_turno',           description: 'Cancela turno YA PAGADO.', parameters: { type: 'object', properties: { fecha: { type: 'string' }, hora: { type: 'string' } }, required: ['fecha', 'hora'] } } },
      { type: 'function', function: { name: 'reagendar_turno',          description: 'Mueve turno pagado sin cobrar de nuevo.', parameters: { type: 'object', properties: { fecha_actual: { type: 'string' }, hora_actual: { type: 'string' }, hora_fin_actual: { type: 'string' }, fecha_nueva: { type: 'string' }, hora_nueva: { type: 'string' } }, required: ['fecha_actual', 'hora_actual', 'fecha_nueva', 'hora_nueva'] } } },
    ];
  }

  async function llamarGroq(msgs, conTools = true) {
    if (Date.now() < groqBloqueadoHasta) {
      const e = new Error('RATE_LIMIT');
      e.isRateLimit = true;
      throw e;
    }
    const opts = { model: modelo, messages: msgs, max_tokens: 512 };
    if (conTools) { opts.tools = herramientas(); opts.tool_choice = 'auto'; }
    try {
      return await groq.chat.completions.create(opts);
    } catch (err) {
      if (err.status === 429) {
        const m = err.message.match(/try again in (\d+)m([\d.]+)s/i);
        groqBloqueadoHasta = Date.now() + (m ? (parseInt(m[1]) * 60 + Math.ceil(parseFloat(m[2]))) * 1000 + 5000 : 5 * 60000);
        const e = new Error('RATE_LIMIT');
        e.isRateLimit = true;
        throw e;
      }
      if (err.status === 400 && err.message.includes('tool_use_failed')) {
        try { return await groq.chat.completions.create(opts); }
        catch (e2) { const er = new Error('TOOL_USE_FAILED'); er.isToolUseFailed = true; throw er; }
      }
      throw err;
    }
  }

  return { llamarGroq, herramientas };
}

module.exports = crearGroqService;
