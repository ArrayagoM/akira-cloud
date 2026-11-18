// lib/version-app.js
// Datos opcionales que la app de escritorio suma al latido (y a las cabeceras) para saber qué versión corre cada equipo, por qué canal se
// instaló y cuál fue el último error de licencia. Todo es opcional: sin estos datos, o con basura, el latido anda igual que antes.
// También lee la versión mínima / recomendada de las variables de entorno (solo informativas: NO bloquean a nadie).
'use strict';

const { sanearVersion } = require('./resumen-negocio');

const CANALES = ['store', 'exe'];

// Cabeceras x-akira-version / x-akira-canal → { version, canal } (null si faltan o no tienen el formato esperado).
function leerCabeceras(headers) {
  const h = headers && typeof headers === 'object' ? headers : {};
  const v = h['x-akira-version'];
  const c = h['x-akira-canal'];
  const canal = typeof c === 'string' ? c.trim().toLowerCase() : '';
  return { version: sanearVersion(typeof v === 'string' ? v : ''), canal: CANALES.includes(canal) ? canal : null };
}

// ultimoError: { motivo, status, en } → { motivo, status, en } limpio, o null si viene mal formado (se ignora sin error).
//   motivo: texto de hasta 40 caracteres [a-z_] (se pasa a minúsculas y se descarta lo demás)
//   status: entero 0-599, o null
//   en: fecha válida (ISO)
function sanearUltimoError(raw, ahora = Date.now()) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.motivo !== 'string') return null;
    const motivo = raw.motivo.toLowerCase().replace(/[^a-z_]/g, '').slice(0, 40);
    if (!motivo) return null;
    let status = null;
    if (raw.status !== null && raw.status !== undefined) {
      if (typeof raw.status !== 'number' || !Number.isInteger(raw.status) || raw.status < 0 || raw.status > 599) return null;
      status = raw.status;
    }
    if (typeof raw.en !== 'string' || raw.en.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(raw.en)) return null;
    const en = new Date(raw.en);
    if (Number.isNaN(en.getTime())) return null;
    return { motivo, status, en, recibidoEn: new Date(ahora) };
  } catch { return null; }
}

// DESKTOP_VERSION_MINIMA / DESKTOP_VERSION_RECOMENDADA → texto x.y.z o null (no definida o mal escrita).
function versionesDeEntorno(env = process.env) {
  const leer = (k) => sanearVersion(typeof env[k] === 'string' ? env[k] : '');
  return { versionMinima: leer('DESKTOP_VERSION_MINIMA'), versionRecomendada: leer('DESKTOP_VERSION_RECOMENDADA') };
}

module.exports = { leerCabeceras, sanearUltimoError, versionesDeEntorno, CANALES };
