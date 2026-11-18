// tests/equipos-admin.test.js — sección "Equipos" del panel admin, solo formato (frontend/src/lib/equiposAdmin.js)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', f)).href);

(async () => {
  console.log('\n[equipos-admin] Tests:');
  const { tiempoRelativo, fechaLarga, etiquetaCanal, etiquetaEstadoBot, textoErrorLicencia, equiposDeRespuesta } = await lib('equiposAdmin.js');
  const AHORA = Date.UTC(2026, 10, 17, 12, 0, 0); const antes = (ms) => new Date(AHORA - ms).toISOString();
  const MIN = 60000; const H = 60 * MIN; const D = 24 * H;

  assert(tiempoRelativo(antes(10000), AHORA) === 'hace instantes', 'menos de un minuto: "hace instantes"');
  assert(tiempoRelativo(antes(5 * MIN + 1), AHORA) === 'hace 5 min', 'minutos');
  assert(tiempoRelativo(antes(3 * H + MIN), AHORA) === 'hace 3 h', 'horas');
  assert(tiempoRelativo(antes(D + H), AHORA) === 'hace 1 día' && tiempoRelativo(antes(4 * D), AHORA) === 'hace 4 días', 'días (singular y plural)');
  assert(tiempoRelativo(null, AHORA) === 'nunca' && tiempoRelativo('basura', AHORA) === 'nunca' && tiempoRelativo(undefined, AHORA) === 'nunca', 'sin fecha válida: "nunca"');
  assert(/futuro/.test(tiempoRelativo(new Date(AHORA + 3 * H).toISOString(), AHORA)), 'fecha futura: no inventa un "hace -3 h"');
  assert(fechaLarga(null) === '—' && fechaLarga('x') === '—' && /2026|26/.test(fechaLarga(antes(0))), 'fecha larga, con guion si falta');

  assert(etiquetaCanal('store') === 'Microsoft Store' && etiquetaCanal('exe') === 'Instalador (.exe)', 'canal: store y exe (los valores reales de la app)');
  assert(etiquetaCanal('') === 'Sin dato' && etiquetaCanal(undefined) === 'Sin dato' && etiquetaCanal('beta') === 'beta', 'canal vacío o desconocido');
  assert(etiquetaEstadoBot('conectado') === 'Conectado' && etiquetaEstadoBot('pc-sin-senal') === 'PC sin señal', 'estado del bot conocido');
  // forma real de Device.estadoBot (la que manda la PC): slots, pausado y vacaciones
  assert(etiquetaEstadoBot({ slots: [{ slot: 1, conectado: true, deseado: true }], pausado: false, vacaciones: false }) === 'Conectado', 'forma real: una cuenta conectada');
  assert(etiquetaEstadoBot({ slots: [{ slot: 1, conectado: true, deseado: true }, { slot: 2, conectado: false, deseado: true }] }) === 'Conectado en 1 de 2 cuentas', 'forma real: conectado en parte');
  assert(etiquetaEstadoBot({ slots: [{ slot: 1, conectado: false, deseado: true }] }) === 'Sin conectar' && etiquetaEstadoBot({ slots: [] }) === 'Detenido', 'forma real: sin conectar y detenido');
  assert(etiquetaEstadoBot({ slots: [{ slot: 1, conectado: true, deseado: true }], pausado: true }) === 'Pausado por licencia' && /vacaciones/.test(etiquetaEstadoBot({ slots: [{ slot: 1, conectado: true, deseado: true }], vacaciones: true })), 'forma real: pausado por licencia y modo vacaciones');
  assert(etiquetaEstadoBot('raro') === 'raro' && etiquetaEstadoBot(null) === 'Sin información' && etiquetaEstadoBot({ estado: 'caido' }) === 'Caído', 'estado desconocido, vacío u objeto');

  assert(textoErrorLicencia(null, AHORA) === null && textoErrorLicencia({}, AHORA) === null, 'sin error: null');
  assert(textoErrorLicencia({ motivo: 'suscripcion_vencida', status: 403, en: antes(2 * H) }, AHORA) === 'suscripcion_vencida · HTTP 403 (hace 2 h)', 'error de licencia con motivo, status y cuándo');
  assert(textoErrorLicencia({ motivo: 'x' }, AHORA) === 'x (nunca)', 'error sin fecha');

  assert(Array.isArray(equiposDeRespuesta({ devices: [] })) && equiposDeRespuesta({ devices: [{ id: 1 }] }).length === 1, 'respuesta con el formato del contrato');
  assert(equiposDeRespuesta(null) === null && equiposDeRespuesta({}) === null && equiposDeRespuesta('<html>') === null && equiposDeRespuesta({ devices: 'x' }) === null, 'respuesta rara (backend viejo, HTML): null, sin romper');
  console.log('✅ equipos-admin: OK');
})().catch((e) => { console.error(e.message); process.exit(1); });
