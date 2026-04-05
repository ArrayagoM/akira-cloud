'use strict';

const Groq   = require('groq-sdk');
const logger = require('../config/logger');

const MODELO = 'llama-3.3-70b-versatile';

async function analizarSugerencia(texto, groqApiKey) {
  const groq = new Groq({ apiKey: groqApiKey });

  const systemPrompt = `Sos un product manager experto analizando sugerencias de mejora para "Akira Cloud", un SaaS de WhatsApp bots para negocios argentinos (barberías, lavaderos, mecánicos, veterinarias, etc.).

Analizá la sugerencia del usuario y respondé ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "puntuacion": <número del 1 al 10>,
  "categoria": "<una de: UX, Bot, Seguridad, Integración, Negocio, Performance, Otro>",
  "resumen": "<resumen en 1 oración de qué propone el usuario>",
  "valor": "<por qué esta idea agrega valor al producto, máx 2 oraciones>",
  "dificultad": "<baja|media|alta>",
  "prioridad": "<baja|media|alta|crítica>"
}

Criterios de puntuación:
- 9-10: Idea brillante, impacto directo en retención/conversión, relativamente fácil
- 7-8: Muy buena idea, vale la pena implementar pronto
- 5-6: Buena idea, para el backlog
- 3-4: Posible, pero baja prioridad
- 1-2: Fuera de scope, muy compleja, o ya existe

Respondé SOLO el JSON, sin texto adicional.`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODELO,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Sugerencia: "${texto}"` },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    // Extraer JSON aunque haya texto alrededor
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Respuesta IA sin JSON');
    const parsed = JSON.parse(match[0]);

    return {
      puntuacion: Math.max(1, Math.min(10, parseInt(parsed.puntuacion) || 5)),
      analisisIA: {
        resumen:    String(parsed.resumen    || '').slice(0, 300),
        categoria:  String(parsed.categoria  || 'Otro').slice(0, 50),
        valor:      String(parsed.valor      || '').slice(0, 400),
        dificultad: String(parsed.dificultad || 'media').slice(0, 20),
        prioridad:  String(parsed.prioridad  || 'media').slice(0, 20),
      },
    };
  } catch (err) {
    logger.error('[Suggestion] Error análisis IA:', err.message);
    return {
      puntuacion: 5,
      analisisIA: {
        resumen: texto.slice(0, 100),
        categoria: 'Otro',
        valor: 'Análisis no disponible',
        dificultad: 'media',
        prioridad: 'media',
      },
    };
  }
}

module.exports = { analizarSugerencia };
