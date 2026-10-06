// tests/groq-modelo.test.js — si Groq retira el modelo configurado (404), el bot
// elige solo uno vigente y sigue respondiendo; sin red real.
'use strict';
const Module = require('module');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

const usados = [];
let disponibles = ['whisper-large-v3', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const cargarOriginal = Module._load;
Module._load = function (request, ...resto) {
  if (request === 'groq-sdk') {
    return class GroqFalso {
      constructor() {
        this.chat = { completions: { create: async (o) => {
          usados.push(o);
          if (!disponibles.includes(o.model)) { const e = new Error(`404 The model \`${o.model}\` does not exist or you do not have access to it.`); e.status = 404; throw e; }
          return { choices: [{ message: { role: 'assistant', content: 'ok' } }] };
        } } };
      }
    };
  }
  return cargarOriginal.call(this, request, ...resto);
};
const fetchOriginal = global.fetch;
global.fetch = async (url) => {
  if (!String(url).endsWith('/models')) throw new Error('url inesperada ' + url);
  return { ok: true, status: 200, json: async () => ({ data: disponibles.map((id) => ({ id })) }) };
};

(async () => {
  console.log('\n[groq-modelo] Tests:');
  const crear = require('../main/bot-engine/services/bot/groq.service');
  const logs = [];

  const g = crear({ apiKey: 'gsk_x', modelo: 'llama-3.1-8b-instant', log: (m) => logs.push(m) });
  const r = await g.llamarGroq([{ role: 'user', content: 'hola' }], true);
  assert(r.choices[0].message.content === 'ok', 'con el modelo retirado el bot igual obtiene respuesta');
  assert(usados.length === 2 && usados[1].model === 'openai/gpt-oss-120b', 'reintenta con el mejor modelo vigente de la lista de preferencia');
  assert(usados[1].reasoning_effort === 'low' && usados[1].max_tokens >= 1000, 'gpt-oss: razonamiento mínimo y margen de tokens');
  assert(logs.some((l) => /ya no está disponible/.test(l)), 'queda registrado el cambio de modelo');

  await g.llamarGroq([{ role: 'user', content: 'otra vez' }], true);
  assert(usados.length === 3 && usados[2].model === 'openai/gpt-oss-120b', 'recuerda el modelo elegido (no vuelve a fallar)');

  disponibles = ['whisper-large-v3'];
  const g2 = crear({ apiKey: 'gsk_x', modelo: 'viejo', log: () => {} });
  let error = null; try { await g2.llamarGroq([{ role: 'user', content: 'x' }], false); } catch (e) { error = e; }
  assert(error && error.status === 404, 'si no hay ningún modelo de chat, el error se informa (no se queda en bucle)');

  global.fetch = fetchOriginal;
  console.log('\n✅ Todos los tests de groq-modelo pasaron.\n');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
