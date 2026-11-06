// tests/productos-celular.test.js — productos cargados con la cámara del celular: van al Catálogo con su foto, sin duplicar.
'use strict';
const { fusionar, importar } = require('../main/productos-celular');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[productos-celular] Tests:');

  // ── fusionar ──
  const base = [{ nombre: 'Gaseosa', precio: 1000, stock: 5, imagen: 'local:vieja.jpg', codigo: '7790000000017', categoria: 'Bebidas', disponible: true, fuente: 'manual' }];
  let r = fusionar([], { nombre: 'Yerba Mate', precio: 2500, categoria: 'Almacén', stock: -1, descripcion: '500 g', codigo: ' 7790070411111 ' }, 'local:nueva.jpg');
  assert(r.accion === 'creado' && r.catalogo.length === 1, 'producto nuevo: se agrega');
  assert(r.catalogo[0].nombre === 'Yerba Mate' && r.catalogo[0].precio === 2500 && r.catalogo[0].imagen === 'local:nueva.jpg' && r.catalogo[0].codigo === '7790070411111', 'con nombre, precio, foto y código limpio');
  assert(r.catalogo[0].disponible === true && r.catalogo[0].moneda === 'ARS' && r.catalogo[0].stock === -1 && r.catalogo[0].waProductId === '', 'queda disponible para el bot, en pesos y sin control de stock');

  r = fusionar(base, { nombre: 'Gaseosa Cola 1,5 L', precio: 1800, codigo: '7790000000017', stock: -1, categoria: '', descripcion: '' });
  assert(r.accion === 'actualizado' && r.catalogo.length === 1, 'mismo código de barras: actualiza, no duplica');
  assert(r.catalogo[0].precio === 1800 && r.catalogo[0].nombre === 'Gaseosa Cola 1,5 L', 'toma el precio y el nombre nuevos');
  assert(r.catalogo[0].imagen === 'local:vieja.jpg' && r.catalogo[0].stock === 5 && r.catalogo[0].categoria === 'Bebidas', 'sin foto nueva conserva la foto, el stock y la categoría que ya tenía');

  r = fusionar(base, { nombre: '  gaseosa ', precio: 900, codigo: '', stock: 20 }, 'local:otra.jpg');
  assert(r.accion === 'actualizado' && r.catalogo.length === 1 && r.catalogo[0].imagen === 'local:otra.jpg' && r.catalogo[0].stock === 20 && r.catalogo[0].codigo === '7790000000017', 'mismo nombre (sin importar mayúsculas): actualiza, cambia la foto y conserva el código');
  assert(base.length === 1 && base[0].precio === 1000, 'no modifica el catálogo original');
  r = fusionar(base, { nombre: 'Otro producto', precio: 10, codigo: '7790000000099' });
  assert(r.accion === 'creado' && r.catalogo.length === 2, 'otro código y otro nombre: producto nuevo');

  // ── importar ──
  const datos = { catalogo: [] }; const guardadas = []; let usadas = null;
  const Config = {
    findOne: () => ({ lean: async () => ({ catalogo: datos.catalogo }) }),
    findOneAndUpdate: async (f, upd) => { Object.assign(datos, upd); return datos; },
  };
  const fotos = { guardar: (dir, buf) => { guardadas.push(buf); return 'local:foto' + guardadas.length + '.jpg'; }, limpiar: (dir, u) => { usadas = u; } };
  const foto = { mime: 'image/jpeg', data: Buffer.from('imagen-de-prueba').toString('base64') };

  const res1 = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: 'Alfajor', precio: 800, codigo: '7791234567890' }, foto });
  assert(res1.accion === 'creado' && /agregado: Alfajor/.test(res1.detalle), 'importa y lo informa');
  assert(guardadas.length === 1 && guardadas[0].toString() === 'imagen-de-prueba', 'la foto se decodifica y se guarda en la PC');
  assert(datos.catalogo.length === 1 && datos.catalogo[0].imagen === 'local:foto1.jpg' && datos.catalogo[0].precio === 800, 'queda en el Catálogo con su foto y su precio');
  assert(Array.isArray(usadas) && usadas.includes('local:foto1.jpg'), 'limpia las fotos que ya no usa ningún producto (sin borrar la nueva)');

  const res2 = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: 'Alfajor triple', precio: 950, codigo: '7791234567890' }, foto: null });
  assert(res2.accion === 'actualizado' && datos.catalogo.length === 1 && datos.catalogo[0].precio === 950 && datos.catalogo[0].imagen === 'local:foto1.jpg', 'reenviarlo no duplica y no pierde la foto');
  assert(guardadas.length === 1, 'sin foto no guarda nada');

  let error = '';
  await importar({ userDataDir: '/tmp/x', uid: '', Config, fotos, producto: { nombre: 'A', precio: 1 } }).catch((e) => { error = e.message; });
  assert(/sesión/.test(error), 'sin sesión iniciada en la PC: falla y lo informa');
  error = '';
  await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: '  ', precio: 1 } }).catch((e) => { error = e.message; });
  assert(/nombre/.test(error), 'sin nombre: falla y lo informa');
  error = '';
  await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos: { ...fotos, guardar: () => { throw new Error('El archivo no es una imagen válida (JPG, PNG o WebP).'); } }, producto: { nombre: 'B', precio: 1 }, foto }).catch((e) => { error = e.message; });
  assert(/imagen válida/.test(error) && datos.catalogo.length === 1, 'si la foto no sirve, falla sin tocar el catálogo');

  // ── lectura de la foto con IA (Etapa 2) ──
  datos.catalogo = []; let llamadas = 0; let ultima = null;
  const reconoce = async (x) => { llamadas++; ultima = x; return { ok: true, datos: { nombre: 'Desodorante Axe Dark Temptation 150 ml', categoria: 'Perfumería', descripcion: 'Desodorante en aerosol para hombre, 150 ml.' } }; };
  const hoy = () => new Date(2026, 10, 3, 9, 5);

  let rI = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: '', precio: 6500, stock: 100, codigo: '7791600037239' }, foto, reconocer: reconoce });
  assert(llamadas === 1 && ultima.foto === foto, 'foto sin nombre: la IA lee la foto');
  assert(datos.catalogo[0].nombre === 'Desodorante Axe Dark Temptation 150 ml' && datos.catalogo[0].categoria === 'Perfumería' && /aerosol/.test(datos.catalogo[0].descripcion), 'completa nombre, categoría y descripción');
  assert(datos.catalogo[0].precio === 6500 && datos.catalogo[0].stock === 100 && datos.catalogo[0].codigo === '7791600037239', 'el precio, el stock y el código son los del dueño (la IA no los toca)');
  assert(/IA completó nombre, categoría, descripción/.test(rI.detalle) && rI.detalle.length <= 120, 'se lo informa al celular para que lo revise');

  datos.catalogo = []; llamadas = 0;
  rI = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: 'Mi desodorante', precio: 100, categoria: 'Higiene', descripcion: 'El de siempre' }, foto, reconocer: reconoce });
  assert(llamadas === 0 && datos.catalogo[0].nombre === 'Mi desodorante', 'si el dueño completó todo, no se llama a la IA');
  rI = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: 'Mi talco', precio: 100, categoria: '', descripcion: '' }, foto, reconocer: reconoce });
  assert(llamadas === 0 && datos.catalogo.find((x) => x.nombre === 'Mi talco').categoria === '', 'con nombre (ya revisado en la app) no se vuelve a leer ni se completa nada a espaldas del dueño');
  rI = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: '', precio: 100, categoria: 'Mi rubro', descripcion: '' }, foto, reconocer: reconoce });
  assert(llamadas === 1 && datos.catalogo.some((x) => x.nombre === 'Desodorante Axe Dark Temptation 150 ml' && x.categoria === 'Mi rubro' && /aerosol/.test(x.descripcion)), 'sin nombre: la IA completa lo vacío pero no pisa la categoría que puso el dueño');
  llamadas = 0;
  await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: 'Sin foto', precio: 5 }, foto: null, reconocer: reconoce });
  assert(llamadas === 0, 'sin foto no hay nada que leer');

  datos.catalogo = [];
  rI = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: '', precio: 7 }, foto, reconocer: async () => ({ ok: false, motivo: 'falta la clave de Groq en Config' }), ahora: hoy });
  assert(datos.catalogo.length === 1 && datos.catalogo[0].nombre === 'Producto sin nombre 03/11 09:05' && datos.catalogo[0].precio === 7, 'si la IA no puede, se guarda igual con un nombre provisorio y el precio');
  assert(/sin nombre/.test(rI.detalle) && /clave de Groq/.test(rI.detalle), 'avisa por qué no se leyó la foto');
  rI = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: '', precio: 8 }, foto, reconocer: async () => { throw new Error('boom'); }, ahora: () => new Date(2026, 10, 3, 9, 6) });
  assert(datos.catalogo.length === 2, 'si la IA se rompe, no se rompe la importación');

  datos.catalogo = [{ nombre: 'Desodorante Rexona', precio: 5000, codigo: '7791600037239', categoria: 'Perfumería', imagen: '', stock: -1 }];
  rI = await importar({ userDataDir: '/tmp/x', uid: 'u1', Config, fotos, producto: { nombre: '', precio: 5500, codigo: '7791600037239' }, foto, reconocer: async () => ({ ok: false, motivo: 'x' }) });
  assert(rI.accion === 'actualizado' && datos.catalogo.length === 1 && datos.catalogo[0].nombre === 'Desodorante Rexona' && datos.catalogo[0].precio === 5500, 'mismo código sin nombre legible: actualiza precio y foto pero conserva el nombre que ya tenía');

  console.log('\n✅ Todos los tests de productos-celular pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
