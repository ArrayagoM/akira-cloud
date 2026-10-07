// models/CtaCte.js — movimientos de cuenta corriente: deudas y pagos de clientes (Deudores)
// y compras a crédito y pagos a proveedores. Ver gestion/ctacte.js.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('ctacte');
