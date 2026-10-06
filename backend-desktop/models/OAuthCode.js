// models/OAuthCode.js
// Códigos OAuth efímeros de un solo uso (login con Google/Facebook). En
// backend/ viven en un Map en memoria, que no sirve en Vercel: la petición
// del callback y la del canje corren en procesos distintos. Se guardan en
// Mongo con TTL de 5 minutos.
'use strict';

const mongoose = require('mongoose');

const OAuthCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL: Mongo lo borra al vencer
});

module.exports = mongoose.model('OAuthCode', OAuthCodeSchema);
