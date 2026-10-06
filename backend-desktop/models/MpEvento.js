// models/MpEvento.js
// Buzón de notificaciones de MercadoPago para instalaciones de escritorio.
// MP necesita una URL pública HTTPS para avisar que un cliente del negocio
// pagó un turno, y una PC de escritorio no la tiene: MP le avisa a este
// servidor, que guarda el evento acá, y la app lo retira (polling) y lo
// procesa localmente. El bot igual re-verifica el pago contra la API de MP
// con la key del negocio, así que un evento falso no agenda nada.
'use strict';

const mongoose = require('mongoose');

const MpEventoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 7 } }, // TTL 7 días
});

module.exports = mongoose.model('MpEvento', MpEventoSchema);
