// services/system.bot.js — stub local.
// El system.bot.js real (backend/services/system.bot.js) es el canal de
// comandos por WhatsApp para que EL DUEÑO DE LA PLATAFORMA (vos)
// administre Akira Cloud completo desde su celular — no tiene sentido en
// una instalación de escritorio de un solo negocio (no hay "plataforma"
// que administrar desde ahí). Este stub mantiene la misma superficie que
// akira.bot.js llama (esCanalAdminActivo / esComandoSistemaCandidato /
// manejarComandoSistema / registrarCanalAdmin / desregistrarCanalAdmin)
// pero la deja permanentemente inactiva — akira.bot.js no se modifica.
'use strict';

function esCanalAdminActivo() { return false; }
function esComandoSistemaCandidato() { return false; }
async function manejarComandoSistema() { return false; }
function registrarCanalAdmin() {}
function desregistrarCanalAdmin() {}
function configurarBotManager() {}

module.exports = {
  esCanalAdminActivo,
  esComandoSistemaCandidato,
  manejarComandoSistema,
  registrarCanalAdmin,
  desregistrarCanalAdmin,
  configurarBotManager,
};
