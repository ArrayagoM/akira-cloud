// tests/perfiles.test.js — perfiles del equipo: PIN, pases firmados, permisos por rol y la API que los aplica.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-perf-'));
const P = require('../main/perfiles');

(async () => {
  console.log('\n[perfiles] Tests:');
  assert(P.activo(dir) === false && P.publico(dir).activo === false, 'al principio los perfiles están apagados');
  assert(!P.definirPinPropietario(dir, '12').ok && !P.definirPinPropietario(dir, 'abcd').ok && !P.definirPinPropietario(dir, '123456789').ok && P.definirPinPropietario(dir, '4321').ok, 'el PIN del dueño: 4 a 8 números');
  assert(P.activo(dir) && !JSON.stringify(fs.readFileSync(path.join(dir, 'perfiles.json'), 'utf8')).includes('4321'), 'queda activo y el PIN no se guarda en claro');

  assert(!P.crear(dir, { nombre: '', rol: 'empleado', pin: '1111' }).ok && !P.crear(dir, { nombre: 'Luz', rol: 'jefa', pin: '1111' }).ok && !P.crear(dir, { nombre: 'Luz', rol: 'empleado', pin: '1' }).ok && !P.crear(dir, { nombre: 'Dueño', rol: 'empleado', pin: '1111' }).ok, 'crear un perfil valida nombre, rol, PIN y nombre reservado');
  const luz = P.crear(dir, { nombre: 'Luz', rol: 'empleado', pin: '1111' });
  const beto = P.crear(dir, { nombre: 'Beto', rol: 'encargado', pin: '2222' });
  assert(luz.ok && beto.ok && !P.crear(dir, { nombre: 'luz', rol: 'empleado', pin: '3333' }).ok, 'crea perfiles y no repite nombres');
  assert(P.publico(dir).perfiles.map((p) => p.nombre).join() === 'Dueño,Luz,Beto' && !JSON.stringify(P.publico(dir)).includes('hash') && !JSON.stringify(P.listaAdmin(dir)).includes('hash'), 'la pantalla de bloqueo lista a todos sin PINs ni datos internos');

  // entrar
  const t0 = 1_000_000;
  let r = P.entrar(dir, { id: luz.id, pin: '1111' }, t0);
  assert(r.ok && r.perfil.rol === 'empleado' && typeof r.token === 'string', 'entra con el PIN correcto');
  assert(P.verificar(dir, r.token, t0 + 1000).nombre === 'Luz' && P.verificar(dir, r.token, t0 + 13 * 3600e3) === null, 'el pase vale 12 horas');
  assert(P.verificar(dir, r.token + 'x', t0) === null && P.verificar(dir, 'basura', t0) === null && P.verificar(dir, '', t0) === null, 'un pase adulterado o inventado no sirve');
  const falso = P.firmar(dir, { id: 'propietario', rol: 'propietario' }, t0).split('.')[0] + '.' + r.token.split('.')[1];
  assert(P.verificar(dir, falso, t0) === null, 'no se puede copiar la firma de un pase en otro');
  assert(P.entrar(dir, { id: 'propietario', pin: '4321' }, t0).perfil.rol === 'propietario', 'el dueño entra con su PIN');

  // intentos
  for (let i = 0; i < P.MAX_INTENTOS - 1; i++) assert(P.entrar(dir, { id: beto.id, pin: '0000' }, t0).error === 'PIN incorrecto.', `PIN incorrecto (${i + 1})`);
  r = P.entrar(dir, { id: beto.id, pin: '0000' }, t0);
  const bloq = P.entrar(dir, { id: beto.id, pin: '2222' }, t0 + 1000);
  assert(!bloq.ok && bloq.bloqueadoHasta > t0, 'tras 5 PIN incorrectos se bloquea un minuto (aunque después pongan el correcto)');
  assert(P.entrar(dir, { id: beto.id, pin: '2222' }, t0 + P.BLOQUEO_MS + 10).ok, 'pasado el minuto vuelve a poder entrar');
  assert(!P.entrar(dir, { id: 'inexistente', pin: '1111' }, t0).ok, 'perfil inexistente');

  // desactivar un perfil corta su pase al instante
  const pase = P.entrar(dir, { id: luz.id, pin: '1111' }, t0).token;
  P.actualizar(dir, luz.id, { activo: false });
  assert(P.verificar(dir, pase, t0 + 5) === null && !P.entrar(dir, { id: luz.id, pin: '1111' }, t0).ok && !P.publico(dir).perfiles.some((p) => p.nombre === 'Luz'), 'desactivar un perfil le quita el acceso enseguida');
  P.actualizar(dir, luz.id, { activo: true, pin: '5555', rol: 'empleado' });
  assert(!P.entrar(dir, { id: luz.id, pin: '1111' }, t0).ok && P.entrar(dir, { id: luz.id, pin: '5555' }, t0).ok, 'cambiar el PIN');
  assert(!P.actualizar(dir, luz.id, { pin: '12' }).ok && !P.actualizar(dir, luz.id, { rol: 'x' }).ok && !P.actualizar(dir, 'nadie', {}).ok, 'cambios inválidos');

  // permisos
  const E = (m, r) => P.puede('empleado', m, r); const G = (m, r) => P.puede('encargado', m, r); const O = (m, r) => P.puede('propietario', m, r);
  assert(E('GET', '/api/bot/clientes') && E('POST', '/api/bot/clientes/x/responder') && E('PATCH', '/api/bot/clientes/x/notas') && E('GET', '/api/turnos?mes=2026-10') && E('POST', '/api/app/ventas') && E('GET', '/api/app/pedidos') && E('GET', '/api/gestion/lista?tipo=productos') && E('GET', '/api/config'), 'el empleado atiende chats, clientes, agenda, ventas, pedidos y ve el catálogo');
  assert(!E('GET', '/api/caja') && !E('GET', '/api/app/reportes') && !E('GET', '/api/deudores') && !E('GET', '/api/proveedores') && !E('GET', '/api/app/comprobantes') && !E('GET', '/api/app/conciliacion') && !E('GET', '/api/app/cierres') && !E('GET', '/api/bot/documentos'), 'el empleado NO ve la plata (Caja, reportes, deudas, comprobantes, conciliación, cierres, documentos)');
  assert(!E('PUT', '/api/config') && !E('PUT', '/api/bot/keys') && !E('POST', '/api/bot/stop') && !E('DELETE', '/api/bot/clientes/x') && !E('PUT', '/api/gestion/lista') && !E('DELETE', '/api/app/ventas/x') && !E('GET', '/api/app/respaldo') && !E('POST', '/api/app/perfiles/perfil') && !E('GET', '/api/subscriptions/me'), 'ni toca configuración, claves, el bot, el catálogo, respaldos ni perfiles; tampoco anula ventas');
  assert(!E('POST', '/api/auth/change-password') && E('GET', '/api/auth/me') && !E('GET', '/api/inexistente'), 'lo desconocido está cerrado por defecto');
  assert(G('GET', '/api/caja') && G('GET', '/api/app/reportes') && G('POST', '/api/app/ventas') && G('DELETE', '/api/app/ventas/x') && G('PUT', '/api/gestion/lista') && G('POST', '/api/bot/start') && G('POST', '/api/app/comprobantes') && G('GET', '/api/config'), 'el encargado maneja el negocio (caja, reportes, ventas, catálogo, bot)');
  assert(!G('PUT', '/api/config') && !G('PUT', '/api/bot/keys') && !G('GET', '/api/app/respaldo') && !G('POST', '/api/app/perfiles/perfil') && !G('POST', '/api/bot/reset-session') && !G('POST', '/api/bot/accounts') && !G('GET', '/api/subscriptions/me') && !G('GET', '/api/admin/usuarios') && !G('PUT', '/api/app/avisos/resumen-diario') && G('GET', '/api/app/avisos'), 'pero no la configuración, claves, respaldos, perfiles, la sesión de WhatsApp, planes ni la administración');
  assert(O('DELETE', '/api/loquesea') && !P.puede('raro', 'GET', '/api/caja'), 'el dueño puede todo y un rol desconocido nada');

  // ── la API ──
  const verificadas = [];
  const app = express(); app.use(express.json());
  const sesion = (q, _r, n) => { q.user = { _id: 'u1', email: 'dueno@x.com' }; n(); };
  app.use('/api', P.crearMiddleware(dir));
  app.use('/api/app/perfiles', require('../main/local-api/routes/perfiles.routes')({ requerirSesion: sesion, userDataDir: dir, verificarClave: async (e, pw) => { verificadas.push([e, pw]); return pw === 'clave-buena'; } }));
  app.get('/api/caja', (q, r) => r.json({ ok: 'caja', por: q.perfil?.nombre }));
  app.get('/api/bot/clientes', (q, r) => r.json({ ok: 'clientes', por: q.perfil?.nombre }));
  app.post('/api/auth/login', (_q, r) => r.json({ ok: 'login' }));
  app.get('/api/auth/me', (_q, r) => r.json({ ok: 'me' }));
  app.post('/api/auth/change-password', (_q, r) => r.json({ ok: 'cambió' }));
  app.get('/api/license/estado', (_q, r) => r.json({ ok: 'licencia' }));
  const srv = await new Promise((rs) => { const s = app.listen(0, '127.0.0.1', () => rs(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (m, p, body, pase, bearer) => { const h = { 'Content-Type': 'application/json' }; if (pase) h['x-akira-perfil'] = pase; if (bearer) h.authorization = 'Bearer abc'; const x = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, body: await x.json().catch(() => ({})) }; };

  let x = await j('GET', '/caja');
  assert(x.status === 403 && x.body.codigo === 'PERFIL_REQUERIDO', 'con perfiles activos, sin pase no se usa nada');
  assert((await j('POST', '/auth/login', {})).status === 200 && (await j('GET', '/auth/me', null, null, true)).status === 200 && (await j('GET', '/license/estado')).status === 200 && (await j('GET', '/app/perfiles/estado')).status === 200, 'pero sí el inicio de sesión, la licencia y la pantalla de bloqueo');
  assert((await j('POST', '/auth/change-password', {}, null, true)).status === 403, 'cambiar la contraseña de la cuenta (con sesión) exige pase');
  x = await j('POST', '/app/perfiles/entrar', { id: 'propietario', pin: 'mal' });
  assert(x.status === 400 && x.body.error === 'PIN incorrecto.', 'entrar con PIN malo → 400');
  const paseDueno = (await j('POST', '/app/perfiles/entrar', { id: 'propietario', pin: '4321' })).body.token;
  const paseLuz = (await j('POST', '/app/perfiles/entrar', { id: luz.id, pin: '5555' })).body.token;
  const paseBeto = (await j('POST', '/app/perfiles/entrar', { id: beto.id, pin: '2222' })).body.token;
  assert(paseDueno && paseLuz && paseBeto, 'cada uno recibe su pase');
  x = await j('GET', '/caja', null, paseLuz);
  assert(x.status === 403 && x.body.codigo === 'SIN_PERMISO', 'el empleado no entra a la Caja');
  x = await j('GET', '/bot/clientes', null, paseLuz);
  assert(x.status === 200 && x.body.por === 'Luz', 'pero sí a los clientes (y el servidor sabe quién es)');
  assert((await j('GET', '/caja', null, paseBeto)).status === 200 && (await j('GET', '/caja', null, paseDueno)).status === 200, 'el encargado y el dueño ven la Caja');
  assert((await j('GET', '/caja', null, paseLuz + 'x')).body.codigo === 'PERFIL_REQUERIDO', 'un pase adulterado se trata como "sin pase"');
  assert((await j('GET', '/app/perfiles/yo', null, paseLuz)).body.perfil.rol === 'empleado', '"quién soy"');

  // administración: solo el dueño
  assert((await j('GET', '/app/perfiles/admin', null, paseLuz)).status === 403 && (await j('GET', '/app/perfiles/admin', null, paseBeto)).status === 403, 'ni el empleado ni el encargado administran perfiles');
  x = await j('GET', '/app/perfiles/admin', null, paseDueno);
  assert(x.status === 200 && x.body.perfiles.length === 2, 'el dueño sí');
  x = await j('POST', '/app/perfiles/perfil', { nombre: 'Nico', rol: 'empleado', pin: '9999' }, paseDueno);
  assert(x.status === 200 && (await j('POST', '/app/perfiles/perfil', { nombre: 'Nico', rol: 'empleado', pin: '9999' }, paseDueno)).status === 400, 'crear un perfil por la API (y no repetirlo)');
  assert((await j('PUT', '/app/perfiles/perfil/nadie', { rol: 'encargado' }, paseDueno)).status === 404 && (await j('DELETE', `/app/perfiles/perfil/${x.body.id}`, null, paseDueno)).status === 200, 'editar uno inexistente → 404; borrar');

  // recuperar el PIN
  assert((await j('POST', '/app/perfiles/recuperar', { password: 'mala' }, paseLuz)).status === 400 && P.activo(dir), 'olvidé el PIN: con la contraseña equivocada no se desactiva');
  x = await j('POST', '/app/perfiles/recuperar', { password: 'clave-buena' });
  assert(x.status === 200 && !P.activo(dir) && verificadas[verificadas.length - 1][0] === 'dueno@x.com', 'con la contraseña de la cuenta se desactivan los perfiles');
  assert((await j('GET', '/caja')).status === 200, 'y la app vuelve a funcionar sin pase');
  // activar de nuevo por la API
  x = await j('POST', '/app/perfiles/pin-propietario', { pin: '1357' });
  assert(x.status === 200 && x.body.token && P.activo(dir) && (await j('GET', '/caja', null, x.body.token)).status === 200, 'activar los perfiles deja adentro al dueño (con su pase)');
  assert((await j('DELETE', '/app/perfiles/pin-propietario', { pin: '0000' }, x.body.token)).status === 400 && P.activo(dir) && (await j('DELETE', '/app/perfiles/pin-propietario', { pin: '1357' }, x.body.token)).status === 200 && !P.activo(dir), 'apagar los perfiles pide el PIN del dueño');
  srv.close();

  console.log('\n✅ Todos los tests de perfiles pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
