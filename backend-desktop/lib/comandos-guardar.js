// lib/comandos-guardar.js
// Guarda la lista de órdenes del celular (Device.comandos) SIN pisar lo que otro escribió en el mismo instante.
// Antes, el celular (al mandar una orden) y la PC (cada vez que consulta) leían el equipo entero, cambiaban la
// lista y la guardaban entera: el último en guardar borraba lo del otro. Ahora el guardado es condicional por
// versión (comandosV): si alguien cambió la lista mientras tanto, se vuelve a leer y se reintenta.
// Si la lista no cambió, no se toca (la consulta normal de la PC solo actualiza el latido).
'use strict';

const REINTENTOS = 4;

// Equipos viejos no tienen comandosV: cuenta como versión 0.
const filtroVersion = (v) => (v > 0 ? v : { $in: [0, null] });

/**
 * @param Device  modelo (o simulado) con findOne y updateOne
 * @param filtro  cómo buscar el equipo
 * @param mutar   (device) => resultado. Cambia device.comandos en memoria (lógica pura de comandos.js). Puede lanzar
 *                (no se guarda nada) o devolver { omitir: true } para no guardar nada.
 * @param extras  (device) => campos a guardar junto con la lista (ej. latido). Siempre se guardan, aunque la lista no cambie.
 * @returns { device, resultado, guardado }  device === null si no existe.
 */
async function mutarComandos(Device, filtro, mutar, extras = () => ({})) {
  for (let intento = 0; intento < REINTENTOS; intento++) {
    const device = await Device.findOne(filtro);
    if (!device) return { device: null, resultado: null, guardado: false };
    const v = Number(device.comandosV) || 0;
    const antes = JSON.stringify(device.comandos || []);
    const resultado = mutar(device);
    if (resultado && resultado.omitir === true) return { device, resultado, guardado: false };
    const campos = extras(device) || {};
    const cambio = JSON.stringify(device.comandos || []) !== antes;
    if (!cambio) {
      // Nada que pisar: solo los campos sueltos (latido, control remoto), sin tocar la lista ni la versión.
      if (Object.keys(campos).length) await Device.updateOne({ _id: device._id }, { $set: campos });
      return { device, resultado, guardado: true };
    }
    const r = await Device.updateOne(
      { _id: device._id, comandosV: filtroVersion(v) },
      { $set: { ...campos, comandos: Array.from(device.comandos), comandosV: v + 1 } },
    );
    if ((r && r.matchedCount) > 0) return { device, resultado, guardado: true };
    // otro escribió la lista entre la lectura y el guardado: se vuelve a leer y se reintenta
  }
  throw Object.assign(new Error('El servidor está ocupado, probá de nuevo en un momento.'), { status: 503 });
}

module.exports = { mutarComandos, REINTENTOS };
