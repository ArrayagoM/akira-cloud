// tests/ia-foto-producto.test.js — lectura de la foto del producto desde la app del celular: sin precios, sin inventar, sin romper nada.
'use strict';
const assert = require('assert');
const { analizarFoto, extraerJson, sanear, MODELOS } = require('../lib/ia-foto-producto');

(async () => {
  const resp = (status, cuerpo) => ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo });
  const buena = (obj) => resp(200, { choices: [{ message: { content: JSON.stringify(obj) } }] });
  const rexona = buena({ legible: true, nombre: 'Desodorante Rexona 150 ml', categoria: 'Perfumería', descripcion: 'Desodorante en aerosol, 150 ml.' });
  const base = { base64: Buffer.from('xx').toString('base64'), mime: 'image/jpeg', apiKey: 'gsk_prueba123456' };

  assert.strictEqual(extraerJson('```json\n{"nombre":"A"}\n```').nombre, 'A', 'JSON entre ```');
  assert.strictEqual(extraerJson('sin json'), null, 'sin JSON');
  assert.strictEqual(sanear({ legible: true, nombre: 'Yerba', descripcion: 'Ahora $ 2500' }).descripcion, '', 'un texto con precio se descarta');
  assert.strictEqual(sanear({ legible: true, nombre: 'A', precio: 9, stock: 3 }).precio, undefined, 'nunca devuelve precio');
  assert.strictEqual(sanear({ legible: false, nombre: 'x' }).nombre, '', 'ilegible: todo vacío');

  // camino feliz: manda la foto como imagen y las reglas de no inventar
  let pedido = null;
  let r = await analizarFoto({ ...base, fetchFn: async (url, op) => { pedido = { url, op, cuerpo: JSON.parse(op.body) }; return rexona; } });
  assert.ok(r.ok && r.datos.nombre === 'Desodorante Rexona 150 ml' && r.datos.categoria === 'Perfumería', 'lee nombre, categoría y descripción');
  assert.ok(!('precio' in r.datos) && !('stock' in r.datos), 'sin precio ni stock');
  assert.strictEqual(pedido.cuerpo.model, MODELOS[0], 'usa el modelo con visión');
  assert.ok(pedido.cuerpo.messages[1].content.some((x) => x.type === 'image_url' && x.image_url.url.startsWith('data:image/jpeg;base64,')), 'manda la foto');
  assert.ok(/NO inventes/.test(pedido.cuerpo.messages[0].content) && /NO pongas precios/.test(pedido.cuerpo.messages[0].content), 'instrucciones de no inventar ni poner precios');
  assert.strictEqual(pedido.op.headers.Authorization, 'Bearer gsk_prueba123456', 'usa la clave de la plataforma');

  // sin clave / sin foto
  r = await analizarFoto({ ...base, apiKey: '', fetchFn: async () => { throw new Error('no debería llamar'); } });
  assert.ok(!r.ok && r.codigo === 'SIN_CLAVE', 'sin clave de la plataforma: avisa sin llamar a nadie');
  r = await analizarFoto({ ...base, base64: '', fetchFn: async () => rexona });
  assert.ok(!r.ok, 'sin foto: no hace nada');

  // ilegible
  r = await analizarFoto({ ...base, fetchFn: async () => buena({ legible: false }) });
  assert.ok(!r.ok && r.codigo === 'ILEGIBLE' && /otra foto/.test(r.motivo), 'foto ilegible: no inventa y sugiere otra foto');
  r = await analizarFoto({ ...base, fetchFn: async () => resp(200, { choices: [{ message: { content: 'perdón, no puedo' } }] }) });
  assert.ok(!r.ok, 'respuesta sin JSON: no inventa');

  // límite de un modelo → prueba el otro; modelo retirado → prueba el otro
  const usados = [];
  r = await analizarFoto({ ...base, fetchFn: async (_u, op) => { const m = JSON.parse(op.body).model; usados.push(m); return usados.length === 1 ? resp(429, {}) : rexona; } });
  assert.ok(r.ok && usados[1] === MODELOS[1], 'si un modelo llegó a su límite, prueba el otro');
  r = await analizarFoto({ ...base, fetchFn: async () => resp(429, {}) });
  assert.ok(!r.ok && r.codigo === 'LIMITE', 'si todos llegaron al límite: lo informa');
  r = await analizarFoto({ ...base, fetchFn: async (_u, op) => (JSON.parse(op.body).model === MODELOS[0] ? resp(404, {}) : rexona) });
  assert.ok(r.ok, 'modelo retirado: usa el siguiente');

  // clave inválida, caída de red y plazo
  r = await analizarFoto({ ...base, fetchFn: async () => resp(401, {}) });
  assert.ok(!r.ok && r.codigo === 'CLAVE' && !/gsk_/.test(r.motivo), 'clave inválida: mensaje neutro para el cliente');
  r = await analizarFoto({ ...base, fetchFn: async () => { throw new Error('ECONNRESET gsk_prueba123456'); } });
  assert.ok(!r.ok && r.codigo === 'FALLO' && !JSON.stringify(r).includes('gsk_'), 'error de red: no lanza y no filtra la clave');
  r = await analizarFoto({ ...base, plazoMs: 30, fetchFn: (_u, op) => new Promise((_ok, no) => { op.signal.addEventListener('abort', () => no(new Error('abortado'))); }) });
  assert.ok(!r.ok && r.codigo === 'FALLO', 'si la IA no responde a tiempo, se corta (la función del servidor tiene poco tiempo)');

  console.log('ia-foto-producto: OK');
})().catch((e) => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
