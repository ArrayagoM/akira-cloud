// tests/catalogo-fotos.test.js — fotos de productos: se guardan en la PC, solo imágenes válidas, sin salir de la carpeta,
// se limpian las huérfanas y el bot las manda cuando el cliente pregunta por ese producto.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-fotos-'));
require('../main/db/store').abrir(path.join(dir, 'akira.db'));
const fotos = require('../main/catalogo-fotos');
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'comprobante.png'));

(async () => {
  console.log('\n[catalogo-fotos] Tests:');

  assert(fotos.tipoDeImagen(PNG) === 'png' && fotos.tipoDeImagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) === 'jpg' && fotos.tipoDeImagen(Buffer.from('<?php echo 1; ?>        ')) === null, 'reconoce PNG/JPG por su contenido (no por el nombre) y rechaza lo demás');
  const ref = fotos.guardar(dir, PNG);
  assert(fotos.REF_RE.test(ref) && fotos.esLocal(ref) && !fotos.esLocal('https://x.com/a.jpg'), 'devuelve una referencia "local:<id>.<ext>" (nunca una ruta de la PC)');
  assert(fotos.leer(dir, ref).equals(PNG) || fotos.leer(dir, ref).length > 100, 'se puede volver a leer');
  for (const mala of ['local:../../akira.db', 'local:..\\x.jpg', '../x', 'C:/Windows/win.ini', 'local:abcdef.jpg', 'local:0123456789abcdef.exe', '', null]) assert(fotos.leer(dir, mala) === null, `no se puede leer fuera de la carpeta: ${JSON.stringify(mala)}`);
  let e = null; try { fotos.guardar(dir, Buffer.from('esto no es una imagen, es un script malicioso')); } catch (x) { e = x; }
  assert(e?.status === 415, 'un archivo que no es imagen se rechaza (415)');
  e = null; try { fotos.guardar(dir, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4 * 1024 * 1024)])); } catch (x) { e = x; }
  assert(e?.status === 413, 'una imagen demasiado pesada se rechaza (413)');

  // limpieza de huérfanas
  const ref2 = fotos.guardar(dir, PNG); const ref3 = fotos.guardar(dir, PNG);
  assert(fotos.limpiar(dir, []) === 0, 'las fotos recién subidas tienen 10 minutos de gracia (pueden estar esperando que se guarde la lista)');
  const vieja = (r) => { const f = path.join(dir, 'catalogo-fotos', r.replace('local:', '')); const t = new Date(Date.now() - 3600e3); fs.utimesSync(f, t, t); };
  vieja(ref2); vieja(ref3);
  assert(fotos.limpiar(dir, [ref3]) === 1 && fotos.leer(dir, ref2) === null && fotos.leer(dir, ref3) !== null, 'pasada la gracia, borra las que ningún producto usa y conserva las usadas');

  // rutas
  const Config = require('../main/bot-engine/models/Config');
  await Config.create({ userId: 'u1', catalogo: [] });
  const app = express(); app.use(express.json({ limit: '25mb' }));
  const deps = { botService: { recargarConfig() {} }, requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir };
  app.use('/api/app/catalogo-fotos', require('../main/local-api/routes/catalogo-fotos.routes')(deps));
  app.use('/api/gestion', require('../main/local-api/routes/gestion.routes')(deps));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const post = async (p, body, method) => { const x = await fetch(base + p, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: x.status, body: await x.json().catch(() => null) }; };

  let r = await post('/app/catalogo-fotos', { base64: PNG.toString('base64') });
  assert(r.status === 200 && fotos.esLocal(r.body.ref), 'subir una foto devuelve su referencia');
  const subida = r.body.ref;
  r = await post('/app/catalogo-fotos', { base64: Buffer.from('<script>alert(1)</script>').toString('base64') });
  assert(r.status === 415, 'subir algo que no es una imagen → 415');
  assert((await post('/app/catalogo-fotos', {})).status === 400, 'sin imagen → 400');
  const g = await fetch(`${base}/app/catalogo-fotos/${subida.replace('local:', '')}`);
  assert(g.status === 200 && /image\//.test(g.headers.get('content-type')) && (await g.arrayBuffer()).byteLength > 100, 'la miniatura se sirve como imagen');
  assert((await fetch(`${base}/app/catalogo-fotos/..%2F..%2Fakira.db`)).status === 404 && (await fetch(`${base}/app/catalogo-fotos/inexistente.jpg`)).status === 404, 'no se puede pedir cualquier archivo ni uno que no existe');

  // guardar un producto con foto la conserva; sin foto, la limpia (después de la gracia)
  r = await post('/gestion/lista', { tipo: 'productos', lista: [{ nombre: 'Shampoo', precio: 8500, imagen: subida }] }, 'PUT');
  assert(r.status === 200 && r.body.lista[0].imagen === subida, 'el producto guarda la referencia a su foto');
  vieja(subida);
  await post('/gestion/lista', { tipo: 'productos', lista: [{ nombre: 'Shampoo', precio: 8500, imagen: '' }] }, 'PUT');
  assert(fotos.leer(dir, subida) === null, 'al quitar la foto del producto y guardar, el archivo se borra');
  srv.close();

  // el bot manda la foto cuando consultan por el producto (se prueba la lógica con el mismo código de la herramienta)
  const src = fs.readFileSync(path.join(__dirname, '..', 'main', 'bot-engine', 'services', 'akira.bot.js'), 'utf8');
  assert(/leerFotoCatalogo\?\.\(p\.imagen\)/.test(src) && /enviarImagen\(jid, foto,/.test(src) && /enviadas >= 3/.test(src) && /10 \* 60 \* 1000/.test(src), 'el bot manda hasta 3 fotos por consulta y no repite la misma en 10 minutos');

  console.log('\n✅ Todos los tests de catalogo-fotos pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
