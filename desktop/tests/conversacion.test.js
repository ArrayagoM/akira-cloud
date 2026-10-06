// tests/conversacion.test.js
// Prueba de punta a punta de la ruta que usa un cliente real: llega un mensaje
// de WhatsApp → el bot arma el contexto, llama a la IA, responde y guarda la
// memoria. WhatsApp y Groq están simulados (sin red); todo lo demás es el
// código real: akira.bot.js, los servicios y la base local. Es la prueba que
// habría detectado el "Cannot find module 'mongoose'" al primer mensaje.
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const { EventEmitter } = require('events');
const Module = require('module');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await esperar(50); } return false; }

const logs = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-conv-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

// ── IA simulada (Groq): respuestas guiadas, sin red ─────────────────
const guion = [];            // cada elemento: función (mensajes) → message del asistente
const llamadasIA = [];
const cargarOriginal = Module._load;
Module._load = function (request, ...resto) {
  if (request === 'groq-sdk') {
    return class GroqFalso {
      constructor() {
        this.chat = { completions: { create: async (opts) => {
          llamadasIA.push(opts);
          const paso = guion.shift() || (() => ({ role: 'assistant', content: '(sin guion)' }));
          return { choices: [{ message: paso(opts.messages), finish_reason: 'stop' }], usage: {} };
        } } };
        this.audio = { transcriptions: { create: async () => ({ text: '' }) } };
      }
    };
  }
  return cargarOriginal.call(this, request, ...resto);
};

(async () => {
  console.log('\n[conversación] Tests:');
  await require('../main/esm-compat').preparar();

  const crearAkiraBot = require('../main/bot-engine/services/akira.bot');
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  const Turno = require('../main/bot-engine/models/Turno');

  // ── WhatsApp simulado ──
  const enviados = [];
  const ev = new EventEmitter();
  const sockFalso = {
    ev: { on: (n, f) => ev.on(n, f), off: (n, f) => ev.off(n, f), emit: (n, p) => ev.emit(n, p) },
    user: { id: '5492240000000:1@s.whatsapp.net' },
    sendMessage: async (jid, contenido) => { enviados.push({ jid, ...contenido }); return { key: { id: 'out' + enviados.length } }; },
    sendPresenceUpdate: async () => {},
    readMessages: async () => {},
    presenceSubscribe: async () => {},
    onWhatsApp: async () => [],
    ws: { ping() {} },
  };

  const USER = '69c3296b495d46dbcd9cbf88';
  const config = {
    GROQ_API_KEY: 'gsk_falsa', PLAN: 'admin', MI_NOMBRE: 'Juan', NEGOCIO: 'Barbería Test', SERVICIOS: 'turnos y reservas',
    PRECIO_TURNO: '1000', HORAS_MINIMAS_CANCELACION: '24', TIPO_NEGOCIO: 'turnos', MODO_PAUSA: 'false',
    HORARIOS_ATENCION: '{}', DIAS_BLOQUEADOS: '[]', SERVICIOS_LIST: '[]', CHATS_IGNORADOS: '[]', CATALOGO: '[]',
    CELULAR_NOTIFICACIONES: '', ALIAS_TRANSFERENCIA: '', CBU_TRANSFERENCIA: '', BANCO_TRANSFERENCIA: '',
  };
  const sessionDir = path.join(dir, 'sess'); const dataDir = path.join(sessionDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // quota.service local pega contra el servidor: se simula "permitido"
  require('../main/license/license-client').quotaCheck = async () => ({ permitido: true, usados: 1, limite: null });

  const bot = crearAkiraBot(config, dataDir, sessionDir, USER, { externalSock: sockFalso, descargarMedia: async () => Buffer.from('89504e470d0a1a0a', 'hex') });
  bot.on('log', (m) => logs.push(m));
  const stats = { in: 0, out: 0 }; bot.on('stat', (k) => { stats[k]++; });
  await bot.iniciar();
  ev.emit('connection.update', { connection: 'open' });
  await esperar(300);

  // El puerto del webhook propio no se abre (sobraba y quedaba expuesto en la red local)
  const abierto = await new Promise((res) => { const s = net.connect(3100, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
  assert(!abierto, 'el bot no abre un puerto propio (3100) en la red del cliente');

  const jid = '5492241497226@s.whatsapp.net';
  const mensaje = (texto, id) => ({ key: { remoteJid: jid, fromMe: false, id }, message: { conversation: texto }, pushName: 'Ana', messageTimestamp: Math.floor(Date.now() / 1000) });

  // ── 1) primer mensaje de un cliente nuevo: el bot lo saluda y registra su nombre ──
  ev.emit('messages.upsert', { type: 'notify', messages: [mensaje('Hola', 'M1')] });
  const respondio = await hasta(() => enviados.some((e) => /Hola, Ana/.test(e.text || '')));
  assert(respondio, 'el cliente escribe "Hola" y el bot le responde con su saludo de bienvenida');
  assert(!logs.some((l) => /Cannot find module|❌ Error handleMessage/.test(l)), 'sin errores en el procesamiento del mensaje');
  assert(stats.in >= 1 && stats.out >= 1, 'el bot avisa cada mensaje recibido y enviado (alimenta el contador "Mensajes hoy")');

  // ── 2) el cliente quedó guardado en la base local ──
  const guardado = await hasta(async () => !!(await BotCliente.findOne({ userId: USER, jid }).lean()));
  assert(guardado, 'el cliente queda guardado en la base local');
  const cli = await BotCliente.findOne({ userId: USER, jid }).lean();
  assert(cli.nombre === 'Ana', 'se guardó el nombre del cliente');

  // ── 2b) segundo mensaje: ahora sí conversa con la IA y la memoria se conserva ──
  guion.push(() => ({ role: 'assistant', content: 'Claro Ana, ¿para qué día querés el turno?' }));
  ev.emit('messages.upsert', { type: 'notify', messages: [mensaje('Quiero sacar un turno', 'M1b')] });
  const conIA = await hasta(() => enviados.some((e) => /para qué día/.test(e.text || '')));
  assert(conIA, 'el segundo mensaje se responde con la IA');
  assert(llamadasIA.length >= 1 && JSON.stringify(llamadasIA[0].messages).includes('Quiero sacar un turno'), 'la IA recibió lo que escribió el cliente');
  const hist = await hasta(async () => ((await BotCliente.findOne({ userId: USER, jid }).lean())?.historial || []).some((m) => /para qué día/.test(m.content || '')));
  assert(hist, 'la respuesta de la IA queda en el historial guardado del cliente');

  // ── 3) cliente que pregunta disponibilidad: la IA pide la herramienta y el bot la ejecuta ──
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  guion.push(() => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'consultar_disponibilidad', arguments: JSON.stringify({ fecha: manana }) } }] }));
  guion.push((msgs) => {
    const tool = msgs.filter((m) => m.role === 'tool').pop();
    return { role: 'assistant', content: 'Para mañana tengo estos horarios: ' + String(tool?.content || '').slice(0, 120) };
  });
  const antes = enviados.length;
  ev.emit('messages.upsert', { type: 'notify', messages: [mensaje('¿Qué horarios tenés mañana?', 'M2')] });
  const conHorarios = await hasta(() => enviados.length > antes);
  assert(conHorarios, 'ante una consulta de disponibilidad el bot ejecuta la herramienta y responde');
  assert(!logs.some((l) => /Cannot find module|TypeError|ReferenceError/.test(l)), 'la consulta de disponibilidad (calendario + base local) no falla');
  const respuestaHorarios = enviados[enviados.length - 1].text || '';
  assert(/\d{1,2}:\d{2}/.test(respuestaHorarios), 'la respuesta incluye horarios reales calculados por el bot');

  // ── 4) reserva: se crea el turno en la base local ──
  guion.push(() => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'agendar_turno', arguments: JSON.stringify({ fecha: manana, hora: '10:00' }) } }] }));
  guion.push(() => ({ role: 'assistant', content: 'Listo, te reservé el turno.' }));
  ev.emit('messages.upsert', { type: 'notify', messages: [mensaje('Dale, reservame a las 10', 'M3')] });
  const hayTurno = await hasta(async () => (await Turno.find({ userId: USER }).lean()).length > 0, 10000);
  if (!hayTurno) console.log('  (log del bot)\n   ' + logs.slice(-8).join('\n   '));
  assert(hayTurno, 'al confirmar, el turno queda creado en la base local');
  const t = (await Turno.find({ userId: USER }).lean())[0];
  assert(t.fechaInicio instanceof Date && ['pendiente', 'confirmado'].includes(t.estado), 'el turno tiene fecha real y estado válido (pendiente de pago o confirmado)');

  // ── 5) el cliente manda una foto (comprobante): el bot la guarda, avisa y responde ──
  const Documento = require('../main/bot-engine/models/Documento');
  const antesDoc = enviados.length;
  ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { remoteJid: jid, fromMe: false, id: 'M4' }, message: { imageMessage: { mimetype: 'image/png', caption: '' } }, pushName: 'Ana', messageTimestamp: Math.floor(Date.now() / 1000) }] });
  const ackDoc = await hasta(() => enviados.slice(antesDoc).some((e) => /Recibido/.test(e.text || '')));
  assert(ackDoc, 'ante una foto sin texto el bot responde que la recibió (antes se quedaba en silencio)');
  const docs = await Documento.find({ userId: USER }).lean();
  assert(docs.length === 1 && docs[0].jid === jid && fs.existsSync(docs[0].ruta), 'la foto queda guardada en la bandeja de documentos');
  assert(!enviados.slice(antesDoc).some((e) => /Ups|no pude/i.test(e.text || '')), 'sin mensajes de error al cliente');

  await bot.detener();
  console.log('\n✅ Todos los tests de conversación pasaron.\n');
  process.exit(0);
})().catch((e) => {
  console.error('❌', e.message);
  console.error(['--- últimos logs del bot ---', ...logs.slice(-25)].join(String.fromCharCode(10)));
  process.exit(1);
});
