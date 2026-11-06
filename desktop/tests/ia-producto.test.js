// tests/ia-producto.test.js — lectura de la foto de un producto con IA: sin precios, sin inventar, sin romper nada si falla.
'use strict';
const { crearReconocedor, extraerJson, sanear, MAX_POR_HORA, MODELOS } = require('../main/ia-producto');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[ia-producto] Tests:');
  const foto = { mime: 'image/jpeg', data: Buffer.from('xx').toString('base64') };

  // ── lectura de la respuesta ──
  assert(extraerJson('```json\n{"nombre":"A"}\n```').nombre === 'A', 'saca el JSON aunque venga entre ```');
  assert(extraerJson('Acá va: {"nombre":"B"} listo').nombre === 'B', 'saca el JSON aunque tenga texto alrededor');
  assert(extraerJson('no hay json') === null && extraerJson('{roto') === null && extraerJson('[1,2]') === null, 'respuestas sin JSON válido: null');

  // ── saneado ──
  let s = sanear({ legible: true, nombre: '  Yerba   "Playadito" 1 kg ', categoria: 'Almacén', descripcion: 'Yerba mate con palo, 1 kg.' });
  assert(s.legible && s.nombre === 'Yerba Playadito 1 kg' && s.categoria === 'Almacén', 'limpia espacios y comillas');
  s = sanear({ legible: true, nombre: 'Yerba 1 kg', categoria: 'Almacén', descripcion: 'Ahora $ 2500 en oferta' });
  assert(s.descripcion === '' && s.nombre === 'Yerba 1 kg', 'si el texto trae un precio, se descarta ese campo');
  assert(sanear({ legible: false, nombre: 'algo' }).nombre === '' && sanear({ legible: true, nombre: '' }).legible === false, 'si no se lee: todo vacío');
  assert(sanear({ legible: true, nombre: 'x'.repeat(500) }).nombre.length === 120 && sanear(null).legible === false, 'topes de largo y entrada rara');
  assert(!('precio' in sanear({ legible: true, nombre: 'A', precio: 99, stock: 5 })), 'nunca devuelve precio ni stock');

  // ── reconocedor ──
  const respuesta = (obj) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
  let pedidos = [];
  const cliente = (resp) => () => ({ chat: { completions: { create: async (op) => { pedidos.push(op); const r = typeof resp === 'function' ? await resp(op) : resp; return r; } } } });
  const buena = respuesta({ legible: true, nombre: 'Desodorante Rexona 150 ml', categoria: 'Perfumería', descripcion: 'Desodorante en aerosol, 150 ml.' });

  let rec = crearReconocedor({ obtenerClave: async () => 'gsk_prueba123456', crearCliente: cliente(buena) });
  let r = await rec({ foto });
  assert(r.ok && r.datos.nombre === 'Desodorante Rexona 150 ml' && !('precio' in r.datos), 'lee la foto y devuelve nombre, categoría y descripción');
  const msg = pedidos[0].messages[1].content;
  assert(pedidos[0].model === MODELOS[0] && msg.some((x) => x.type === 'image_url' && x.image_url.url.startsWith('data:image/jpeg;base64,')), 'manda la foto al modelo con visión');
  assert(/NO pongas precios/.test(pedidos[0].messages[0].content) && /NO inventes/.test(pedidos[0].messages[0].content), 'las instrucciones prohíben inventar y poner precios');

  r = await crearReconocedor({ obtenerClave: async () => '', crearCliente: cliente(buena) })({ foto });
  assert(!r.ok && /clave de Groq/.test(r.motivo), 'sin clave de Groq: no falla, avisa');
  r = await rec({ foto: null });
  assert(!r.ok, 'sin foto: no hace nada');
  r = await crearReconocedor({ obtenerClave: async () => 'k', crearCliente: cliente(respuesta({ legible: false })) })({ foto });
  assert(!r.ok && /no pudo leer/.test(r.motivo), 'foto ilegible: no inventa nada');
  r = await crearReconocedor({ obtenerClave: async () => 'k', crearCliente: cliente({ choices: [{ message: { content: 'perdón, no puedo' } }] }) })({ foto });
  assert(!r.ok, 'respuesta sin JSON: no inventa nada');

  // límite del primer modelo → prueba el siguiente
  pedidos = []; let n = 0;
  rec = crearReconocedor({ obtenerClave: async () => 'k', crearCliente: cliente(() => { n++; if (n === 1) { const e = new Error('rate limit'); e.status = 429; throw e; } return buena; }) });
  r = await rec({ foto });
  assert(r.ok && pedidos.length === 2 && pedidos[1].model === MODELOS[1], 'si un modelo llegó a su límite, prueba otro');

  // modelo retirado → consulta la lista y usa uno con visión
  pedidos = [];
  rec = crearReconocedor({ obtenerClave: async () => 'k', listarModelos: async () => ['llama-3.3-70b-versatile', 'meta-llama/llama-4-nuevo'],
    crearCliente: cliente((op) => { if (op.model !== 'meta-llama/llama-4-nuevo') { const e = new Error('model_not_found'); e.status = 404; throw e; } return buena; }) });
  r = await rec({ foto });
  assert(r.ok && pedidos[pedidos.length - 1].model === 'meta-llama/llama-4-nuevo', 'si los modelos ya no existen, elige otro con visión de la lista de la cuenta');

  // clave inválida / error de red: nunca lanza, y la clave no aparece en el motivo
  const logs = [];
  r = await crearReconocedor({ obtenerClave: async () => 'gsk_secreta123456', log: (...a) => logs.push(a.join(' ')), crearCliente: cliente(() => { const e = new Error('Invalid API Key gsk_secreta123456'); e.status = 401; throw e; }) })({ foto });
  assert(!r.ok && /no es válida/.test(r.motivo) && !logs.join(' ').includes('gsk_secreta123456'), 'clave inválida: avisa y la clave no queda en los registros');
  r = await crearReconocedor({ obtenerClave: async () => 'k', crearCliente: cliente(() => { throw new Error('ECONNRESET'); }) })({ foto });
  assert(!r.ok && /no respondió/.test(r.motivo), 'error de red: no lanza');

  // tope por hora
  let t = 1_000_000; let usos = 0;
  rec = crearReconocedor({ obtenerClave: async () => 'k', ahora: () => t, crearCliente: cliente(() => { usos++; return buena; }) });
  for (let i = 0; i < MAX_POR_HORA; i++) await rec({ foto });
  r = await rec({ foto });
  assert(usos === MAX_POR_HORA && !r.ok && /límite/.test(r.motivo), `tope de ${MAX_POR_HORA} lecturas por hora para cuidar el cupo del cliente`);
  t += 61 * 60 * 1000; r = await rec({ foto });
  assert(r.ok, 'pasada la hora, vuelve a funcionar');

  console.log('\n✅ Todos los tests de ia-producto pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
