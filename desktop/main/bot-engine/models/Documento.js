// models/Documento.js — archivos (PDF/imágenes) que los clientes mandan por
// WhatsApp: comprobantes, facturas, etc. Los archivos viven en la PC del dueño.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('documentos');
