// tests/estado-bot.test.js — el bot se cae → email al dueño (un solo aviso por incidente) → vuelve → email "volvió".
// Es el canal que no depende del propio WhatsApp.
'use strict';

process.env.FRONTEND_URL = 'https://akiracloud.lat';
const { sanearEstadoBot, evaluarEstadoBot } = require('../lib/estado-bot');
const { procesarEstadoBot } = require('../services/alertas-estado.service');
const plantillas = require('../services/email.alertas');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const slot = (o) => ({ slot: 0, deseado: true, activo: true, conectado: true, requiereQR: false, desdeMs: 0, ...o });

(async () => {
  console.log('\n[estado-bot] Tests:');

  // ── saneamiento ──
  assert(sanearEstadoBot(null) === null && sanearEstadoBot({}) === null && sanearEstadoBot({ slots: 'x' }) === null, 'basura → null');
  const sucio = sanearEstadoBot({ slots: [{ slot: 0, deseado: true, conectado: false, desdeMs: 90000, nombre: 'Ana López', telefono: '2241497226' }, { slot: 99 }, null, { slot: '1', conectado: 'true' }], pausado: 1, extra: 'x' });
  assert(sucio.slots.length === 2 && !JSON.stringify(sucio).match(/Ana|2241|extra/), 'descarta campos desconocidos (nunca viajan nombres ni teléfonos) y slots inválidos');
  assert(sucio.slots[1].conectado === false && sucio.pausado === false, 'solo acepta booleanos de verdad (no "true" ni 1)');
  assert(sanearEstadoBot({ slots: [{ slot: 0, desdeMs: 1e15 }] }).slots[0].desdeMs === 7 * 24 * 3600 * 1000, 'limita el tiempo desconectado a 7 días');
  assert(sanearEstadoBot({ slots: Array.from({ length: 50 }, (_, i) => ({ slot: i % 10 })) }).slots.length === 10, 'máximo 10 cuentas');

  // ── evaluación ──
  const ev = (slots, op) => evaluarEstadoBot({ slots, pausado: false }, op);
  assert(!ev([slot()]).caido, 'conectado → sin caída');
  assert(!ev([slot({ conectado: false, desdeMs: 60_000 })]).caido, 'desconectado hace 1 min → todavía no (suele reconectarse solo)');
  assert(ev([slot({ conectado: false, desdeMs: 4 * 60_000 })]).motivo === 'desconexion', 'desconectado más de 3 min → caída');
  assert(ev([slot({ conectado: false, desdeMs: 4 * 60_000 })], { minutosGracia: 10 }).caido === false, 'la gracia es configurable');
  assert(ev([slot({ conectado: false, requiereQR: true, desdeMs: 1000 })]).motivo === 'sesion', 'si pide QR nuevo avisa ya (hay que intervenir)');
  assert(!ev([slot({ deseado: false, activo: false, conectado: false, desdeMs: 9e6 })]).caido, 'si el usuario detuvo el bot a propósito → no es una caída');
  assert(!evaluarEstadoBot({ slots: [slot({ conectado: false, desdeMs: 9e6 })], pausado: true }).caido, 'pausado a propósito → no es una caída');
  assert(ev([slot(), slot({ slot: 1, conectado: false, desdeMs: 9e6 })]).slots.join() === '1', 'identifica qué cuenta se cayó');

  // ── flujo completo con emails ──
  const enviados = [];
  const enviar = async (m) => { enviados.push(m); return true; };
  const user = { _id: 'u1', email: 'dueno@mail.com', nombre: 'Juan', alertas: undefined };
  const device = { nombre: 'PC de la barbería', alertaBot: undefined };
  const t0 = new Date('2026-10-08T15:00:00Z');
  const caido = { slots: [slot({ conectado: false, desdeMs: 5 * 60_000 })] };
  const sano = { slots: [slot()] };

  let r = await procesarEstadoBot({ user, device, estadoBot: sano, ahora: t0, enviar });
  assert(r.accion === null && enviados.length === 0, 'todo bien → no manda nada');
  r = await procesarEstadoBot({ user, device, estadoBot: caido, ahora: t0, enviar });
  assert(r.accion === 'caida' && enviados.length === 1 && enviados[0].to === 'dueno@mail.com', 'se cae → 1 email al dueño');
  assert(/no está atendiendo|dejó de atender/i.test(enviados[0].subject + enviados[0].html) && enviados[0].html.includes('PC de la barbería'), 'el email explica qué pasó y en qué equipo');
  assert(device.alertaBot.abierta === true && device.estadoBot.slots.length === 1, 'queda el incidente abierto y el estado guardado');
  r = await procesarEstadoBot({ user, device, estadoBot: { slots: [slot({ conectado: false, desdeMs: 20 * 60_000 })] }, ahora: new Date(t0.getTime() + 15 * 60_000), enviar });
  assert(r.accion === null && enviados.length === 1, 'sigue caído en las siguientes señales → NO repite el aviso');
  r = await procesarEstadoBot({ user, device, estadoBot: sano, ahora: new Date(t0.getTime() + 30 * 60_000), enviar });
  assert(r.accion === 'recuperado' && enviados.length === 2 && /volvió/i.test(enviados[1].subject), 'vuelve → email "volvió"');
  assert(device.alertaBot.abierta === false, 'se cierra el incidente');
  assert(/30 min|(\d+) min/.test(enviados[1].html), 'cuenta cuánto estuvo caído');

  // ── casos de borde ──
  const dev2 = { nombre: 'PC', alertaBot: undefined }; const env2 = [];
  await procesarEstadoBot({ user, device: dev2, estadoBot: caido, ahora: t0, enviar: async (m) => { env2.push(m); return true; } });
  await procesarEstadoBot({ user, device: dev2, estadoBot: { slots: [slot({ deseado: false, activo: false, conectado: false })] }, ahora: t0, enviar: async (m) => { env2.push(m); return true; } });
  assert(env2.length === 1 && dev2.alertaBot.abierta === false, 'si el usuario lo detiene a propósito, el incidente se cierra SIN mandar un falso "volvió"');

  const dev3 = { nombre: 'PC' }; const env3 = [];
  const sinEmail = { ...user, alertas: { email: false } };
  r = await procesarEstadoBot({ user: sinEmail, device: dev3, estadoBot: caido, ahora: t0, enviar: async (m) => { env3.push(m); return true; } });
  assert(env3.length === 0 && dev3.alertaBot.abierta === true, 'con las alertas por email desactivadas no manda nada (pero registra el incidente)');
  r = await procesarEstadoBot({ user: sinEmail, device: dev3, estadoBot: sano, ahora: t0, enviar: async (m) => { env3.push(m); return true; } });
  assert(env3.length === 0, 'tampoco manda el "volvió"');

  const dev4 = { nombre: 'PC' }; let intentos = 0;
  await procesarEstadoBot({ user, device: dev4, estadoBot: caido, ahora: t0, enviar: async () => { intentos++; return false; } });
  assert(dev4.alertaBot.abierta === true && dev4.alertaBot.avisadoEn === null, 'si el email falla queda registrado que NO se avisó');
  const env4 = [];
  await procesarEstadoBot({ user, device: dev4, estadoBot: sano, ahora: t0, enviar: async (m) => { env4.push(m); return true; } });
  assert(env4.length === 0, 'y entonces tampoco manda un "volvió" sin sentido');

  assert(await procesarEstadoBot({ user, device: {}, estadoBot: 'basura', ahora: t0, enviar }) === null, 'un estado inválido se ignora sin romper');

  // ── plantillas ──
  const h = plantillas.htmlCaida({ nombre: '<b>X</b>', equipo: '<img src=x>', motivo: 'sesion', slots: [0], desdeEn: t0 });
  assert(!h.includes('<b>X</b>') && !h.includes('<img src=x>'), 'las plantillas escapan el HTML (nada inyectable)');
  assert(/QR/.test(h) && /Dispositivos vinculados/.test(h), 'si pide QR, explica cómo volver a vincular');
  assert(/internet/.test(plantillas.htmlCaida({ nombre: 'A', equipo: 'PC', motivo: 'desconexion', slots: [0], desdeEn: t0 })), 'si es desconexión, indica revisar internet y que Akira esté abierta');

  console.log('\n✅ estado-bot OK\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
