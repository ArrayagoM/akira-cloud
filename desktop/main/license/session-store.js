// license/session-store.js
// Guarda la sesión del usuario (token + userId) en disco, con el token
// cifrado con el almacén de claves del sistema (safeStorage). Hace falta para
// que el bot siga validando su licencia y se reactive solo al prender la PC,
// sin que nadie abra la ventana.
'use strict';

const fs = require('fs');
const path = require('path');
const credenciales = require('../security/credentials-store');

const archivo = (dir) => path.join(dir, 'session.json');

function guardar(dir, { token, userId, email }) {
  try {
    const enc = credenciales.encrypt(token);
    fs.writeFileSync(archivo(dir), JSON.stringify({ token: enc, userId: String(userId), email }), 'utf-8');
  } catch (err) {
    console.error('[session-store] no se pudo guardar la sesión:', err.message);
  }
}

function leer(dir) {
  try {
    const d = JSON.parse(fs.readFileSync(archivo(dir), 'utf-8'));
    const token = credenciales.decrypt(d.token);
    return token ? { token, userId: d.userId, email: d.email } : null;
  } catch {
    return null;
  }
}

function borrar(dir) {
  try { fs.unlinkSync(archivo(dir)); } catch {}
}

module.exports = { guardar, leer, borrar };
