// models/Analitica.js — preguntas de clientes ya anonimizadas (sin teléfonos ni mails) para el análisis de conversaciones.
// Viven solo en la PC del dueño. Se conservan 90 días.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('analitica');
