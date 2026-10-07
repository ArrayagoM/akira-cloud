// tests/uso-estadisticas.test.js — estadísticas de uso anónimas en la app: apagadas por defecto, solo pantallas conocidas, nada de datos.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-uso-'));
const U = require('../main/uso-estadisticas');

(async () => {
  console.log('\n[uso-estadísticas] Tests:');
  const f = new Date(2026, 9, 7, 12, 0);
  assert(U.activo(dir) === false && U.paraEnviar(dir, f) === undefined && U.contar(dir, '/caja', f) === false, 'apagadas por defecto: no cuentan ni mandan nada');
  assert(U.pantallaDe('/caja') === 'caja' && U.pantallaDe('/reportes?x=1') === 'reportes' && U.pantallaDe('/clientes/123') === 'clientes' && U.pantallaDe('/login') === null && U.pantallaDe('/api/caja') === null && U.pantallaDe('') === null && U.pantallaDe('/CAJA') === 'caja', 'reconoce pantallas conocidas; lo demás (login, rutas raras) se ignora');
  assert(U.activar(dir, true) === true && U.activo(dir), 'se activan cuando el usuario quiere');
  U.contar(dir, '/caja', f); U.contar(dir, '/caja', f); U.contar(dir, '/agenda', f);
  assert(!U.contar(dir, '/login', f) && !U.contar(dir, '/cliente-juan-perez', f), 'ni las pantallas desconocidas ni nada con datos se cuenta');
  const env = U.paraEnviar(dir, f);
  assert(env.length === 1 && env[0].dia === '2026-10-07' && env[0].pantallas.caja === 2 && env[0].pantallas.agenda === 1 && Object.keys(env[0].pantallas).length === 2, 'se informa solo el contador por pantalla');
  const manana = new Date(2026, 9, 8, 9, 0);
  U.contar(dir, '/caja', manana);
  const env2 = U.paraEnviar(dir, manana);
  assert(env2.length === 2 && env2.find((x) => x.dia === '2026-10-07').pantallas.caja === 2 && env2.find((x) => x.dia === '2026-10-08').pantallas.caja === 1, 'manda hoy y ayer (el servidor pisa el valor del día: no se suma dos veces)');
  for (let i = 0; i < 12; i++) U.contar(dir, '/chats', new Date(2026, 10, 1 + i, 10));
  assert(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'uso.json'), 'utf8')).dias).length === 7, 'solo guarda los últimos 7 días');
  assert(!/cliente|telefono|monto/i.test(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'uso.json'), 'utf8')).dias).replace(/"clientes"/g, '')), 'el archivo no tiene nada más que contadores');
  assert(U.activar(dir, false) === false && U.paraEnviar(dir, f) === undefined && Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'uso.json'), 'utf8')).dias).length === 0, 'al apagarlas se borra lo que había juntado y se deja de enviar');

  const app = express(); app.use(express.json());
  app.use('/api/app/uso', require('../main/local-api/routes/uso.routes')({ requerirSesion: (q, _r, n) => { q.user = { _id: 'u1' }; n(); }, userDataDir: dir }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/uso`;
  const j = async (m, p, body) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return x.json(); };
  assert((await j('GET', '')).activo === false && (await j('POST', '/pantalla', { pantalla: '/caja' })).ok === false, 'API: apagadas, no cuenta');
  assert((await j('PUT', '', { activo: true })).activo === true && (await j('POST', '/pantalla', { pantalla: '/caja' })).ok === true && (await j('PUT', '', { activo: 'si' })).activo === false, 'API: se activan y apagan (solo true activa)');
  srv.close();

  const P = require('../main/perfiles');
  assert(!P.puede('encargado', 'PUT', '/api/app/uso') && P.puede('encargado', 'POST', '/api/app/uso/pantalla') && P.puede('empleado', 'POST', '/api/app/uso/pantalla') && !P.puede('empleado', 'PUT', '/api/app/uso'), 'solo el dueño las activa; todos cuentan pantallas');

  console.log('\n✅ Todos los tests de uso-estadísticas pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
