// models/WAAuth.js
// Almacena las credenciales de sesión de Baileys en MongoDB.
// Reemplaza el almacenamiento en filesystem (ephemeral en Render free tier).
'use strict';

const mongoose = require('mongoose');

const WAAuthSchema = new mongoose.Schema(
  {
    // _id = `${userId}:${filename}` (ej: "abc123:creds", "abc123:pre-key-1")
    _id:    { type: String },
    data:   { type: String, required: true }, // JSON serializado con BufferJSON
  },
  {
    collection: 'wa_auth',
    // No timestamps — se actualiza constantemente, los timestamps agregan ruido
  }
);

module.exports = mongoose.models.WAAuth || mongoose.model('WAAuth', WAAuthSchema);
