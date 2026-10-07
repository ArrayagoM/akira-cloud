// services/uso.service.js — guarda y resume las estadísticas de uso por pantalla (ver lib/uso.js).
'use strict';

const uso = require('../lib/uso');

// Guarda lo que informó un equipo (idempotente: vuelve a pisar el mismo día). → cantidad de días guardados
async function guardarUso({ UsoDia, userId, deviceId, version, datos, ahora = new Date() }) {
  const dias = uso.sanearUso(datos, ahora);
  for (const d of dias) {
    await UsoDia.findOneAndUpdate({ deviceId, dia: d.dia }, { $set: { userId, deviceId, dia: d.dia, pantallas: d.pantallas, version: String(version || '').slice(0, 20), actualizadoEn: ahora } }, { upsert: true });
  }
  return dias.length;
}

// Para el panel del administrador: lo de los últimos N días
async function resumenAdmin({ UsoDia, Device, dias = 30, ahora = new Date() }) {
  const n = Math.min(120, Math.max(1, Math.floor(Number(dias)) || 30));
  const desde = new Date(ahora.getTime() - n * 24 * 3600e3).toISOString().slice(0, 10);
  const docs = (await UsoDia.find({ dia: { $gte: desde } }).lean());
  const equipos = Device ? await Device.find({ activo: true, revocado: false }).lean() : [];
  const versiones = {}; for (const d of equipos) { const v = d.version || 'sin dato'; versiones[v] = (versiones[v] || 0) + 1; }
  return { ...uso.resumir(docs, { dias: n }), equiposActivos: equipos.length, versiones };
}

module.exports = { guardarUso, resumenAdmin };
