// main/esm-compat.js
// @whiskeysockets/baileys 6.7.x es un módulo ES ("type": "module"). Node 22
// (donde se probó el bot-engine) permite require() de módulos ES, pero
// Electron 33 trae Node 20, que no. akira.bot.js hace
// `require('@whiskeysockets/baileys')` síncrono al cargarse y no se toca:
// acá se importa Baileys con import() dinámico ANTES de cargar el
// bot-engine, y se intercepta ese require para devolver el módulo ya cargado.
//
// De paso, el módulo que recibe akira.bot.js trae el guardado de sesión
// ATÓMICO (slots/atomic-auth.js) en lugar del useMultiFileAuthState oficial:
// así un corte de luz o un disco lleno no corrompen la sesión de WhatsApp.
'use strict';

const Module = require('module');
const { crearUseAtomicMultiFileAuthState } = require('./slots/atomic-auth');

let baileys = null;
let hookInstalado = false;

// El bot de la plataforma le pregunta a mongoose si la base está conectada
// (connection.readyState === 1) antes de leer y guardar la memoria de cada
// cliente. En escritorio no hay mongoose: la base es SQLite local, que está
// siempre disponible, así que se responde "conectada". Sin esto el bot se
// caía al recibir el primer mensaje y nunca guardaba el historial.
const mongooseLocal = { connection: { readyState: 1 } };

// El bot de la plataforma abre un servidor web propio (puerto 3100, en todas
// las interfaces) para un webhook de MercadoPago. En escritorio los avisos de
// pago llegan por el servidor de licencias, así que ese puerto sobra y
// dejaría una puerta abierta en la red local del cliente. Solo para el código
// del bot-engine, `app.listen` pasa a no abrir nada.
function expressSinPuerto(expressReal) {
  const envuelto = function () {
    const app = expressReal.apply(this, arguments);
    app.listen = () => ({ on() { return this; }, close() {} });
    return app;
  };
  return Object.assign(envuelto, expressReal);
}

async function preparar() {
  if (!baileys) {
    const original = await import('@whiskeysockets/baileys');
    const useAtomico = crearUseAtomicMultiFileAuthState({
      BufferJSON: original.BufferJSON,
      initAuthCreds: original.initAuthCreds,
      proto: original.proto,
    });
    // El namespace de un módulo ES es inmutable: se arma una copia plana.
    baileys = { ...original, useMultiFileAuthState: useAtomico };
  }

  if (!hookInstalado) {
    const cargarOriginal = Module._load;
    Module._load = function (request, parent, ...resto) {
      if (request === '@whiskeysockets/baileys') return baileys;
      if (request === 'mongoose') return mongooseLocal;
      const cargado = cargarOriginal.call(this, request, parent, ...resto);
      if (request === 'express' && (parent?.filename || '').split(require('path').sep).includes('bot-engine')) return expressSinPuerto(cargado);
      return cargado;
    };
    hookInstalado = true;
  }
}

module.exports = { preparar };
