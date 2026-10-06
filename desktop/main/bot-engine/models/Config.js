// models/Config.js — shim local de backend/models/Config.js
// Misma superficie que usa akira.bot.js: findOne({userId}) [.lean()],
// cfg.getKey(campo), cfg.setKey(campo, valor), cfg.save(), estaCompleta(),
// resumenKeys(). Respaldado por SQLite (ver db/mongoose-lite.js) en vez de
// Mongo, y las keys cifradas con credentials-store (safeStorage) en vez de
// crypto.service.js — ver la nota en ese archivo.
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');
const credenciales = require('../../security/credentials-store');

const CAMPOS_CIFRADOS = ['keyGroq', 'keyMP', 'idCalendar', 'keyRime', 'keyNgrok', 'credentialsGoogleB64', 'googleCalendarTokens'];

function mixin(doc) {
  // Igual que el modelo real: nunca exponer los campos cifrados crudos al serializar.
  Object.defineProperty(doc, 'toJSON', {
    value: function () {
      const c = { ...this };
      for (const campo of CAMPOS_CIFRADOS) delete c[campo];
      return c;
    },
    enumerable: false, configurable: true,
  });
  Object.defineProperty(doc, 'setKey', {
    value: function (campo, valor) {
      if (!valor) { this[campo] = undefined; return; }
      this[campo] = credenciales.encrypt(valor);
    },
    enumerable: false, configurable: true,
  });
  Object.defineProperty(doc, 'getKey', {
    value: function (campo) {
      if (!this[campo]?.encrypted) return null;
      return credenciales.decrypt(this[campo]);
    },
    enumerable: false, configurable: true,
  });
  Object.defineProperty(doc, 'estaCompleta', {
    value: function () { return !!(this.keyGroq?.encrypted && this.miNombre && this.negocio); },
    enumerable: false, configurable: true,
  });
  Object.defineProperty(doc, 'resumenKeys', {
    value: function () {
      return {
        groq: !!this.keyGroq?.encrypted,
        mp: !!this.keyMP?.encrypted,
        calendar: !!this.idCalendar?.encrypted,
        rime: !!this.keyRime?.encrypted,
        ngrok: !!this.keyNgrok?.encrypted,
        credentialsGoogle: !!this.credentialsGoogleB64?.encrypted,
        googleCalendarOAuth: !!this.googleCalendarTokens?.encrypted,
        googleEmail: this.googleEmail || '',
        tieneTransferencia: !!(this.aliasTransferencia || this.cbuTransferencia),
        tieneCatalogo: this.catalogo?.length > 0,
        catalogoProductos: this.catalogo?.length || 0,
        catalogoSincronizadoEn: this.catalogoSincronizadoEn || null,
      };
    },
    enumerable: false, configurable: true,
  });
}

const coleccion = crearColeccion('config', { mixin });

// toJSON con la misma transformación que el modelo real: nunca exponer los
// campos cifrados crudos (usado si algún día se manda Config al renderer).
function limpiarParaJSON(obj) {
  const c = { ...obj };
  for (const campo of CAMPOS_CIFRADOS) delete c[campo];
  delete c.save; delete c.toJSON; delete c.getKey; delete c.setKey; delete c.estaCompleta; delete c.resumenKeys;
  return c;
}

module.exports = {
  ...coleccion,
  DEFAULTS: {
    servicios: 'turnos y reservas',
    precioTurno: 1000,
    horasCancelacion: 24,
    tipoNegocio: 'turnos',
    checkInHora: '14:00',
    checkOutHora: '10:00',
    minimaEstadia: 1,
    modoPausa: false,
    diasBloqueados: [],
    chatsIgnorados: [],
    serviciosList: [],
    unidadesAlojamiento: [],
    catalogo: [],
    activarResenas: true,
    activarReengagement: true,
    horariosAtencion: {
      lunes: { activo: true, inicio: '09:00', fin: '18:00' },
      martes: { activo: true, inicio: '09:00', fin: '18:00' },
      miercoles: { activo: true, inicio: '09:00', fin: '18:00' },
      jueves: { activo: true, inicio: '09:00', fin: '18:00' },
      viernes: { activo: true, inicio: '09:00', fin: '18:00' },
      sabado: { activo: true, inicio: '09:00', fin: '13:00' },
      domingo: { activo: false, inicio: '09:00', fin: '18:00' },
    },
  },
  limpiarParaJSON,
};
