// tests/voz-rime.test.js — las respuestas en audio usan voces en español que EXISTEN en Rime (antes se usaban voces inexistentes y
// todos los audios fallaban en silencio: el bot respondía solo con texto sin avisar nada).
'use strict';
const https = require('https');
const { EventEmitter } = require('events');
const crearAudioService = require('../main/bot-engine/services/bot/audio.service');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[voz Rime] Tests:');
  // Lista oficial de Rime (https://users.rime.ai/data/voices/all-v2.json, modelo mistv3, idioma "spa") al 13/10/2026
  const OFICIALES_MISTV3_ES = ['diego', 'dolores', 'isa', 'jose', 'lucia', 'mari', 'mateo', 'pablo', 'pola', 'seraphina', 'sirius', 'sofia'];
  assert(crearAudioService.MODELO_VOZ === 'mistv3', 'usa el modelo mistv3 (el único con voces en español en esta lista)');
  assert(crearAudioService.VOCES_ES.length >= 2 && crearAudioService.VOCES_ES.every((v) => OFICIALES_MISTV3_ES.includes(v)), `todas las voces existen en español: ${crearAudioService.VOCES_ES.join(', ')}`);
  assert(!crearAudioService.VOCES_ES.some((v) => ['valentina', 'isabella', 'camila', 'luna'].includes(v)), 'ya no usa las voces que no existen (valentina, isabella, camila, luna)');

  const original = https.request; const pedidos = []; let comportamiento = () => ({ status: 200, tipo: 'audio/mpeg', cuerpo: Buffer.from('MP3') });
  https.request = (opts, cb) => {
    const req = new EventEmitter(); let body = '';
    req.write = (b) => { body += b; };
    req.end = () => {
      const p = JSON.parse(body); pedidos.push({ opts, p }); const r = comportamiento(p);
      const res = new EventEmitter(); res.statusCode = r.status; res.headers = { 'content-type': r.tipo };
      cb(res); res.emit('data', r.cuerpo); res.emit('end');
    };
    return req;
  };
  try {
    const logs = []; const enviados = [];
    const svc = crearAudioService({ groqApiKey: 'x', rimeApiKey: 'clave-de-prueba', dataDir: '.', log: (m) => logs.push(m) });
    assert(svc.debeResponderEnAudio('Hola, ¿cómo estás?') === true && svc.debeResponderEnAudio('mirá https://mp.com/pagar') === false, 'solo responde en audio cuando tiene sentido (sin links)');

    let ok = await svc.enviarComoAudio('jid', 'Hola, tu turno quedó confirmado', async (jid, buf) => { enviados.push([jid, buf.toString()]); });
    assert(ok === true && enviados.length === 1 && pedidos.length === 1, 'genera y envía el audio con la primera voz');
    assert(pedidos[0].p.speaker === crearAudioService.VOCES_ES[0] && pedidos[0].p.modelId === 'mistv3' && pedidos[0].p.lang === 'es', 'el pedido a Rime lleva la voz, el modelo y el idioma correctos');
    assert(pedidos[0].opts.hostname === 'users.rime.ai' && pedidos[0].opts.headers.Authorization === 'Bearer clave-de-prueba', 'se usa la clave del usuario');

    pedidos.length = 0; comportamiento = (p) => (p.speaker === crearAudioService.VOCES_ES[0] ? { status: 400, tipo: 'application/json', cuerpo: Buffer.from('{"error":"x"}') } : { status: 200, tipo: 'audio/mpeg', cuerpo: Buffer.from('MP3') });
    ok = await svc.enviarComoAudio('jid', 'Otra respuesta', async () => {});
    assert(ok === true && pedidos.length === 2 && pedidos[1].p.speaker === crearAudioService.VOCES_ES[1], 'si una voz falla, prueba la siguiente');

    pedidos.length = 0; logs.length = 0; comportamiento = () => ({ status: 400, tipo: 'application/json', cuerpo: Buffer.from('{"error":{"message":"Speaker no existe"}}') });
    ok = await svc.enviarComoAudio('jid', 'Respuesta que no se puede hablar', async () => {});
    assert(ok === false && pedidos.length === crearAudioService.VOCES_ES.length, 'si todas fallan, devuelve false (el bot responde con texto)');
    assert(logs.length === 1 && /no se pudo generar el audio/.test(logs[0]) && /Speaker no existe/.test(logs[0]), 'y ahora queda registrado el motivo en el log (antes fallaba en silencio)');
    assert(!JSON.stringify(logs).includes('clave-de-prueba'), 'la clave nunca se escribe en el log');
    assert(crearAudioService({ groqApiKey: 'x', rimeApiKey: '', dataDir: '.', log() {} }).debeResponderEnAudio('hola') === false, 'sin clave de Rime no se intenta nada');
  } finally { https.request = original; }
  console.log('\n✅ Todos los tests de la voz de Rime pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
