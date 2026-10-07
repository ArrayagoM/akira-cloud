// tests/codigos-api.test.js — rutas de códigos de barras y el campo "código" en el catálogo (guardado e importación).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-cod-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[códigos api] Tests:');
  const Config = require('../main/bot-engine/models/Config');
  await Config.create({ userId: 'u1', negocio: 'Barbería', catalogo: [], serviciosList: [] });
  const sesion = (q, _r, n) => { q.user = { _id: 'u1' }; n(); };
  const app = express(); app.use(express.json({ limit: '5mb' }));
  const deps = { requerirSesion: sesion, botService: { recargarConfig() {} }, userDataDir: dir };
  app.use('/api/app/codigos', require('../main/local-api/routes/codigos.routes')(deps));
  app.use('/api/gestion', require('../main/local-api/routes/gestion.routes')(deps));
  app.use('/api/app/ventas', require('../main/local-api/routes/ventas.routes')(deps));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (m, p, body) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, ct: x.headers.get('content-type') || '', body: /json/.test(x.headers.get('content-type') || '') ? await x.json() : Buffer.from(await x.arrayBuffer()) }; };

  let x = await j('POST', '/app/codigos/generar', { existentes: ['AK000002', '7790001'], cantidad: 3 });
  assert(x.status === 200 && x.body.codigos.join() === 'AK000003,AK000004,AK000005', 'genera códigos nuevos que no chocan con los existentes');
  assert((await j('POST', '/app/codigos/generar', { cantidad: 99999 })).body.codigos.length === 500 && (await j('POST', '/app/codigos/generar', {})).body.codigos.length === 0, 'con tope y sin romper');

  x = await j('POST', '/app/codigos/etiquetas', { productos: [{ nombre: 'Cera', precio: 6200, codigo: 'AK000001' }, { nombre: 'Peine', precio: 1000, codigo: '' }] });
  assert(x.status === 200 && /pdf/.test(x.ct) && x.body.slice(0, 4).toString() === '%PDF', 'etiquetas en PDF (solo los que tienen código)');
  assert((await j('POST', '/app/codigos/etiquetas', { productos: [{ nombre: 'Peine', codigo: 'ñ' }] })).status === 400, 'sin ningún código válido → 400 con mensaje');

  // el catálogo guarda y devuelve el código; el lector lo usa en la venta rápida
  x = await j('PUT', '/gestion/lista', { tipo: 'productos', lista: [{ nombre: 'Cera', precio: 6200, stock: 5, codigo: ' 7790001234567 ' }, { nombre: 'Peine', precio: 1000, stock: -1, codigo: 'ñandú' }, { nombre: 'Aceite', precio: 5400 }] });
  assert(x.status === 200, 'el catálogo se guarda');
  const cfg = await Config.findOne({ userId: 'u1' }).lean();
  assert(cfg.catalogo[0].codigo === '7790001234567' && cfg.catalogo[1].codigo === '' && cfg.catalogo[2].codigo === '', 'el código se limpia al guardar (y uno inválido se descarta)');
  x = await j('GET', '/app/ventas');
  assert(x.body.productos.find((p) => p.nombre === 'Cera').codigo === '7790001234567', 'la venta rápida recibe el código para el lector');

  // importación de planilla: la columna "Código de barras" se reconoce y se guarda
  const mapeo = require('../main/gestion/mapeo');
  const mp = mapeo.sugerirMapeo('productos', ['Producto', 'Precio', 'Código de barras', 'Stock'], [['Shampoo', '8500', '7791234000012', 4], ['Cera', '6200', '7791234000029', 2]]);
  assert(mp.codigo === 2, 'reconoce la columna "Código de barras"');
  const filas = mapeo.construirFilas('productos', [['Shampoo', '8500', '7791234000012', '4'], ['Gel', '3000', '', '']], mp, []);
  assert(filas[0].dato.codigo === '7791234000012' && filas[1].dato.codigo === '', 'la fila trae el código (vacío si no tiene)');
  const ap = mapeo.aplicarImportacion('productos', filas, [{ nombre: 'Shampoo', precio: 1, codigo: 'VIEJO' }]);
  const lista = ap.lista || ap.base || ap;
  assert(JSON.stringify(lista).includes('7791234000012'), 'al importar, el código llega al catálogo');
  srv.close();

  console.log('\n✅ Todos los tests de códigos api pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
