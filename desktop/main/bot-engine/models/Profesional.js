// models/Profesional.js — profesionales del negocio (peluqueros, kinesiólogos, etc.): nombre, color, comisión y horario propio. Viven en la PC del dueño.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('profesionales');
