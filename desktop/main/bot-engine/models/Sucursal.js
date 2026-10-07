// models/Sucursal.js — sucursales / locales del negocio. Sirven para separar la plata y los turnos por local. Viven en la PC del dueño.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('sucursales');
