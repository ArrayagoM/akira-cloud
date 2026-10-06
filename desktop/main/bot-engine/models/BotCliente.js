// models/BotCliente.js — shim local de backend/models/BotCliente.js
// Reproduce el índice único {userId, jid} (un registro por cliente de
// WhatsApp por negocio) — mongo-clientes.service.js depende de que la
// violación de esto tire un error con .code === 11000 (ver registrarNuevo).
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('bot_clientes', {
  extraColumns: [
    { name: 'c_userId', path: 'userId' },
    { name: 'c_jid', path: 'jid' },
  ],
  uniqueIndex: { columns: ['c_userId', 'c_jid'] },
});
