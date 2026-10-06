// models/WaitlistEntry.js — shim local de backend/models/WaitlistEntry.js
// Sin restricciones de unicidad reales en el modelo original (la app evita
// duplicados a mano con un findOne antes de crear, ver waitlist.service.js
// agregarALista) — no hace falta índice único acá.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('waitlist_entries');
