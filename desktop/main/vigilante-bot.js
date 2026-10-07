// main/vigilante-bot.js
// Vigila las caídas del bot en esta PC:
//  · pasada la gracia (el bot suele reconectarse solo en segundos) o al instante si WhatsApp pide un QR nuevo,
//    muestra un aviso de Windows y pide una señal de vida inmediata a la nube — que es la que manda el email
//    de alerta (el propio WhatsApp no sirve para avisar que WhatsApp se cayó);
//  · cuando vuelve, avisa y cierra el incidente en la nube.
// Todo inyectable (timers, notificaciones, señal de vida) para poder probarlo sin Electron.
'use strict';

const GRACIA_MS = 185 * 1000; // un poco más que los 3 min que espera el servidor para considerarlo caída

function crearVigilante({ estaCaido, pedirLatido, notificar, graciaMs = GRACIA_MS, setT = setTimeout, clearT = clearTimeout }) {
  const pendientes = new Map(); // slot → timer
  const avisados = new Set();   // slots de los que ya se avisó la caída

  const cuenta = (slot) => (slot > 0 ? ` (cuenta ${slot + 1})` : '');
  const limpiar = (slot) => { if (pendientes.has(slot)) { clearT(pendientes.get(slot)); pendientes.delete(slot); } };

  function avisarCaida(slot, requiereQR) {
    avisados.add(slot);
    notificar(
      'Akira dejó de atender' + cuenta(slot),
      requiereQR
        ? 'WhatsApp pidió vincular el dispositivo de nuevo. Abrí Akira y escaneá el código QR.'
        : 'El bot se desconectó de WhatsApp y no pudo volver solo. Revisá que la PC tenga internet y abrí Akira.',
    );
    pedirLatido();
  }

  function alCambiar({ slot = 0, estado, requiereQR = false }) {
    if (estado === 'desconectado') {
      if (requiereQR) { limpiar(slot); if (!avisados.has(slot)) avisarCaida(slot, true); return; }
      // Si ya hay una espera en marcha (o ya se avisó) NO se reinicia: los reintentos fallidos de un corte
      // largo generan varios "desconectado" y el aviso no debe postergarse indefinidamente.
      if (avisados.has(slot) || pendientes.has(slot)) return;
      pendientes.set(slot, setT(() => { pendientes.delete(slot); if (estaCaido(slot)) avisarCaida(slot, false); }, graciaMs));
    } else if (estado === 'conectado') {
      limpiar(slot);
      if (avisados.has(slot)) { avisados.delete(slot); notificar('Akira volvió a atender' + cuenta(slot), 'Tu bot ya está conectado de nuevo. Conviene revisar los chats que llegaron mientras estuvo caído.'); }
      pedirLatido(); // cierra el incidente en la nube
    } else if (estado === 'detenido') { // lo detuvo el usuario a propósito: no es una caída
      limpiar(slot); avisados.delete(slot);
      pedirLatido();
    }
  }

  return { alCambiar, _pendientes: () => pendientes.size, _avisados: () => [...avisados] };
}

module.exports = { crearVigilante, GRACIA_MS };
