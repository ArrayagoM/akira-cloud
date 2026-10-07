// models/Comprobante.js — presupuestos y recibos en PDF (numerados por tipo: P-0001, R-0001). Viven en la PC del dueño.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('comprobantes');
