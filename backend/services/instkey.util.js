// services/instkey.util.js
// Helpers puros para identificar instancias de bot por (uid, slot), espejo de
// worker/lib/instkey.js. Se mantiene duplicado a propósito — backend/ y worker/
// son paquetes npm independientes sin node_modules compartido — pero AMBOS deben
// producir el mismo formato de clave porque viaja por el wire (worker:ready → botIds).
'use strict';

function instKey(uid, slot) {
  return `${String(uid)}:${parseInt(slot, 10) || 0}`;
}

function parseInstKey(key) {
  const str = String(key);
  const idx = str.lastIndexOf(':');
  if (idx === -1) return { uid: str, slot: 0 };
  return { uid: str.slice(0, idx), slot: parseInt(str.slice(idx + 1), 10) || 0 };
}

module.exports = { instKey, parseInstKey };
