// services/bot/groq.service.js
// Llamadas al LLM Groq con manejo de rate-limit y herramientas.
'use strict';

const Groq = require('groq-sdk');

function crearGroqService({ apiKey, modelo, log, tipoNegocio = 'turnos', catalogo = [] }) {
  if (!apiKey) {
    log?.('[Groq] ⚠️ GROQ_API_KEY no está configurada — el bot no podrá responder mensajes. Configurala desde el dashboard.');
  }
  const groq = new Groq({ apiKey: apiKey || 'invalid' });
  let groqBloqueadoHasta = 0;

  // ── Tool: buscar en catálogo de productos ──────────────────
  const toolCatalogo = { type: 'function', function: {
    name: 'consultar_catalogo',
    description: 'Busca productos en el catálogo del negocio. Úsala cuando el cliente pregunte por productos, precios, stock o disponibilidad de artículos.',
    parameters: { type: 'object', properties: {
      query:    { type: 'string',  description: 'Nombre o descripción del producto a buscar.' },
      categoria:{ type: 'string',  description: 'Categoría específica a filtrar (opcional).' },
    }, required: [] },
  }};

  function herramientas() {
    const tieneCat = Array.isArray(catalogo) && catalogo.length > 0;
    if (tipoNegocio === 'alojamiento') {
      const tools = [
        { type: 'function', function: { name: 'consultar_disponibilidad_alojamiento', description: 'Verifica disponibilidad para fechas dadas. Si hay múltiples unidades, consulta cada una por separado pasando nombre_unidad. Úsala SIEMPRE ante preguntas de disponibilidad.', parameters: { type: 'object', properties: { fecha_entrada: { type: 'string', description: 'YYYY-MM-DD' }, fecha_salida: { type: 'string', description: 'YYYY-MM-DD' }, nombre_unidad: { type: 'string', description: 'Nombre exacto de la unidad (cabaña, departamento, etc.). Omitir para buscar en todas.' }, huespedes: { type: 'number', description: 'Cantidad de huéspedes (para filtrar por capacidad).' } }, required: ['fecha_entrada', 'fecha_salida'] } } },
        { type: 'function', function: { name: 'agendar_alojamiento',                  description: 'Confirma y registra la reserva. SOLO llamar si: (1) se consultó disponibilidad, (2) está disponible, (3) cliente confirmó. Si hay varias unidades, incluir nombre_unidad.', parameters: { type: 'object', properties: { fecha_entrada: { type: 'string' }, fecha_salida: { type: 'string' }, nombre_unidad: { type: 'string', description: 'Nombre exacto de la unidad elegida.' } }, required: ['fecha_entrada', 'fecha_salida'] } } },
        { type: 'function', function: { name: 'cancelar_alojamiento',                 description: 'Cancela una reserva de alojamiento existente.', parameters: { type: 'object', properties: { fecha_entrada: { type: 'string' }, nombre_unidad: { type: 'string' } }, required: ['fecha_entrada'] } } },
        { type: 'function', function: { name: 'reagendar_alojamiento',                description: 'Cambia las fechas de una reserva existente.', parameters: { type: 'object', properties: { fecha_entrada_actual: { type: 'string' }, fecha_entrada_nueva: { type: 'string' }, fecha_salida_nueva: { type: 'string' }, nombre_unidad: { type: 'string' } }, required: ['fecha_entrada_actual', 'fecha_entrada_nueva', 'fecha_salida_nueva'] } } },
      ];
      if (tieneCat) tools.push(toolCatalogo);
      return tools;
    }
    const tools = [
      { type: 'function', function: { name: 'consultar_disponibilidad', description: 'Busca horarios libres. Úsala SIEMPRE ante preguntas de disponibilidad.', parameters: { type: 'object', properties: { fecha: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['fecha'] } } },
      { type: 'function', function: { name: 'agendar_turno',            description: 'SOLO llamar si: (1) se consultó disponibilidad, (2) cliente eligió día Y hora, (3) cliente confirmó con sí/dale/reservame.', parameters: { type: 'object', properties: { fecha: { type: 'string' }, hora: { type: 'string' }, hora_fin: { type: 'string' } }, required: ['fecha', 'hora'] } } },
      { type: 'function', function: { name: 'cancelar_turno',           description: 'Cancela turno YA PAGADO.', parameters: { type: 'object', properties: { fecha: { type: 'string' }, hora: { type: 'string' } }, required: ['fecha', 'hora'] } } },
      { type: 'function', function: { name: 'reagendar_turno',          description: 'Mueve turno pagado sin cobrar de nuevo.', parameters: { type: 'object', properties: { fecha_actual: { type: 'string' }, hora_actual: { type: 'string' }, hora_fin_actual: { type: 'string' }, fecha_nueva: { type: 'string' }, hora_nueva: { type: 'string' } }, required: ['fecha_actual', 'hora_actual', 'fecha_nueva', 'hora_nueva'] } } },
    ];
    if (tieneCat) tools.push(toolCatalogo);
    return tools;
  }

  async function llamarGroq(msgs, conTools = true) {
    if (Date.now() < groqBloqueadoHasta) {
      const e = new Error('RATE_LIMIT');
      e.isRateLimit = true;
      throw e;
    }
    const opts = { model: modelo, messages: msgs, max_tokens: 512 };
    if (conTools) { opts.tools = herramientas(); opts.tool_choice = 'auto'; }

    // Timeout de 25s — si Groq no responde, lanzamos error en vez de colgar
    const TIMEOUT_MS = 25_000;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => {
        const e = new Error('GROQ_TIMEOUT');
        e.isTimeout = true;
        reject(e);
      }, TIMEOUT_MS)
    );

    try {
      const resp = await Promise.race([groq.chat.completions.create(opts), timeout]);
      return resp;
    } catch (err) {
      if (err.isTimeout) {
        log?.('[Groq] ⚠️ Timeout 25s — Groq no respondió a tiempo');
        throw err;
      }
      if (err.status === 429) {
        // Parsear duración del rate limit desde el mensaje de Groq
        // Soporta: "try again in 2m30.5s", "try again in 2m", "try again in 45.3s"
        const mMin = err.message.match(/try again in (\d+)m(?:([\d.]+)s)?/i);
        const mSec = err.message.match(/try again in ([\d.]+)s/i);
        const mMs  = err.message.match(/(\d+)ms/i);
        if (mMin) {
          const mins = parseInt(mMin[1]);
          const secs = mMin[2] ? Math.ceil(parseFloat(mMin[2])) : 0;
          const wait = (mins * 60 + secs) * 1000 + 5000;
          groqBloqueadoHasta = Date.now() + wait;
          log?.(`[Groq] Rate-limit ${mins}m${secs}s — esperando ${Math.round(wait/1000)}s`);
        } else if (mSec) {
          const wait = Math.ceil(parseFloat(mSec[1])) * 1000 + 2000;
          groqBloqueadoHasta = Date.now() + wait;
          log?.(`[Groq] Rate-limit ${mSec[1]}s — esperando ${Math.round(wait/1000)}s`);
        } else if (mMs) {
          const wait = parseInt(mMs[1]) + 1000;
          groqBloqueadoHasta = Date.now() + wait;
          log?.(`[Groq] Rate-limit ${mMs[1]}ms — esperando ${Math.round(wait/1000)}s`);
        } else {
          groqBloqueadoHasta = Date.now() + 3 * 60000;
          log?.('[Groq] Rate-limit sin duración — esperando 3 min');
        }
        const e = new Error('RATE_LIMIT');
        e.isRateLimit = true;
        throw e;
      }
      if (err.status === 401) {
        log?.('[Groq] ❌ API Key inválida o no configurada. Configurala desde el dashboard.');
        const e = new Error('GROQ_AUTH_ERROR');
        e.isAuthError = true;
        throw e;
      }
      if (err.status === 400 && err.message.includes('tool_use_failed')) {
        try { return await Promise.race([groq.chat.completions.create(opts), timeout]); }
        catch (e2) {
          if (e2.isTimeout) throw e2;
          const er = new Error('TOOL_USE_FAILED'); er.isToolUseFailed = true; throw er;
        }
      }
      throw err;
    }
  }

  return { llamarGroq, herramientas };
}

module.exports = crearGroqService;
