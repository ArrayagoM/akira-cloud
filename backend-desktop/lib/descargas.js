// lib/descargas.js
// Contador de descargas del instalador: reglas de conteo y resumen para el panel de administración (puro, sin base de datos).
// Los días se cuentan en hora de Argentina (UTC-3).
'use strict';

const crypto = require('crypto');

const AR_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const dia = (f) => new Date(new Date(f).getTime() - AR_MS).toISOString().slice(0, 10);
const PLATAFORMAS = ['windows', 'mac-arm64', 'mac-x64', 'android'];
const NOMBRES = { windows: 'Windows', 'mac-arm64': 'Mac (chip Apple)', 'mac-x64': 'Mac (Intel)', android: 'Android' };

// Robots, buscadores y previsualizadores de enlaces (WhatsApp, Telegram, Facebook, Slack…) no cuentan como descarga.
const ROBOT = /bot|crawl|spider|slurp|preview|fetch|monitor|uptime|curl|wget|python-requests|axios|node-fetch|go-http|java\/|facebookexternalhit|whatsapp|telegram|discord|slack|headless/i;
const esRobot = (userAgent, metodo = 'GET') => String(metodo).toUpperCase() !== 'GET' || !String(userAgent || '').trim() || ROBOT.test(String(userAgent));

// Origen del enlace (?r=email-d): solo letras, números y guiones, hasta 30 caracteres.
const limpiarOrigen = (r) => { const s = String(r ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30); return s || 'directo'; };

// Huella del visitante: no se puede volver a la IP ni al navegador a partir de ella.
const huella = (ip, userAgent, clave) => crypto.createHmac('sha256', String(clave || 'akira')).update(`${ip || ''}|${userAgent || ''}`).digest('hex').slice(0, 16);

// Mismo visitante y misma plataforma dentro de esta ventana = un solo clic contado (doble clic, recarga, reintento).
const VENTANA_REPETIDO_MS = 10 * 60 * 1000;

// descargas: [{ plataforma, origen, visitante, fecha }]; usuarios/equipos: contadores del embudo.
function resumir({ descargas = [], ahora = new Date(), dias = 30, embudo = {} }) {
  const desde = new Date(new Date(ahora).getTime() - dias * DIA_MS);
  const enPeriodo = descargas.filter((d) => new Date(d.fecha) >= desde);
  const porPlataforma = Object.fromEntries(PLATAFORMAS.map((p) => [p, { plataforma: p, nombre: NOMBRES[p], total: 0, unicos: 0 }]));
  const unicos = { todas: new Set() }; const origenes = new Map(); const porDia = new Map();
  for (const d of enPeriodo) {
    const x = porPlataforma[d.plataforma]; if (!x) continue;
    x.total++; const k = `${d.plataforma}|${d.visitante}`;
    if (!unicos[d.plataforma]) unicos[d.plataforma] = new Set();
    unicos[d.plataforma].add(d.visitante); unicos.todas.add(k);
    const o = origenes.get(d.origen || 'directo') || { origen: d.origen || 'directo', total: 0 }; o.total++; origenes.set(o.origen, o);
    const dd = dia(d.fecha); porDia.set(dd, (porDia.get(dd) || 0) + 1);
  }
  for (const p of PLATAFORMAS) porPlataforma[p].unicos = (unicos[p] || new Set()).size;
  const serie = []; for (let i = dias - 1; i >= 0; i--) { const dd = dia(new Date(new Date(ahora).getTime() - i * DIA_MS)); serie.push({ dia: dd, descargas: porDia.get(dd) || 0 }); }
  const hoy = dia(ahora);
  const historico = descargas.length;
  return {
    dias, desde: desde.toISOString(),
    total: enPeriodo.length, unicas: unicos.todas.size, hoy: porDia.get(hoy) || 0, historico,
    primera: descargas.length ? descargas.reduce((m, d) => (new Date(d.fecha) < m ? new Date(d.fecha) : m), new Date(descargas[0].fecha)).toISOString() : null,
    porPlataforma: PLATAFORMAS.map((p) => porPlataforma[p]),
    porOrigen: [...origenes.values()].sort((a, b) => b.total - a.total),
    porDia: serie,
    // Registrados → descargaron (Windows) → instalaron e iniciaron sesión (equipo registrado)
    embudo: { usuarios: embudo.usuarios || 0, descargasWindows: porPlataforma.windows.unicos, usuariosConEquipo: embudo.usuariosConEquipo || 0, equipos: embudo.equipos || 0 },
  };
}

module.exports = { esRobot, limpiarOrigen, huella, resumir, VENTANA_REPETIDO_MS, PLATAFORMAS, NOMBRES };
