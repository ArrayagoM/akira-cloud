// models/Proveedor.js — proveedores del negocio (a quién se le compra y cuánto se le debe).
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('proveedores');
