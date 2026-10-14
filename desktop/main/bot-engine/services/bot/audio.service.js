// services/bot/audio.service.js
// Transcripción de voz (STT via Groq/Whisper) y síntesis de voz (TTS via Rime).
// Compatible con Baileys: recibe buffer directamente en vez de msg.downloadMedia().
'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const VOCES_ES = ['lucia', 'sofia', 'mari', 'isa'];
const MODELO_VOZ = 'mistv3';

function crearAudioService({ groqApiKey, rimeApiKey, dataDir, log }) {
  // ── STT — Whisper via Groq ────────────────────────────────
  // Recibe el buffer de audio ya descargado por Baileys (downloadMediaMessage).
  async function transcribirAudioBuffer(buffer, mimetype = 'audio/ogg; codecs=opus') {
    let tmp = null;
    try {
      const ext = mimetype.includes('mp4') || mimetype.includes('mpeg') ? 'mp4' : 'ogg';
      tmp = path.join(dataDir, `_audio_${Date.now()}.${ext}`);
      fs.writeFileSync(tmp, buffer);

      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', fs.createReadStream(tmp), { filename: `audio.${ext}`, contentType: mimetype });
      form.append('model', 'whisper-large-v3');
      form.append('language', 'es');
      form.append('response_format', 'text');

      return await new Promise((res, rej) => {
        const req = https.request(
          {
            hostname: 'api.groq.com',
            path:     '/openai/v1/audio/transcriptions',
            method:   'POST',
            headers:  { ...form.getHeaders(), Authorization: `Bearer ${groqApiKey}` },
          },
          (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d.trim() || null)); }
        );
        req.on('error', rej);
        form.pipe(req);
      });
    } catch (e) { log('[STT] Error: ' + e.message); return null; }
    finally { if (tmp && fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch {} } }
  }

  // ── TTS — Rime.ai ─────────────────────────────────────────
  function debeResponderEnAudio(texto) {
    if (!rimeApiKey) return false;
    return ![/https?:\/\//i, /mercadopago/i, /calendar\.google/i, /@[^\s]+\.[a-z]{2,}/i].some(p => p.test(texto));
  }

  function prepararTextoAudio(texto) {
    return texto
      .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
      .replace(/[\u2600-\u27FF]/gu, '')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\$(\d+)/g, '$1 pesos')
      .replace(/https?:\/\/\S+/g, 'el link que te mandé')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // enviarAudioFn recibe (jid, buffer) y lo envía como voice note via Baileys.
  async function enviarComoAudio(jid, texto, enviarAudioFn) {
    const tl = prepararTextoAudio(texto);
    if (!tl) return false;
    // Voces en español del modelo mistv3 (las anteriores —valentina, isabella, camila, luna con arcana-v2— no existen en español y todas las respuestas en audio fallaban sin avisar).
    let ultimoError = null;
    for (const voz of VOCES_ES) {
      try {
        const body = JSON.stringify({ speaker: voz, text: tl, modelId: MODELO_VOZ, lang: 'es', speedAlpha: 0.95 });
        const buf = await new Promise((res, rej) => {
          const req = https.request(
            {
              hostname: 'users.rime.ai',
              path:     '/v1/rime-tts',
              method:   'POST',
              headers:  { Accept: 'audio/mp3', 'Content-Type': 'application/json', Authorization: `Bearer ${rimeApiKey}` },
            },
            (r) => {
              const c = [];
              r.on('data', d => c.push(d));
              r.on('end', () => {
                const b = Buffer.concat(c);
                if ((r.headers['content-type'] || '').includes('json') || r.statusCode >= 400) rej(new Error(`TTS ${r.statusCode}: ${b.toString('utf8').slice(0, 160)}`));
                else res(b);
              });
            }
          );
          req.on('error', rej);
          req.write(body);
          req.end();
        });
        await enviarAudioFn(jid, buf);
        return true;
      } catch (e) { ultimoError = e; }
    }
    if (ultimoError) log?.(`⚠️ [Voz] no se pudo generar el audio (se responde con texto): ${ultimoError.message}`);
    return false;
  }

  return { transcribirAudioBuffer, debeResponderEnAudio, enviarComoAudio };
}

module.exports = crearAudioService;

module.exports.VOCES_ES = VOCES_ES;
module.exports.MODELO_VOZ = MODELO_VOZ;
