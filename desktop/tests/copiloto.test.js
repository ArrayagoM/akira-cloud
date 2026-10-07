// tests/copiloto.test.js — copiloto: borrador de respuesta para el dueño (nunca se envía solo) y envío desde la app.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-copi-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const cp = require('../main/bot-engine/services/bot/copiloto.service');

(async () => {
  console.log('\n[copiloto] Tests:');
  const H = { lunes: { activo: true, inicio: '09:00', fin: '18:00' }, sabado: { activo: true, franjas: [{ inicio: '09:00', fin: '13:00' }, { inicio: '16:00', fin: '20:00' }] }, domingo: { activo: false } };
  assert(cp.textoHorarios(H) === 'Lun 09:00–18:00 | Sáb 09:00–13:00 y 16:00–20:00 | Dom cerrado' && cp.textoHorarios({}) === '' && cp.textoHorarios(null) === '', 'resume los horarios (con franjas partidas)');

  const hist = [
    { role: 'user', content: 'Hola! ¿cuánto sale un corte y hasta qué hora atienden el sábado?' },
    { role: 'assistant', content: 'Hola! Dejame consultarlo con Martín y te aviso 🙏' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'x' }] }, { role: 'tool', content: '{"ok":1}' },
    { role: 'user', content: 'dale, espero' },
  ];
  let r = cp.armarMensajes({ negocio: 'Barbería Tincho', miNombre: 'Martín', servicios: [{ nombre: 'Corte de pelo', precio: 9000, duracion: 30 }], horarios: cp.textoHorarios(H), catalogo: [{ nombre: 'Cera', precio: 6200, stock: 3, disponible: true }, { nombre: 'Oculto', precio: 1, disponible: false }], fragmentos: [{ texto: 'Aceptamos efectivo, transferencia y MercadoPago.' }], cliente: { nombre: 'Ana', etiquetas: ['VIP'], notas: 'Prefiere la tarde' }, historial: hist });
  const sis = r.mensajes[0].content;
  assert(r.ok && r.mensajes[0].role === 'system' && /Martín/.test(sis) && /Barbería Tincho/.test(sis) && /UN borrador/.test(sis), 'el pedido a la IA es para redactar UN borrador en nombre del dueño');
  assert(/Corte de pelo: \$9000/.test(sis) && /Lun 09:00–18:00/.test(sis) && /Cera: \$6200 \(stock 3\)/.test(sis) && !/Oculto/.test(sis) && /MercadoPago/.test(sis), 'incluye servicios, horarios, productos disponibles y el conocimiento del negocio');
  assert(/Se llama Ana/.test(sis) && /VIP/.test(sis) && /Prefiere la tarde/.test(sis), 'incluye lo que se sabe del cliente');
  assert(/no inventar|sin inventar/.test(sis) && /\[confirmar horario\]/.test(sis), 'le exige no inventar y marcar entre corchetes lo que falte');
  assert(r.mensajes.length === 4 && r.mensajes[1].role === 'user' && !r.mensajes.some((m) => m.role === 'tool' || m.tool_calls), 'la charla va sin las herramientas internas');
  const larga = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `mensaje ${i}` }));
  assert(cp.armarMensajes({ historial: larga }).mensajes.length === 1 + cp.MAX_HISTORIAL, 'toma solo los últimos mensajes');
  const u = cp.armarMensajes({ negocio: 'X', historial: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'hola, ¿en qué te ayudo?' }] });
  assert(u.mensajes[u.mensajes.length - 1].role === 'user', 'si lo último lo dijo el dueño/bot, igual se pide el mensaje (no queda terminando en "assistant")');
  assert(cp.armarMensajes({ historial: [] }).ok === false && cp.armarMensajes({ historial: [{ role: 'assistant', content: 'hola' }] }).ok === false, 'sin mensajes del cliente no hay nada que responder');
  assert(/Indicación especial del dueño: .*más corto/.test(cp.armarMensajes({ historial: hist, instruccion: 'hacelo más corto' }).mensajes[0].content.replace('para este mensaje: ', ': ')) || /hacelo más corto/.test(cp.armarMensajes({ historial: hist, instruccion: 'hacelo más corto' }).mensajes[0].content), 'el dueño puede agregar una indicación ("hacelo más corto")');

  assert(cp.limpiarSugerencia('"Hola Ana, el corte sale $9.000."') === 'Hola Ana, el corte sale $9.000.', 'saca las comillas');
  assert(cp.limpiarSugerencia('Borrador: Hola Ana') === 'Hola Ana' && cp.limpiarSugerencia('<think>pienso...</think>Listo, te espero') === 'Listo, te espero' && cp.limpiarSugerencia('```\nHola\n```') === 'Hola', 'saca prefijos, razonamientos y bloques de código');
  assert(cp.limpiarSugerencia('x'.repeat(2000)).length === 900 && cp.limpiarSugerencia(null) === '', 'acota el largo y tolera vacío');

  // ── rutas ──
  const BotCliente = require('../main/bot-engine/models/BotCliente');
  await BotCliente.create({ userId: 'u1', jid: '5492241497226@s.whatsapp.net', nombre: 'Ana', historial: [], turnosConfirmados: [] });
  const enviados = []; let conectado = true;
  const botService = {
    silenciarCliente() {}, recargarConfig() {}, getBotStatus: () => ({}), slotsActivos: () => [0],
    sugerirRespuesta: async (jid, op) => { if (!conectado) throw Object.assign(new Error('El bot no está activo: iniciá el bot para usar el copiloto.'), { status: 409 }); return `Borrador para ${jid} ${op.instruccion}`; },
    responderComoDueno: async (jid, t) => { if (!conectado) return false; enviados.push({ jid, t }); return true; },
  };
  const app = express(); app.use(express.json());
  app.use('/api/bot', require('../main/local-api/routes/bot.routes')({ botService, requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/bot/clientes`;
  const J = '5492241497226%40s.whatsapp.net';
  const post = async (p, body) => { const x = await fetch(`${base}/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return { status: x.status, body: await x.json() }; };
  let x = await post(`${J}/sugerir`, { instruccion: 'más corto' });
  assert(x.status === 200 && /Borrador para 5492241497226@s.whatsapp.net más corto/.test(x.body.texto) && enviados.length === 0, 'sugerir devuelve el borrador y NO envía nada');
  assert((await post('inexistente%40s.whatsapp.net/sugerir')).status === 404, 'cliente inexistente → 404');
  x = await post(`${J}/responder`, { texto: 'Hola Ana, el corte sale $9.000 💈' });
  assert(x.status === 200 && enviados.length === 1 && enviados[0].t.includes('$9.000'), 'responder: el mensaje sale por WhatsApp');
  assert((await post(`${J}/responder`, { texto: '   ' })).status === 400 && (await post(`${J}/responder`, { texto: 'x'.repeat(1001) })).status === 400, 'mensajes vacíos o larguísimos se rechazan');
  assert((await post('inexistente%40s.whatsapp.net/responder', { texto: 'hola' })).status === 404, 'no se le puede escribir a alguien que no es cliente (404)');
  conectado = false;
  x = await post(`${J}/responder`, { texto: 'hola' });
  assert(x.status === 409 && /no está conectado/.test(x.body.error) && (await post(`${J}/sugerir`)).status === 409, 'con el bot desconectado: mensaje claro (409), sin romper');
  srv.close();

  console.log('\n✅ Todos los tests de copiloto pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
