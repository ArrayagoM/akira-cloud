// lib/mirando.js
// "Tiempo real mientras mirás": la PC manda el resumen apenas algo cambia, pero solo con ritmo rápido si alguien lo está mirando
// (la web o el celular consultan el estado y dejan la marca `vistoEn`). Sin nadie mirando, la PC avisa con calma y se ahorran escrituras.
'use strict';

const MIRANDO_MS = 2 * 60 * 1000;     // alguien consultó hace menos de esto → se considera que está mirando
const MARCA_CADA_MS = 30 * 1000;      // no reescribir la marca más seguido que esto
const ENTRE_RESUMENES_MS = 4 * 1000;  // el servidor no acepta dos resúmenes de la misma PC con menos de esto entre sí

const estaMirando = (device, ahora = new Date()) => !!device?.vistoEn && ahora.getTime() - new Date(device.vistoEn).getTime() <= MIRANDO_MS;
const puedeActualizarResumen = (device, ahora = new Date()) => !device?.resumenEn || ahora.getTime() - new Date(device.resumenEn).getTime() >= ENTRE_RESUMENES_MS;

// Marca que el usuario está mirando sus PCs (una sola escritura cada 30 s como máximo; nunca debe romper la consulta).
async function marcarMirando(Device, userId, ahora = new Date()) {
  try {
    await Device.updateMany(
      { userId, activo: true, revocado: false, $or: [{ vistoEn: null }, { vistoEn: { $exists: false } }, { vistoEn: { $lt: new Date(ahora.getTime() - MARCA_CADA_MS) } }] },
      { $set: { vistoEn: ahora } },
    );
  } catch { /* la marca es un detalle: si falla, la consulta sigue */ }
}

module.exports = { MIRANDO_MS, MARCA_CADA_MS, ENTRE_RESUMENES_MS, estaMirando, puedeActualizarResumen, marcarMirando };
