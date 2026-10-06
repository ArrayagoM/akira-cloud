// models/User.js — shim mínimo local.
// akira.bot.js solo usa esto en un lugar (actualizarCanalAdmin, para
// decidir si habilitar el canal de comandos de administración de la
// PLATAFORMA por WhatsApp) — una feature que no aplica a una instalación
// de escritorio de un solo negocio (no hay "plataforma" que administrar
// localmente). system.bot.js en el bot-engine local es un stub que ya
// desactiva esa rama (ver bot-engine/services/system.bot.js), así que este
// modelo solo necesita existir y no romper el require — el rol nunca es
// 'admin' localmente.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('users_cache');
