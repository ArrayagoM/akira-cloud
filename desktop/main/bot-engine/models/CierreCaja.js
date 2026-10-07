// models/CierreCaja.js — cierre de caja diario: efectivo esperado vs. contado. Uno por día y negocio. Vive en la PC del dueño.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('cierres_caja');
