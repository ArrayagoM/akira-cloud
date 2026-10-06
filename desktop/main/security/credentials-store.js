// security/credentials-store.js
// Cifra las API keys del usuario (Groq, MercadoPago, Rime, tokens de Google
// Calendar) con `safeStorage` de Electron — usa el almacén de claves del
// propio sistema operativo (DPAPI en Windows, ligado al usuario de Windows
// que instaló la app). A propósito NO usa el patrón de backend/services/
// crypto.service.js (AES-256-GCM derivado de una ENCRYPTION_KEY fija):
// esa clave maestra viviría embebida en un binario distribuido — cualquier
// instalación podría descifrar las keys de CUALQUIER otra si el binario se
// filtra. Con safeStorage, sin la clave del SO de esa PC puntual, el dato
// cifrado guardado en el SQLite local no sirve de nada aunque se copie.
//
// Trade-off para el usuario final (documentado en el plan de migración):
// si reinstala Windows o migra a otra PC, tiene que volver a cargar sus API
// keys — no es recuperable copiando el archivo SQLite a otra máquina.
'use strict';

// process.versions.electron solo existe cuando este código corre DENTRO de
// un proceso Electron real (la app empaquetada). La suite de tests corre
// con `node tests/x.test.js` plano (mismo patrón que el resto del repo,
// ver backend/tests) — ahí no hay Electron ni safeStorage disponibles, así
// que se usa un fallback de solo-test con una clave efímera en memoria
// (nunca persistida, nunca la misma entre corridas). Este fallback NUNCA
// se ejecuta en la app real distribuida al usuario — ahí siempre corre
// dentro de Electron y usa safeStorage de verdad.
const corriendoEnElectron = !!process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE;

let safeStorage = null;
let claveFallbackTest = null;

function cargarSafeStorage() {
  if (safeStorage) return safeStorage;
  safeStorage = require('electron').safeStorage;
  return safeStorage;
}

function disponible() {
  if (!corriendoEnElectron) return true; // fallback de test siempre "disponible"
  try {
    return cargarSafeStorage().isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptFallbackTest(texto) {
  const crypto = require('crypto');
  if (!claveFallbackTest) claveFallbackTest = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', claveFallbackTest, iv);
  const enc = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([iv, tag, enc]).toString('base64') };
}

function decryptFallbackTest(payload) {
  if (!claveFallbackTest) return null;
  const crypto = require('crypto');
  const buf = Buffer.from(payload.encrypted, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', claveFallbackTest, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// Mismo shape de salida que crypto.service.js ({ encrypted }) para que el
// resto del código (Config shim) no tenga que distinguir de dónde viene.
function encrypt(texto) {
  if (!texto) return null;
  if (!corriendoEnElectron) return encryptFallbackTest(texto);
  if (!disponible()) {
    throw new Error('El cifrado de credenciales no está disponible en este sistema (safeStorage).');
  }
  const buf = cargarSafeStorage().encryptString(String(texto));
  return { encrypted: buf.toString('base64') };
}

function decrypt(payload) {
  if (!payload?.encrypted) return null;
  if (!corriendoEnElectron) return decryptFallbackTest(payload);
  if (!disponible()) return null;
  try {
    const buf = Buffer.from(payload.encrypted, 'base64');
    return cargarSafeStorage().decryptString(buf);
  } catch (err) {
    console.error('[credentials-store] Error al descifrar:', err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt, disponible };
