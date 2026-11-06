// lib/productos-celular.js
// Bandeja de productos cargados desde el celular (cámara + código de barras). El celular deja el producto y la foto acá; la PC los
// retira en su próxima consulta (~1 min), los guarda en el Catálogo y confirma; al confirmar se borra la foto de la nube.
// Todo es de UNA cuenta y de UNA PC, con topes de tamaño y cantidad, y vence solo (7 días) si la PC no aparece.
// Lógica con el modelo inyectado (se prueba sin Mongo; ver tests/productos-celular.test.js).
'use strict';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;        // si la PC no retira el producto en 7 días, se descarta
const TTL_HECHO_MS = 24 * 60 * 60 * 1000;      // lo ya importado queda 1 día en la lista del celular (sin la foto) y se borra
const MAX_PENDIENTES = 40;                      // por cuenta
const MAX_FOTO_BYTES = Math.floor(1.2 * 1024 * 1024); // el celular la reduce a ~300 KB antes de enviarla
const LOTE_MAX = 4;                             // productos por consulta de la PC
const LOTE_BYTES_MAX = 3 * 1024 * 1024;         // y tope de peso de la respuesta (Vercel admite ~4,5 MB)
const ID_RE = /^[a-f0-9]{24}$/i;

// "1.500,50" → 1500.5 · "1500,5" → 1500.5 · "1.500" → 1500 · "$ 2500" → 2500
function leerPrecio(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? '').replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s);
}

// Mismo criterio que el Catálogo de la PC (gestion/codigo-barras.js): solo caracteres imprimibles, hasta 40.
function limpiarCodigo(c) {
  const t = String(c ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40);
  return /^[\x20-\x7e]*$/.test(t) ? t : '';
}

// → { ok:true, producto } | { ok:false, error }
// sinNombreOk: con foto el nombre puede venir vacío (la PC lo lee de la foto con la IA del cliente).
function limpiarProducto(entrada, { sinNombreOk = false } = {}) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const nombre = String(e.nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!nombre && !sinNombreOk) return { ok: false, error: 'Escribí el nombre del producto o sacale una foto para que tu PC lo lea.' };
  const precio = leerPrecio(e.precio);
  if (!Number.isFinite(precio) || precio < 0) return { ok: false, error: 'Poné el precio (un número, por ejemplo 2500).' };
  if (precio > 1e9) return { ok: false, error: 'El precio es demasiado grande.' };
  const stockN = parseInt(e.stock, 10);
  return {
    ok: true,
    producto: {
      nombre,
      precio: Math.round(precio * 100) / 100,
      categoria: String(e.categoria ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      stock: Number.isFinite(stockN) && stockN >= 0 ? Math.min(stockN, 1e6) : -1, // -1 = sin control de stock (igual que el Catálogo)
      descripcion: String(e.descripcion ?? '').trim().slice(0, 500),
      codigo: limpiarCodigo(e.codigo),
    },
  };
}

function tipoDeImagen(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

// La foto es opcional. → { ok:true, vacia:true } | { ok:true, base64, mime, bytes } | { ok:false, error }
function validarFoto(entrada) {
  if (entrada == null || entrada === '') return { ok: true, vacia: true };
  const limpio = String(entrada).replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
  if (!limpio || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) return { ok: false, error: 'La foto no es válida.' };
  const buf = Buffer.from(limpio, 'base64');
  if (buf.length > MAX_FOTO_BYTES) return { ok: false, error: 'La foto es muy pesada. Sacala de nuevo (se reduce sola).' };
  const mime = tipoDeImagen(buf);
  if (!mime) return { ok: false, error: 'La foto tiene que ser JPG, PNG o WebP.' };
  return { ok: true, base64: limpio, mime, bytes: buf.length };
}

// El celular manda un producto: lo deja en la bandeja de esa PC.
async function encolar(Modelo, { userId, deviceId, producto, foto }, ahora = new Date()) {
  const pendientes = await Modelo.countDocuments({ userId, estado: 'pendiente', expireAt: { $gt: ahora } });
  if (pendientes >= MAX_PENDIENTES) throw Object.assign(new Error('Tenés demasiados productos esperando a tu PC. Prendé la PC y esperá a que los reciba.'), { status: 429 });
  const doc = await Modelo.create({
    userId, deviceId, estado: 'pendiente', producto,
    foto: foto && !foto.vacia ? { mime: foto.mime, data: foto.base64 } : { mime: '', data: '' },
    creadoEn: ahora, expireAt: new Date(ahora.getTime() + TTL_MS),
  });
  return { id: String(doc._id), estado: 'pendiente' };
}

// La PC retira lo que está esperando (sin cambiarle el estado: se marca recién cuando la PC confirma, así nada se pierde si se corta).
async function retirar(Modelo, userId, deviceId, ahora = new Date()) {
  const filas = await Modelo.find({ userId, deviceId, estado: 'pendiente', expireAt: { $gt: ahora } }).sort({ creadoEn: 1 }).limit(LOTE_MAX).lean();
  const lote = []; let peso = 0;
  for (const f of filas) {
    const kb = (f.foto && f.foto.data ? f.foto.data.length : 0) + 2000;
    if (lote.length && peso + kb > LOTE_BYTES_MAX) break;
    peso += kb;
    lote.push({ id: String(f._id), producto: f.producto, foto: f.foto && f.foto.data ? { mime: f.foto.mime, data: f.foto.data } : null });
  }
  return lote;
}

// hechos: [{ id, ok, detalle? }] que informa la PC. Borra la foto de la nube y deja el registro 1 día.
async function confirmar(Modelo, userId, deviceId, hechos, ahora = new Date()) {
  if (!Array.isArray(hechos)) return 0;
  let n = 0;
  for (const h of hechos.slice(0, 20)) {
    if (!h || typeof h.id !== 'string' || !ID_RE.test(h.id)) continue;
    const r = await Modelo.updateOne(
      { _id: h.id, userId, deviceId, estado: 'pendiente' },
      { $set: { estado: h.ok === true ? 'hecho' : 'fallo', detalle: String(h.detalle || '').slice(0, 120), hechoEn: ahora, expireAt: new Date(ahora.getTime() + TTL_HECHO_MS), foto: { mime: '', data: '' } } },
    );
    if (r && (r.modifiedCount || r.nModified)) n++;
  }
  return n;
}

// Lo que ve el celular: sin la foto.
async function listar(Modelo, userId, deviceId) {
  const filas = await Modelo.find({ userId, deviceId }).sort({ creadoEn: -1 }).limit(20).select('-foto').lean();
  return filas.map((f) => ({ id: String(f._id), nombre: f.producto?.nombre || '', precio: f.producto?.precio ?? null, estado: f.estado, detalle: f.detalle || '', creadoEn: f.creadoEn }));
}

module.exports = { TTL_MS, MAX_PENDIENTES, MAX_FOTO_BYTES, LOTE_MAX, leerPrecio, limpiarCodigo, limpiarProducto, validarFoto, tipoDeImagen, encolar, retirar, confirmar, listar };
