// models/Conocimiento.js — documentos de la base de conocimiento propia (preguntas frecuentes, políticas, cómo llegar…).
// Viven en la PC del dueño. Cada documento guarda su texto partido en fragmentos para buscar rápido.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('conocimiento');
