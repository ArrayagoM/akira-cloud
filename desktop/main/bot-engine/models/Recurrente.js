// models/Recurrente.js — gastos fijos y vencimientos del dueño (alquiler, internet, monotributo…): se cargan solos a la Caja cada mes
// y/o avisan unos días antes. Viven en la PC del dueño.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('recurrentes');
