// main/catalogo-fotos.js
// Fotos de los productos del catálogo: se guardan en esta PC (userData/catalogo-fotos) y el bot las manda por WhatsApp
// cuando un cliente pregunta por ese producto. En el producto queda una referencia "local:<id>.jpg" (nunca una ruta).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 3 * 1024 * 1024;
const REF_RE = /^local:([a-f0-9]{16}\.(?:jpg|png|webp))$/;
const carpeta = (dir) => path.join(dir, 'catalogo-fotos');

function tipoDeImagen(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

// Achica y comprime con Electron (si está disponible); si no, deja la original (con tope de tamaño).
function optimizar(buf) {
  try {
    const { nativeImage } = require('electron');
    if (!nativeImage?.createFromBuffer) return { buf, ext: tipoDeImagen(buf) };
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { buf, ext: tipoDeImagen(buf) };
    const { width } = img.getSize();
    const chica = width > 1280 ? img.resize({ width: 1280, quality: 'good' }) : img;
    return { buf: chica.toJPEG(82), ext: 'jpg' };
  } catch { return { buf, ext: tipoDeImagen(buf) }; }
}

// → "local:<id>.<ext>"
function guardar(userDataDir, buffer) {
  if (!Buffer.isBuffer(buffer) || !tipoDeImagen(buffer)) throw Object.assign(new Error('El archivo no es una imagen válida (JPG, PNG o WebP).'), { status: 415 });
  if (buffer.length > 15 * 1024 * 1024) throw Object.assign(new Error('La imagen es muy grande (máximo 15 MB).'), { status: 413 });
  const { buf, ext } = optimizar(buffer);
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('La imagen sigue siendo muy pesada. Probá con una más chica (máximo 3 MB).'), { status: 413 });
  fs.mkdirSync(carpeta(userDataDir), { recursive: true });
  const nombre = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(carpeta(userDataDir), nombre), buf);
  return `local:${nombre}`;
}

// → Buffer | null   (solo referencias válidas: no se puede salir de la carpeta)
function leer(userDataDir, ref) {
  const m = REF_RE.exec(String(ref || ''));
  if (!m) return null;
  try { return fs.readFileSync(path.join(carpeta(userDataDir), m[1])); } catch { return null; }
}

const esLocal = (ref) => REF_RE.test(String(ref || ''));

// Borra las fotos que ya no usa ningún producto. usadas: array de referencias.
function limpiar(userDataDir, usadas) {
  const conservar = new Set((usadas || []).map((r) => (REF_RE.exec(String(r || '')) || [])[1]).filter(Boolean));
  let borradas = 0;
  try {
    for (const f of fs.readdirSync(carpeta(userDataDir))) {
      if (conservar.has(f)) continue;
      // se dan 10 minutos de gracia: una foto recién subida puede estar esperando que se guarde la lista
      try { if (Date.now() - fs.statSync(path.join(carpeta(userDataDir), f)).mtimeMs < 10 * 60 * 1000) continue; fs.unlinkSync(path.join(carpeta(userDataDir), f)); borradas++; } catch { /* en uso */ }
    }
  } catch { /* la carpeta todavía no existe */ }
  return borradas;
}

module.exports = { guardar, leer, esLocal, limpiar, tipoDeImagen, REF_RE };
