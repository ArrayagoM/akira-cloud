// services/bot/silencio.js
// Reglas del "chat silenciado" (el dueño pausa un chat para atenderlo él y el bot no debe contestar).
// Funciones puras, probadas en tests/silencio.test.js. Antes estas reglas estaban repartidas dentro de akira.bot.js y fallaban así:
//  · un cliente que escribía la palabra "akira" salteaba el silencio y el bot le contestaba igual;
//  · los audios se transcribían y se contestaban ("no pude entender el audio") ANTES de mirar si el chat estaba silenciado;
//  · la orden de silenciar solo llegaba a la cuenta de WhatsApp 0: con dos cuentas, el chat de la segunda seguía respondiendo.
'use strict';

// ¿El bot debe quedarse callado ante este cliente? Solo un `true` de verdad silencia (no "true", ni 1).
const debeCallar = (usuario) => !!usuario && usuario.silenciado === true;

// Mandar un evento a TODAS las cuentas de WhatsApp activas (no solo a la 0). → cantidad de cuentas a las que llegó.
function emitirATodas(instancias, evento, payload) {
  let n = 0;
  for (const bot of instancias.values()) {
    try { bot.emit(evento, payload); n++; } catch { /* una cuenta con problemas no frena a las otras */ }
  }
  return n;
}

// Dos tipos de silencio:
//  · MANUAL (el dueño pausó el chat desde Clientes): vale hasta que él lo reactive. Sobrevive a reiniciar la app y no se levanta solo
//    cuando el dueño le escribe al cliente (justamente pausó para atenderlo él).
//  · AUTOMÁTICO (el bot derivó al cliente a una persona): es temporal. Se levanta a los 30 min, al responder el dueño o al reiniciar la app.
// La marca `silenciadoManual` distingue uno de otro. Un registro viejo sin marca cuenta como automático (comportamiento de siempre).
const esManual = (u) => !!u && u.silenciado === true && u.silenciadoManual === true;
// Al arrancar el bot: ¿este registro guardado conserva su silencio?
const debeConservarAlArrancar = esManual;
// ¿Se puede levantar el silencio solo (el dueño respondió, pasaron 30 min)?
const puedeAutoReactivar = (u) => !esManual(u);

module.exports = { debeCallar, emitirATodas, esManual, debeConservarAlArrancar, puedeAutoReactivar };
