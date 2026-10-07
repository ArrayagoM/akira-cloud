// lib/comandos.js
// Comandos mínimos que el celular le manda a la PC (pausar/reanudar el bot, modo vacaciones) y el estado
// resumido que ve la app. Lógica pura. Un comando es una orden con vencimiento: si la PC no la retira a
// tiempo, vence y NO se ejecuta después (para que "pausar" no se aplique horas más tarde por sorpresa).
'use strict';

const crypto = require('crypto');
const { evaluarEstadoBot } = require('./estado-bot');

const TIPOS = ['bot-pausar', 'bot-reanudar', 'vacaciones-on', 'vacaciones-off'];
const VENCE_MS = 10 * 60 * 1000;      // la PC tiene 10 min para retirarlo
const MAX_PENDIENTES = 5;
const MAX_HISTORIAL = 20;
const PC_SIN_SENAL_MS = 40 * 60 * 1000; // el latido normal es cada 15 min: 40 min sin señal = algo pasa

const ES_PENDIENTE = (c, ahora) => c.estado === 'pendiente' && new Date(c.venceEn).getTime() > ahora.getTime();

// Marca como vencidos los que ya pasaron su hora, y recorta el historial.
function limpiar(device, ahora = new Date()) {
  const lista = (device.comandos || []).map((c) => (c.estado === 'pendiente' && new Date(c.venceEn).getTime() <= ahora.getTime() ? { ...c, estado: 'vencido' } : c));
  device.comandos = lista.slice(-MAX_HISTORIAL);
  return device.comandos;
}

function encolar(device, tipo, ahora = new Date()) {
  if (!TIPOS.includes(tipo)) throw Object.assign(new Error('Comando no permitido'), { status: 400 });
  if (device.celularActivo !== true) throw Object.assign(new Error('El control desde el celular está desactivado en la PC. Activalo en Akira → Inicio.'), { status: 409, codigo: 'CELULAR_DESACTIVADO' });
  limpiar(device, ahora);
  const pend = device.comandos.filter((c) => ES_PENDIENTE(c, ahora));
  // Un comando del mismo tipo ya pendiente no se duplica; uno opuesto lo reemplaza (el último gana).
  const opuesto = { 'bot-pausar': 'bot-reanudar', 'bot-reanudar': 'bot-pausar', 'vacaciones-on': 'vacaciones-off', 'vacaciones-off': 'vacaciones-on' }[tipo];
  const igual = pend.find((c) => c.tipo === tipo);
  if (igual) return igual;
  device.comandos = device.comandos.map((c) => (ES_PENDIENTE(c, ahora) && c.tipo === opuesto ? { ...c, estado: 'cancelado' } : c));
  if (device.comandos.filter((c) => ES_PENDIENTE(c, ahora)).length >= MAX_PENDIENTES) throw Object.assign(new Error('Hay demasiados comandos pendientes. Esperá un momento.'), { status: 429 });
  const nuevo = { id: crypto.randomBytes(8).toString('hex'), tipo, estado: 'pendiente', creadoEn: ahora.toISOString(), venceEn: new Date(ahora.getTime() + VENCE_MS).toISOString() };
  device.comandos = [...device.comandos, nuevo].slice(-MAX_HISTORIAL);
  return nuevo;
}

function pendientes(device, ahora = new Date()) {
  limpiar(device, ahora);
  return device.comandos.filter((c) => ES_PENDIENTE(c, ahora)).map(({ id, tipo, venceEn }) => ({ id, tipo, venceEn }));
}

// hechos: [{ id, ok, detalle? }] que informa la PC después de ejecutar.
function confirmar(device, hechos = [], ahora = new Date()) {
  if (!Array.isArray(hechos)) return;
  const mapa = new Map(hechos.filter((h) => h && typeof h.id === 'string').slice(0, 20).map((h) => [h.id, h]));
  device.comandos = (device.comandos || []).map((c) => {
    const h = mapa.get(c.id);
    if (!h || c.estado !== 'pendiente') return c;
    return { ...c, estado: h.ok === true ? 'hecho' : 'fallo', hechoEn: ahora.toISOString(), detalle: String(h.detalle || '').slice(0, 120) };
  });
}

// Estado que ve la app móvil para una PC.
function resumirEstado(device, ahora = new Date()) {
  const ult = device.ultimoHeartbeat ? new Date(device.ultimoHeartbeat) : null;
  const online = !!ult && ahora.getTime() - ult.getTime() <= PC_SIN_SENAL_MS;
  const est = device.estadoBot || null;
  let bot = 'desconocido'; let motivo = null;
  if (!online) bot = 'pc-sin-senal';
  else if (est) {
    const ev = evaluarEstadoBot(est, { minutosGracia: 3 });
    const deseados = (est.slots || []).filter((s) => s.deseado);
    if (est.pausado) bot = 'pausado-licencia';
    else if (ev.caido) { bot = 'caido'; motivo = ev.motivo; }
    else if (deseados.length && deseados.every((s) => s.conectado)) bot = 'conectado';
    else if (!deseados.length) bot = 'detenido';
    else bot = 'conectando';
  }
  return {
    deviceId: device.deviceId, nombre: device.nombre || 'Mi PC', version: device.version || '',
    online, ultimoHeartbeat: ult ? ult.toISOString() : null,
    bot, motivo, vacaciones: est?.vacaciones === true,
    cuentas: (est?.slots || []).map((s) => ({ slot: s.slot, conectado: s.conectado, deseado: s.deseado })),
    resumen: device.resumen || null, resumenEn: device.resumenEn ? new Date(device.resumenEn).toISOString() : null,
    controlRemoto: device.celularActivo === true,
    comandos: (device.comandos || []).slice(-5).map(({ id, tipo, estado, creadoEn }) => ({ id, tipo, estado, creadoEn })),
  };
}

module.exports = { TIPOS, VENCE_MS, PC_SIN_SENAL_MS, encolar, pendientes, confirmar, limpiar, resumirEstado };
