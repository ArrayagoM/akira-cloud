// models/ClienteMemoria.js — shim local de backend/models/ClienteMemoria.js
// mongo-clientes.service.js lo requiere a nivel de módulo (para exportar la
// variante useMongoClientesState, no usada por el bot-engine local — se
// queda con crearMongoClientesService/BotCliente) pero igual necesita
// resolver sin explotar al hacer require().
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('clientes_memoria');
