// db/id.js
// Genera ids con forma de ObjectId de Mongo (24 hex chars) — no necesitan
// ser "reales" ObjectIds, solo strings únicos que el resto del código pueda
// tratar como tal (t._id.toString() funciona igual sobre un string plano).
'use strict';

const crypto = require('crypto');

function nuevoId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const random = crypto.randomBytes(8).toString('hex');
  return (timestamp + random).slice(0, 24);
}

module.exports = { nuevoId };
