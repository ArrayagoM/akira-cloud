// routes/demo.routes.js
// Demo público y anónimo del bot, para la landing. Habla con la IA REAL
// (mismo modelo, mismo flujo de tool-calling que el producto), pero contra
// un negocio ficticio y sin tocar Mongo, MercadoPago ni Google Calendar —
// nada de lo que pasa acá persiste ni afecta a ningún negocio real.
'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const crearGroqService = require('../services/bot/groq.service');
const logger = require('../config/logger');

const router = express.Router();

const MODELO = 'llama-3.1-8b-instant';
const NOMBRE_BOT = 'Sofía';
const NEGOCIO_DEMO = 'Estudio Bella (demo)';
const SERVICIOS_DEMO = [
  { nombre: 'Corte de pelo', precio: 6000 },
  { nombre: 'Coloración', precio: 15000 },
  { nombre: 'Manicura', precio: 4500 },
];
const HORARIOS_BASE = ['09:30', '10:00', '11:00', '12:30', '14:00', '15:30', '16:00', '17:30', '18:00'];

// ── Rate limit — endpoint público sin auth, cada mensaje cuesta tokens de
// Groq reales. 20 mensajes / 10 min por IP alcanza de sobra para que un
// visitante pruebe el bot, y acota el abuso. Se suma al límite global de
// server.js (300/15min) como segunda capa.
const demoLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Probaste bastante el demo por ahora — esperá unos minutos y volvé a intentar.' },
});

const groqSvc = crearGroqService({
  apiKey: process.env.GROQ_PLATFORM_API_KEY || process.env.GROQ_API_KEY,
  modelo: MODELO,
  tipoNegocio: 'turnos',
  log: (m) => logger.info(`[Demo] ${m}`),
});

function sysPromptInicial() {
  const hoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  const servicios = SERVICIOS_DEMO.map((s) => `- ${s.nombre}: $${s.precio.toLocaleString('es-AR')}`).join('\n');
  return `Sos ${NOMBRE_BOT}, la asistente virtual de ${NEGOCIO_DEMO}, una peluquería y centro de estética.
Este es un DEMO público en la web de Akira Cloud para que cualquier visitante pruebe cómo respondés — no es un negocio real, no hay turnos reales cargados y no se guarda ningún dato.

Hoy es ${hoy}. Horario de atención: lunes a sábado de 9:00 a 19:00 (domingo cerrado).

Servicios y precios:
${servicios}

Tu trabajo: conversar de forma natural y breve, como por WhatsApp (2-4 líneas). Entendé qué necesita el visitante, ofrecé horarios usando la herramienta consultar_disponibilidad, y agendá con agendar_turno SOLO después de que el visitante haya elegido un día y horario concretos y los haya confirmado. Nunca inventes horarios — la disponibilidad te la da siempre la herramienta.
Si te preguntan si sos un bot o si esto es real, respondé con honestidad: sos la demo de Akira Cloud.`;
}

function sysPromptFinal() {
  return `Sos ${NOMBRE_BOT}, asistente de ${NEGOCIO_DEMO} (demo de Akira Cloud). Ya ejecutaste una acción y tenés su resultado en el último mensaje de rol "tool". Redactá la respuesta final para el visitante: natural, breve (2-4 líneas), tono de WhatsApp, sin inventar datos que no estén en el resultado de la herramienta.`;
}

// Slots "libres" deterministas por fecha (misma fecha → mismos horarios),
// sin ningún estado real detrás — es una simulación, no un calendario.
function slotsFalsos(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ['10:00', '14:00', '17:00'];
  if (d.getDay() === 0) return []; // domingo cerrado
  const seed = fechaStr.split('-').reduce((a, n) => a + (parseInt(n, 10) || 0), 0);
  const picks = [0, 1, 2].map((i) => HORARIOS_BASE[(seed + i * 3) % HORARIOS_BASE.length]);
  return [...new Set(picks)].sort();
}

// El modelo a veces "alucina" el nombre de una tool como texto plano en vez
// de invocarla de verdad (ej: responde literalmente "consultar_disponibilidad
// {...}") — ya pasó en producción con el bot real (ver akira.bot.js) y acá
// se replica la misma guardia: si TODA la respuesta es solo el nombre de una
// tool conocida (con o sin el JSON de argumentos pegado), no se la mandamos
// al visitante tal cual.
function esRespuestaSoloNombreDeTool(texto, tools) {
  if (!texto || !Array.isArray(tools) || !tools.length) return false;
  // Etiqueta estilo XML de "function call" en medio de una oración (ej:
  // '...te averiguo. <function=consultar_disponibilidad>{"fecha":"..."}</function>')
  // — nunca es válida, sin importar el resto del texto.
  if (/<function[\s=]/i.test(texto) || /<\/function>/i.test(texto)) return true;
  // Bloque JSON de argumentos suelto en medio de una oración normal (ej:
  // '...Busca horarios libres {"fecha": "2026-08-14"}') — un negocio real
  // nunca manda JSON crudo por WhatsApp, así que esto es siempre alucinación.
  if (/\{\s*"[\w]+"\s*:/.test(texto)) return true;
  const sinArgs = texto.trim().replace(/\{[\s\S]*\}\s*$/, '').trim();
  const normalizado = sinArgs.toLowerCase().replace(/[.,!?¡¿'"´`]+$/g, '').trim();
  if (!normalizado) return false;
  return tools.some((t) => {
    const nombre = t?.function?.name;
    if (!nombre) return false;
    const n = nombre.toLowerCase();
    return normalizado === n || normalizado === n.replace(/_/g, ' ');
  });
}

async function ejecutarToolDemo(tool) {
  let args = {};
  try { args = JSON.parse(tool.function.arguments || '{}'); } catch {}

  switch (tool.function.name) {
    case 'consultar_disponibilidad': {
      const slots = slotsFalsos(args.fecha);
      return slots.length
        ? `Horarios disponibles el ${args.fecha}: ${slots.join(', ')}.`
        : `No hay horarios disponibles el ${args.fecha} (cerrado o fuera de horario de atención). Probá otro día de lunes a sábado.`;
    }
    case 'agendar_turno':
      return `[DEMO] Turno simulado confirmado para el ${args.fecha} a las ${args.hora}. Esto es una demostración — no se guardó ningún dato real ni se agendó nada de verdad.`;
    case 'cancelar_turno':
      return 'Es una demo — no hay turnos reales cargados para cancelar. En el producto real, esto cancela el turno pagado del cliente.';
    case 'reagendar_turno':
      return 'Es una demo — no hay turnos reales para reagendar. En el producto real, esto mueve el turno del cliente sin cobrar de nuevo.';
    default:
      return 'Esa acción no está disponible en el demo.';
  }
}

// ── POST /api/demo/chat ──────────────────────────────────────────
router.post('/chat', demoLimiter, async (req, res) => {
  try {
    let { mensaje, historial } = req.body || {};
    mensaje = String(mensaje || '').slice(0, 300).trim();
    if (!mensaje) return res.status(400).json({ error: 'Falta el mensaje.' });

    const histLimpio = (Array.isArray(historial) ? historial : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-8)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 500) }));

    const msgs = [{ role: 'system', content: sysPromptInicial() }, ...histLimpio, { role: 'user', content: mensaje }];

    let resp1 = await groqSvc.llamarGroq(msgs, true);
    let choice = resp1.choices?.[0]?.message;
    if (!choice) throw new Error('Respuesta vacía de Groq');

    if (!choice.tool_calls?.length && esRespuestaSoloNombreDeTool(choice.content, groqSvc.herramientas())) {
      try {
        resp1 = await groqSvc.llamarGroq(msgs, true);
        choice = resp1.choices?.[0]?.message || choice;
      } catch {}
      if (!choice.tool_calls?.length && esRespuestaSoloNombreDeTool(choice.content, groqSvc.herramientas())) {
        choice = { role: 'assistant', content: 'Dejame confirmarte eso en un segundo 🙏 ¿me repetís la consulta?' };
      }
    }

    if (choice.tool_calls?.length) {
      const toolCalls = choice.tool_calls.slice(0, 3);
      const toolResultados = [];
      for (const t of toolCalls) {
        const contenido = await ejecutarToolDemo(t);
        toolResultados.push({ role: 'tool', tool_call_id: t.id, name: t.function.name, content: contenido });
      }
      const msgs2 = [
        { role: 'system', content: sysPromptFinal() },
        ...histLimpio,
        { role: 'user', content: mensaje },
        { role: 'assistant', content: choice.content || '', tool_calls: toolCalls },
        ...toolResultados,
      ];
      const resp2 = await groqSvc.llamarGroq(msgs2, false);
      const textoFinal = resp2.choices?.[0]?.message?.content?.trim();
      return res.json({ respuesta: textoFinal || 'Listo.' });
    }

    return res.json({ respuesta: (choice.content || '').trim() || 'Contame en qué te puedo ayudar.' });
  } catch (err) {
    if (err.isRateLimit) return res.status(503).json({ error: 'El demo está muy pedido en este momento — probá en un minuto.' });
    if (err.isTimeout) return res.status(504).json({ error: 'Tardó demasiado en responder. Probá de nuevo.' });
    if (err.isAuthError) return res.status(503).json({ error: 'Demo temporalmente no disponible.' });
    logger.error(`[Demo] Error: ${err.message}`);
    return res.status(500).json({ error: 'Ocurrió un error en el demo. Probá de nuevo en un momento.' });
  }
});

module.exports = router;
