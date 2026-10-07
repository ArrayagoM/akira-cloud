// main/logo-negocio.js
// Logo del negocio para los comprobantes en PDF. Se guarda en esta PC (userData/logo.jpg|png), aparte de las fotos del catálogo
// (esas se limpian solas cuando ningún producto las usa; el logo no).
'use strict';

const fs = require('fs');
const path = require('path');
const fotos = require('./catalogo-fotos');

const MAX_BYTES = 2 * 1024 * 1024;
const archivos = (dir) => ['logo.jpg', 'logo.png'].map((n) => path.join(dir, n));

function achicar(buf) {
  try {
    const { nativeImage } = require('electron');
    if (!nativeImage?.createFromBuffer) return buf;
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return buf;
    const { width } = img.getSize();
    const chica = width > 500 ? img.resize({ width: 500, quality: 'good' }) : img;
    return fotos.tipoDeImagen(buf) === 'png' ? chica.toPNG() : chica.toJPEG(88);
  } catch { return buf; }
}

// → 'jpg' | 'png'. Solo JPG o PNG (el PDF no admite WebP).
function guardar(dir, buffer) {
  if (!Buffer.isBuffer(buffer)) throw Object.assign(new Error('Falta la imagen.'), { status: 400 });
  const tipo = fotos.tipoDeImagen(buffer);
  if (tipo !== 'jpg' && tipo !== 'png') throw Object.assign(new Error('El logo tiene que ser una imagen JPG o PNG.'), { status: 415 });
  if (buffer.length > 15 * 1024 * 1024) throw Object.assign(new Error('La imagen es muy grande (máximo 15 MB).'), { status: 413 });
  const buf = achicar(buffer);
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('El logo sigue siendo muy pesado. Probá con una imagen más chica.'), { status: 413 });
  quitar(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `logo.${tipo}`), buf);
  return tipo;
}

// → Buffer | null
function leer(dir) {
  for (const f of archivos(dir)) { try { return fs.readFileSync(f); } catch { /* probar el siguiente */ } }
  return null;
}

function quitar(dir) { for (const f of archivos(dir)) { try { fs.unlinkSync(f); } catch { /* no estaba */ } } }

module.exports = { guardar, leer, quitar };
