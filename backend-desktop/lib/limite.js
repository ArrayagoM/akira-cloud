// lib/limite.js
// Limitador de intentos con contadores en la base (ver models/Limite.js). Atómico: dos pedidos a la vez no se saltean el tope.
//   const r = await consumir('reg:ip:1.2.3.4', { max: 5, ventanaMs: 3600e3 });   →  { ok, n, reintentarEnSeg }
// Si la base falla, deja pasar (mejor un intento de más que dejar a todos sin poder entrar) y lo avisa en el log.
'use strict';

const logger = require('../config/logger');

async function consumir(clave, { max, ventanaMs }, Modelo = require('../models/Limite'), ahora = Date.now()) {
  try {
    const ahoraD = new Date(ahora);
    let r = await Modelo.findOneAndUpdate({ _id: clave, expira: { $gt: ahoraD } }, { $inc: { n: 1 } }, { new: true });
    if (!r) {
      try { r = await Modelo.findOneAndUpdate({ _id: clave }, { $set: { n: 1, expira: new Date(ahora + ventanaMs) } }, { upsert: true, new: true }); }
      catch (e) { if (e && e.code === 11000) r = await Modelo.findOneAndUpdate({ _id: clave }, { $inc: { n: 1 } }, { new: true }); else throw e; }
    }
    return { ok: r.n <= max, n: r.n, reintentarEnSeg: Math.max(1, Math.ceil((new Date(r.expira).getTime() - ahora) / 1000)) };
  } catch (e) {
    logger.warn('[Limite] no se pudo contar ' + clave + ': ' + e.message);
    return { ok: true, n: 0, reintentarEnSeg: 0, falloBase: true };
  }
}

// Varios topes a la vez (por IP y por email, por ejemplo): se corta en el primero que se pasa.
async function consumirTodos(lista, Modelo, ahora) {
  for (const [clave, opciones] of lista) {
    const r = await consumir(clave, opciones, Modelo, ahora);
    if (!r.ok) return { ...r, clave };
  }
  return { ok: true };
}

const mensajeEspera = (seg) => `Demasiados intentos. Probá de nuevo en ${seg >= 120 ? Math.ceil(seg / 60) + ' minutos' : seg + ' segundos'}.`;

module.exports = { consumir, consumirTodos, mensajeEspera };
