// tests/respaldo-api.test.js — rutas del respaldo: configurar, respaldar, verificar y restaurar (con reinicio simulado).
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-respapi-'));
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-respdest-'));
const store = require('../main/db/store');
store.abrir(path.join(dir, 'akira.db'));

(async () => {
  console.log('\n[respaldo-api] Tests:');
  const { crearServicio } = require('../main/respaldo-servicio');
  const credenciales = require('../main/security/credentials-store');
  store.ensureCollection('prueba_r'); store.insertar('col_prueba_r', { _id: 'p1', nombre: 'dato importante' });

  const servicioRespaldo = crearServicio({ userDataDir: dir, snapshotDb: store.respaldarA, credenciales, version: '1.0.17', setI: () => 1, setT: () => 1 });
  let reinicios = 0; let carpetaElegida = carpeta; let archivoElegido = null;
  const appHooks = { userDataDir: dir, elegirCarpeta: async () => carpetaElegida, elegirArchivo: async () => archivoElegido, abrirCarpeta: async () => {}, reiniciar: () => { reinicios++; } };
  const app = express(); app.use(express.json());
  app.use('/api/app/respaldo', require('../main/local-api/routes/respaldo.routes')({ requerirSesion: (req, _r, n) => { req.user = { _id: 'u1' }; n(); }, servicioRespaldo, appHooks }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/app/respaldo`;
  const j = async (p, body, method) => { const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };

  let r = await j('');
  assert(r.status === 200 && r.body.activo === false && r.body.tieneClave === false && r.body.archivos.length === 0, 'estado inicial: apagado, sin contraseña, sin respaldos');
  r = await j('/ahora', {});
  assert(r.status === 400 && /carpeta y una contraseña/.test(r.body.error), 'respaldar sin configurar explica qué falta');
  r = await j('/elegir-carpeta', {});
  assert(r.body.carpeta === carpeta, 'el diálogo nativo devuelve la carpeta elegida');
  r = await j('', { carpeta: r.body.carpeta, clave: '123' }, 'PUT');
  assert(r.status === 400 && /8 caracteres/.test(r.body.error), 'contraseña corta → 400');
  r = await j('', { carpeta, clave: 'contraseña-larga-ok', activo: true }, 'PUT');
  assert(r.status === 200 && r.body.activo && r.body.tieneClave && !JSON.stringify(r.body).includes('contraseña-larga-ok'), 'se configura y la contraseña nunca vuelve en la respuesta');
  r = await j('/ahora', {});
  assert(r.status === 200 && r.body.ultimo.ok && r.body.archivos.length === 1, '"respaldar ahora" funciona');
  const archivo = r.body.archivos[0].archivo;

  r = await j('/verificar', { archivo, clave: 'contraseña-larga-ok' });
  assert(r.status === 200 && r.body.version === '1.0.17', 'verificar con la contraseña correcta informa el contenido');
  r = await j('/verificar', { archivo, clave: 'incorrecta-xxx' });
  assert(r.status === 422 && /incorrecta/.test(r.body.error), 'contraseña incorrecta → 422 con mensaje claro (nunca 401: la interfaz lo tomaría como sesión vencida)');
  r = await j('/verificar', { archivo: path.join(carpeta, 'no-existe.akbk'), clave: 'x' });
  assert(r.status === 400, 'archivo inexistente → 400');
  r = await j('/verificar', { archivo: path.join(dir, 'akira.db'), clave: 'x' });
  assert(r.status === 400, 'solo acepta archivos .akbk (no se puede apuntar a cualquier archivo de la PC)');

  r = await j('/restaurar', { archivo, clave: 'contraseña-larga-ok' });
  assert(r.status === 400 && /confirmar/.test(r.body.error) && !fs.existsSync(path.join(dir, 'restauracion-pendiente')), 'sin confirmación explícita no restaura');
  r = await j('/restaurar', { archivo, clave: 'mala-clave-123', confirmar: true });
  assert(r.status === 422 && !fs.existsSync(path.join(dir, 'restauracion-pendiente')), 'con contraseña incorrecta no deja nada pendiente');
  r = await j('/restaurar', { archivo, clave: 'contraseña-larga-ok', confirmar: true });
  assert(r.status === 200 && r.body.ok && r.body.reiniciando === true && fs.existsSync(path.join(dir, 'restauracion-pendiente', 'base', 'akira.db')), 'restaurar deja todo en espera y avisa que va a reiniciar');
  await new Promise((res) => setTimeout(res, 1800));
  assert(reinicios === 1, 'la app se reinicia (el cambio real ocurre al volver a abrir)');

  srv.close(); store.cerrar();
  console.log('\n✅ Todos los tests de respaldo-api pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
