// worker/lib/instkey.js
// Helpers puros para identificar instancias de bot por (uid, slot).
// slot 0 = cuenta principal. slot > 0 = cuentas adicionales del plan Agencia.
'use strict';

// Clave interna para los Maps en memoria (runners, arranqueEnCurso, caches).
function instKey(uid, slot) {
  return `${String(uid)}:${parseInt(slot, 10) || 0}`;
}

// Inversa de instKey — separa el uid del slot. Usa el ÚLTIMO ':' como
// separador porque uid (ObjectId hex) nunca contiene ':'.
function parseInstKey(key) {
  const str = String(key);
  const idx = str.lastIndexOf(':');
  if (idx === -1) return { uid: str, slot: 0 };
  return { uid: str.slice(0, idx), slot: parseInt(str.slice(idx + 1), 10) || 0 };
}

// Nombre de carpeta de sesión en disco. slot 0 mantiene el nombre histórico
// (sin sufijo) para no romper sesiones ya guardadas antes de este cambio.
function sessionDirName(uid, slot) {
  const s = parseInt(slot, 10) || 0;
  return s === 0 ? String(uid) : `${uid}_slot${s}`;
}

// Inversa de sessionDirName — reconstruye (uid, slot) a partir de un nombre
// de carpeta encontrado en el filesystem (usado por autoRestaurar()).
function parseSessionDirName(dirName) {
  const m = String(dirName).match(/^(.+)_slot(\d+)$/);
  if (m) return { uid: m[1], slot: parseInt(m[2], 10) };
  return { uid: String(dirName), slot: 0 };
}

module.exports = { instKey, parseInstKey, sessionDirName, parseSessionDirName };
