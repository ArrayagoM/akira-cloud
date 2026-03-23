// services/crypto.service.js
// Cifrado AES-256-GCM para API Keys de clientes
// Cada campo cifrado tiene su propio IV aleatorio → rainbow tables inviables
'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32; // 256 bits
const IV_LEN = 16; // 128 bits
const TAG_LEN = 16; // GCM auth tag

// ── Clave maestra del servidor ───────────────────────────────
// Siempre derivar desde ENCRYPTION_KEY usando PBKDF2 para consistencia
function getMasterKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      '[CRITICO] ENCRYPTION_KEY no está definida en el archivo .env. ' +
        'Agregá: ENCRYPTION_KEY=cualquier_texto_de_al_menos_16_caracteres',
    );
  }
  if (raw.startsWith('cambia_esto')) {
    throw new Error(
      '[CRITICO] ENCRYPTION_KEY tiene el valor de ejemplo del .env.example. ' +
        'Cambiala por cualquier texto aleatorio, ej: ENCRYPTION_KEY=akira2024clave_random_aqui',
    );
  }
  if (raw.length < 16) {
    throw new Error(
      `[CRITICO] ENCRYPTION_KEY demasiado corta (${raw.length} chars). Mínimo 16 caracteres.`,
    );
  }
  // Derivar clave de longitud exacta con PBKDF2
  return crypto.pbkdf2Sync(raw, 'akira-cloud-salt-v1', 100_000, KEY_LEN, 'sha512');
}

/**
 * Cifra un string y retorna { iv, encrypted, authTag }
 * @param {string} texto — valor a cifrar
 * @returns {{ iv: string, encrypted: string, authTag: string }}
 */
function encrypt(texto) {
  if (!texto) return null;
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc1 = cipher.update(String(texto), 'utf8', 'hex');
  const enc2 = cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    encrypted: enc1 + enc2,
    authTag: tag.toString('hex'),
  };
}

/**
 * Descifra un objeto { iv, encrypted, authTag } y retorna el string original
 * @param {{ iv: string, encrypted: string, authTag: string }} payload
 * @returns {string|null}
 */
function decrypt(payload) {
  if (!payload?.encrypted || !payload?.iv || !payload?.authTag) return null;
  try {
    const key = getMasterKey();
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.authTag, 'hex');

    if (iv.length !== IV_LEN) throw new Error('IV inválido');
    if (tag.length !== TAG_LEN) throw new Error('AuthTag inválido');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const dec1 = decipher.update(payload.encrypted, 'hex', 'utf8');
    const dec2 = decipher.final('utf8');

    return dec1 + dec2;
  } catch (err) {
    // No logear el error con la clave; solo el mensaje genérico
    console.error('[Crypto] Error al descifrar:', err.message);
    return null;
  }
}

/**
 * Verifica que una clave se puede cifrar y descifrar correctamente (smoke test)
 */
function selfTest() {
  const prueba = 'test-key-12345-akira';
  const cifrado = encrypt(prueba);
  const resultado = decrypt(cifrado);
  if (resultado !== prueba) {
    throw new Error('[Crypto] Self-test fallido — verificar ENCRYPTION_KEY');
  }
}

// Ejecutar self-test al cargar el módulo
selfTest();

module.exports = { encrypt, decrypt };
