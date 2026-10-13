// tests/sesion-renovar.test.js — la sesión se renueva sola antes de vencer, y una sesión más vieja no pisa a la renovada.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const Module = require('module');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-sesion-'));

// licencia de mentira (la sesión se valida sin internet)
let usuarioDe = { _id: 'u1', email: 'a@b.com' };
const inyectar = (r, ex) => { const f = path.join(__dirname, '..', r); Module._cache[f] = { id: f, filename: f, loaded: true, exports: ex, children: [], paths: [] }; };
inyectar('main/license/license-client.js', { configurar() {}, request: async (ruta) => (ruta === '/api/auth/me' ? { user: usuarioDe } : {}), activar: async () => ({ plan: 'pro', vigente: true }), getEstado: () => ({ plan: 'pro', vigente: true }) });

const R = require('../main/license/renovacion');
const store = require('../main/license/session-store');
const { crearSesion } = require('../main/local-api/session');

const AHORA = Date.UTC(2026, 9, 13, 12);
const DIA = 86400000;
const tok = (expMs, extra = {}) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: 'u1', exp: Math.floor(expMs / 1000), ...extra })).toString('base64url')}.firma`;

(async () => {
  console.log('\n[sesión · renovación en el programa] Tests:');

  assert(R.expiraDe(tok(AHORA + DIA)) === AHORA + DIA && R.expiraDe('basura') === null && R.expiraDe('') === null && R.expiraDe(undefined) === null && R.expiraDe('a.b.c') === null, 'lee el vencimiento del token (y tokens raros no rompen nada)');
  assert(R.estadoDeSesion(tok(AHORA + 25 * DIA), AHORA) === 'ok' && R.estadoDeSesion(tok(AHORA + 19 * DIA), AHORA) === 'renovar' && R.estadoDeSesion(tok(AHORA + 1000), AHORA) === 'renovar' && R.estadoDeSesion(tok(AHORA - 1), AHORA) === 'vencida', 'con más de 20 días de sobra no se toca; con menos se renueva; vencida ya no se puede');
  assert(R.estadoDeSesion(tok(AHORA + 7 * DIA), AHORA) === 'renovar', 'una sesión vieja de 7 días (las de antes de esta versión) se renueva al primer chequeo');
  assert(R.estadoDeSesion('token-sin-exp', AHORA) === 'ok', 'un token ilegible no dispara renovaciones en bucle');

  const llamadas = []; const mk = (over = {}) => ({ sesion: { token: tok(AHORA + 3 * DIA), userId: 'u1', email: 'a@b.com' }, ahora: AHORA, renovar: async () => ({ token: tok(AHORA + 30 * DIA) }), guardar: (s) => llamadas.push(['guardar', s]), configurar: (t) => llamadas.push(['configurar', t]), avisar: (t) => llamadas.push(['avisar', t]), ...over });
  let r = await R.renovarSiHaceFalta(mk());
  assert(r.renovada && llamadas.map((x) => x[0]).join() === 'guardar,configurar,avisar', 'si hace falta: guarda la sesión nueva, la usa para las próximas consultas y se la pasa a la ventana');
  assert(llamadas[0][1].userId === 'u1' && llamadas[0][1].email === 'a@b.com' && R.expiraDe(llamadas[0][1].token) === AHORA + 30 * DIA && llamadas[1][1] === llamadas[0][1].token && llamadas[2][1] === llamadas[0][1].token, 'se guarda con el mismo usuario y email, y es la misma sesión nueva en los tres lugares');

  llamadas.length = 0; let pidio = 0;
  r = await R.renovarSiHaceFalta(mk({ sesion: { token: tok(AHORA + 29 * DIA), userId: 'u1' }, renovar: async () => { pidio++; return {}; } }));
  assert(!r.renovada && r.motivo === 'no_hace_falta' && pidio === 0 && !llamadas.length, 'con la sesión sobrada no le pide nada al servidor');
  r = await R.renovarSiHaceFalta(mk({ sesion: { token: tok(AHORA - DIA), userId: 'u1' }, renovar: async () => { pidio++; return {}; } }));
  assert(!r.renovada && r.motivo === 'vencida' && pidio === 0 && !llamadas.length, 'una sesión ya vencida no se intenta renovar (se le pide al usuario volver a ingresar)');
  r = await R.renovarSiHaceFalta(mk({ renovar: async () => { throw Object.assign(new Error('Sesión inválida'), { status: 401 }); } }));
  assert(!r.renovada && r.motivo === 'rechazada' && !llamadas.length, 'si el servidor la rechaza (401), no se guarda nada');
  r = await R.renovarSiHaceFalta(mk({ renovar: async () => { throw new Error('Timeout'); } }));
  assert(!r.renovada && r.motivo === 'sin_conexion' && !llamadas.length, 'sin internet no se pierde la sesión actual y se reintenta en el próximo chequeo (cada 15 minutos)');
  r = await R.renovarSiHaceFalta(mk({ renovar: async () => ({ token: tok(AHORA - 1000) }) }));
  assert(!r.renovada && r.motivo === 'respuesta_invalida' && !llamadas.length, 'una respuesta con una sesión ya vencida o rota no reemplaza a la actual');
  r = await R.renovarSiHaceFalta(mk({ renovar: async () => ({ token: 'basura' }) }));
  assert(!r.renovada && !llamadas.length, 'una respuesta con basura tampoco');
  r = await R.renovarSiHaceFalta(mk({ guardar: () => { throw new Error('disco lleno'); } }));
  assert(!r.renovada && r.motivo === 'sin_conexion', 'si falla al guardar, no se rompe el guardián (queda para el próximo chequeo)');

  // ── almacén de sesión: la renovada no se pisa con una más vieja ──
  const vieja = tok(AHORA + 2 * DIA); const nueva = tok(AHORA + 30 * DIA);
  assert(store.expiraDe(nueva) === AHORA + 30 * DIA && store.expiraDe('x') === null, 'el almacén sabe leer el vencimiento');
  store.guardar(dir, { token: nueva, userId: 'u1', email: 'a@b.com' });
  assert(store.leer(dir).token === nueva, 'se guarda y se lee cifrada');
  const sesion = crearSesion({ userDataDir: dir, nombreEquipo: 'pc' });
  await sesion.validar(vieja);
  assert(store.leer(dir).token === nueva, 'si la ventana todavía manda la sesión vieja, NO pisa a la renovada que está guardada');
  const nuevaMas = tok(AHORA + 60 * DIA);
  await sesion.validar(nuevaMas, { reemplazar: true });
  assert(store.leer(dir).token === nuevaMas, 'si llega una más nueva, sí se guarda');
  usuarioDe = { _id: 'u2', email: 'otro@b.com' };
  await sesion.validar(vieja, { reemplazar: true });
  assert(store.leer(dir).token === vieja && store.leer(dir).userId === 'u2', 'si ingresa OTRO usuario, se guarda su sesión aunque venza antes (no se mezclan cuentas)');

  // ── el guardián y el cliente de licencias están conectados ──
  const g = fs.readFileSync(path.join(__dirname, '../main/license/guardian.js'), 'utf8');
  const c = fs.readFileSync(path.join(__dirname, '../main/license/license-client.js'), 'utf8');
  const p = fs.readFileSync(path.join(__dirname, '../main/local-api/proxy.js'), 'utf8');
  assert(g.includes('renovacion.renovarSiHaceFalta') && g.includes("'sesion:token'") && /renovarSiHaceFalta[\s\S]*licenseClient\.heartbeat/.test(g), 'el guardián renueva ANTES de validar la licencia y avisa a la ventana');
  assert(c.includes("'/api/auth/renovar'") && c.includes("'x-akira-cliente': 'escritorio'") && p.includes("'x-akira-cliente': 'escritorio'"), 'el cliente de licencias y el proxy de login se identifican como app de escritorio (sesiones de 30 días)');

  console.log('\n✅ Todos los tests de la renovación de sesión (programa) pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
