'use strict';
const assert = require('assert');
const P = require('../lib/productos-celular');
const { buscarCodigo, esCodigo } = require('../lib/codigo-lookup');

(async () => {
  // ── precios ──
  assert.strictEqual(P.leerPrecio('1.500,50'), 1500.5);
  assert.strictEqual(P.leerPrecio('1500,5'), 1500.5);
  assert.strictEqual(P.leerPrecio('1.500'), 1500);
  assert.strictEqual(P.leerPrecio('$ 2500'), 2500);
  assert.strictEqual(P.leerPrecio(1200), 1200);
  assert(Number.isNaN(P.leerPrecio('')) && Number.isNaN(P.leerPrecio('abc')), 'sin número: NaN');

  // ── producto ──
  assert.strictEqual(P.limpiarProducto({ precio: 10 }).ok, false, 'sin nombre no pasa');
  assert.strictEqual(P.limpiarProducto({ precio: 10 }, { sinNombreOk: true }).ok, true, 'con foto el nombre puede venir vacío (lo lee la PC)');
  assert.strictEqual(P.limpiarProducto({ nombre: '  ', precio: 10 }, { sinNombreOk: true }).producto.nombre, '', 'nombre vacío queda vacío (no se inventa)');
  assert.strictEqual(P.limpiarProducto({}, { sinNombreOk: true }).ok, false, 'aun con foto, el precio sigue siendo obligatorio');
  assert.strictEqual(P.limpiarProducto({ nombre: 'Yerba' }).ok, false, 'sin precio no pasa');
  assert.strictEqual(P.limpiarProducto({ nombre: 'Yerba', precio: -5 }).ok, false, 'precio negativo no pasa');
  const ok = P.limpiarProducto({ nombre: '  Yerba   Mate  ', precio: '1.500,50', categoria: ' Almacén ', stock: '12', descripcion: ' 500 g ', codigo: ' 7790070411111 ' });
  assert.deepStrictEqual(ok.producto, { nombre: 'Yerba Mate', precio: 1500.5, categoria: 'Almacén', stock: 12, descripcion: '500 g', codigo: '7790070411111' });
  assert.strictEqual(P.limpiarProducto({ nombre: 'A', precio: 0 }).producto.stock, -1, 'sin stock = sin control (-1)');
  assert.strictEqual(P.limpiarProducto({ nombre: 'A', precio: 1, codigo: 'ñandú' }).producto.codigo, '', 'código con caracteres no imprimibles se descarta');
  assert.strictEqual(P.limpiarProducto({ nombre: 'x'.repeat(300), precio: 1 }).producto.nombre.length, 120, 'nombre con tope');

  // ── foto ──
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]).toString('base64');
  assert.strictEqual(P.validarFoto('').vacia, true);
  assert.strictEqual(P.validarFoto(null).vacia, true);
  const f = P.validarFoto('data:image/jpeg;base64,' + jpg);
  assert(f.ok && f.mime === 'image/jpeg' && f.base64 === jpg, 'acepta JPG y saca el encabezado data:');
  assert.strictEqual(P.validarFoto(Buffer.from('hola, esto no es una imagen').toString('base64')).ok, false, 'un texto no es imagen');
  assert.strictEqual(P.validarFoto('!!!no-es-base64!!!').ok, false);
  const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(P.MAX_FOTO_BYTES + 10)]).toString('base64');
  assert.strictEqual(P.validarFoto(grande).ok, false, 'foto muy pesada se rechaza');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]).toString('base64');
  assert.strictEqual(P.validarFoto(png).mime, 'image/png');

  // ── bandeja (modelo en memoria) ──
  let n = 0;
  const filas = [];
  const coincide = (r, q) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$gt' in v) return new Date(r[k]).getTime() > new Date(v.$gt).getTime();
    return String(r[k]) === String(v);
  });
  const Modelo = {
    async countDocuments(q) { return filas.filter((r) => coincide(r, q)).length; },
    async create(d) { const r = { ...d, _id: (++n).toString(16).padStart(24, '0') }; filas.push(r); return r; },
    find(q) {
      let r = filas.filter((x) => coincide(x, q)); const c = {
        sort(o) { const [k, dir] = Object.entries(o)[0]; r = [...r].sort((a, b) => (a[k] - b[k]) * dir); return c; },
        limit(x) { r = r.slice(0, x); return c; }, select() { return c; }, async lean() { return r.map((x) => ({ ...x })); },
      }; return c;
    },
    async updateOne(q, u) { const r = filas.find((x) => coincide(x, q)); if (!r) return { modifiedCount: 0 }; Object.assign(r, u.$set); return { modifiedCount: 1 }; },
  };
  const U = 'aaaaaaaaaaaaaaaaaaaaaaaa'; const OTRO = 'bbbbbbbbbbbbbbbbbbbbbbbb'; const PC = 'pc-1';
  const ahora = new Date('2026-11-02T12:00:00Z');
  const prod = (nombre) => ({ nombre, precio: 100, categoria: '', stock: -1, descripcion: '', codigo: '' });

  const e1 = await P.encolar(Modelo, { userId: U, deviceId: PC, producto: prod('Primero'), foto: f }, ahora);
  assert(/^[a-f0-9]{24}$/.test(e1.id) && e1.estado === 'pendiente');
  await P.encolar(Modelo, { userId: U, deviceId: PC, producto: prod('Segundo'), foto: { vacia: true } }, new Date(ahora.getTime() + 1000));
  await P.encolar(Modelo, { userId: U, deviceId: 'otra-pc', producto: prod('De otra PC'), foto: { vacia: true } }, ahora);
  await P.encolar(Modelo, { userId: OTRO, deviceId: PC, producto: prod('De otro usuario'), foto: { vacia: true } }, ahora);

  let lote = await P.retirar(Modelo, U, PC, ahora);
  assert.deepStrictEqual(lote.map((x) => x.producto.nombre), ['Primero', 'Segundo'], 'solo lo de esta cuenta y esta PC, el más viejo primero');
  assert(lote[0].foto && lote[0].foto.mime === 'image/jpeg' && lote[1].foto === null, 'la foto viaja solo si hay');
  assert.strictEqual(filas.filter((x) => x.estado === 'pendiente').length, 4, 'retirar no cambia el estado: se marca al confirmar');
  assert.strictEqual((await P.retirar(Modelo, U, PC, new Date(ahora.getTime() + P.TTL_MS + 5000))).length, 0, 'lo vencido no se retira');

  // confirmar
  assert.strictEqual(await P.confirmar(Modelo, OTRO, PC, [{ id: e1.id, ok: true }]), 0, 'otra cuenta no puede confirmar');
  assert.strictEqual(await P.confirmar(Modelo, U, PC, [{ id: 'no-es-un-id', ok: true }, null, { ok: true }]), 0, 'ids inválidos se ignoran');
  assert.strictEqual(await P.confirmar(Modelo, U, PC, [{ id: e1.id, ok: true, detalle: 'creado' }], ahora), 1);
  const primero = filas.find((x) => x._id === e1.id);
  assert(primero.estado === 'hecho' && primero.foto.data === '' && primero.detalle === 'creado', 'al confirmar se borra la foto de la nube');
  assert.strictEqual(await P.confirmar(Modelo, U, PC, [{ id: e1.id, ok: true }], ahora), 0, 'confirmar dos veces no hace nada');
  assert.deepStrictEqual((await P.retirar(Modelo, U, PC, ahora)).map((x) => x.producto.nombre), ['Segundo'], 'lo ya hecho no vuelve a salir');

  // lista para el celular
  const lista = await P.listar(Modelo, U, PC);
  assert(lista.length === 2 && lista.every((x) => !('foto' in x)), 'la lista del celular no lleva fotos');
  assert.deepStrictEqual(lista.map((x) => x.estado).sort(), ['hecho', 'pendiente']);

  // tope por lotes y por peso
  const grandes = []; filas.length = 0;
  const pesada = { ok: true, mime: 'image/jpeg', base64: 'A'.repeat(1024 * 1024) };
  for (let i = 0; i < 4; i++) grandes.push(await P.encolar(Modelo, { userId: U, deviceId: PC, producto: prod('G' + i), foto: pesada }, new Date(ahora.getTime() + i)));
  assert.strictEqual((await P.retirar(Modelo, U, PC, ahora)).length, 2, 'la respuesta tiene tope de peso (3 MB)');
  filas.length = 0;
  for (let i = 0; i < 6; i++) await P.encolar(Modelo, { userId: U, deviceId: PC, producto: prod('C' + i), foto: { vacia: true } }, new Date(ahora.getTime() + i));
  assert.strictEqual((await P.retirar(Modelo, U, PC, ahora)).length, P.LOTE_MAX, 'máximo 4 por consulta');

  // tope de pendientes por cuenta
  filas.length = 0;
  for (let i = 0; i < P.MAX_PENDIENTES; i++) await P.encolar(Modelo, { userId: U, deviceId: PC, producto: prod('P' + i), foto: { vacia: true } }, ahora);
  await assert.rejects(() => P.encolar(Modelo, { userId: U, deviceId: PC, producto: prod('uno más'), foto: { vacia: true } }, ahora), (e) => e.status === 429);
  await P.encolar(Modelo, { userId: OTRO, deviceId: PC, producto: prod('otro usuario sí puede'), foto: { vacia: true } }, ahora);

  // ── búsqueda de código de barras ──
  assert(esCodigo('7790070411111') && !esCodigo('abc') && !esCodigo('123'));
  let llamadas = 0;
  const respuesta = (json, ok = true) => async () => { llamadas++; return { ok, json: async () => json }; };
  const r1 = await buscarCodigo('7790070411111', { fetchFn: respuesta({ status: 1, product: { product_name_es: 'Yerba mate', brands: 'Taragüí,Otra', quantity: '500 g', categories: 'en:Beverages, Infusiones' } }) });
  assert.deepStrictEqual(r1, { encontrado: true, nombre: 'Yerba mate Taragüí 500 g', marca: 'Taragüí', categoria: 'Beverages', cantidad: '500 g' });
  const r2 = await buscarCodigo('7790070411111', { fetchFn: respuesta({ status: 1, product: { product_name: 'Alfajor Jorgito 40 g', brands: 'Jorgito', quantity: '40 g' } }) });
  assert.strictEqual(r2.nombre, 'Alfajor Jorgito 40 g', 'no repite la marca ni la cantidad si ya están en el nombre');
  assert.strictEqual((await buscarCodigo('7790070411111', { fetchFn: respuesta({ status: 0 }) })).encontrado, false, 'no encontrado');
  assert.strictEqual((await buscarCodigo('7790070411111', { fetchFn: respuesta({}, false) })).encontrado, false, 'error del servicio');
  assert.strictEqual((await buscarCodigo('7790070411111', { fetchFn: async () => { throw new Error('sin internet'); } })).encontrado, false, 'sin internet: no rompe');
  llamadas = 0;
  assert.strictEqual((await buscarCodigo('no-es-codigo', { fetchFn: respuesta({ status: 1, product: { product_name: 'x' } }) })).encontrado, false);
  assert.strictEqual(llamadas, 0, 'un código inválido ni siquiera sale a internet');

  console.log('productos-celular: OK');
})().catch((e) => { console.error(e); process.exit(1); });
