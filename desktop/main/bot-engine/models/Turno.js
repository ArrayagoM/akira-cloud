// models/Turno.js — shim local de backend/models/Turno.js
// Reproduce el índice único PARCIAL que evita doble-reserva en el mismo
// slot (solo turnos pendiente/confirmado bloquean — cancelados no):
// SQLite soporta índices únicos parciales nativamente (WHERE), así que la
// integridad se sigue haciendo cumplir en el motor de datos, no solo en
// código de aplicación — igual que el índice real de Mongo en
// backend/models/Turno.js.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('turnos', {
  extraColumns: [
    { name: 'c_userId', path: 'userId' },
    { name: 'c_calendarId', path: 'calendarId' },
    { name: 'c_fechaInicio', path: 'fechaInicio' },
    { name: 'c_estado', path: 'estado' },
  ],
  uniqueIndex: {
    columns: ['c_userId', 'c_calendarId', 'c_fechaInicio'],
    where: `"c_estado" IN ('pendiente','confirmado')`,
  },
});
