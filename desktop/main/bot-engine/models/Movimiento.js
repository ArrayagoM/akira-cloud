// models/Movimiento.js — ingresos y gastos cargados a mano (o importados) en la Caja.
// Los ingresos de turnos cobrados NO se guardan acá: se calculan de los turnos (gestion/caja.js).
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('movimientos');
