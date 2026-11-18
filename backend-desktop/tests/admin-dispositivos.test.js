// tests/admin-dispositivos.test.js — GET /api/admin/users/:id/devices: solo lectura, solo admin, id de 24 hexadecimales, y únicamente los campos permitidos
// (nunca deviceId, huella de la máquina, tokens ni claves). Se usa el requireAuth / requireAdmin REALES; passport queda simulado.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
const passport = require('passport');
const { assert, inyectar, logCapturado, servir, fijarIp, consulta } = require('./_ayuda');

inyectar('config/logger.js', logCapturado());
const SESIONES = { admin: { _id: 'adm1', rol: 'admin', status: 'activo' }, user: { _id: 'u1', rol: 'user', status: 'activo' } };
passport.authenticate = (_estrategia, _op, cb) => (req, res, next) => { const u = SESIONES[req.headers['x-test-sesion']] || null; cb(null, u, u ? undefined : { message: 'Token inválido o expirado' }); };
inyectar('models/Log.js', { registrar: async () => {}, find: () => consulta([]), countDocuments: async () => 0 });
inyectar('models/User.js', { find: () => consulta([]), countDocuments: async () => 0 });
inyectar('models/Referido.js', {});
inyectar('services/bot.manager.js', {});

const registro = {}; let consultas = 0; let docs = [];
inyectar('models/Device.js', { find: (q) => { consultas++; registro.filtro = q; return consulta(docs, { registro }); }, countDocuments: async () => 0, distinct: async () => [] });

(async () => {
  console.log('\n[admin-dispositivos] Tests:');
  const admin = await servir('/api/admin', require('../routes/admin.routes'), { antes: [fijarIp] });
  const ID = '66f1a2b3c4d5e6f7a8b9c0d1';
  const como = (sesion) => ({ headers: { 'x-test-sesion': sesion } });

  // acceso
  let r = await admin.llamar(`/users/${ID}/devices`);
  assert(r.status === 401 && consultas === 0, 'sin sesión: 401 y no se consulta nada');
  r = await admin.llamar(`/users/${ID}/devices`, como('user'));
  assert(r.status === 403 && consultas === 0, 'un usuario común (no admin): 403 y no se consulta nada');

  // id inválido
  for (const malo of ['123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '66f1a2b3c4d5e6f7a8b9c0d1x', '66f1a2b3c4d5e6f7a8b9c0']) {
    r = await admin.llamar(`/users/${malo}/devices`, como('admin'));
    assert(r.status === 400 && consultas === 0, `id inválido "${malo}": 400 y no se consulta nada`);
  }
  r = await admin.llamar(`/users/${encodeURIComponent('{"$ne":null}')}/devices`, como('admin'));
  assert(r.status === 400 && consultas === 0, 'un objeto de consulta en lugar del id: 400');

  // sin equipos
  r = await admin.llamar(`/users/${ID}/devices`, como('admin'));
  assert(r.status === 200 && Array.isArray(r.body.devices) && r.body.devices.length === 0 && String(registro.filtro.userId) === ID, 'usuario sin equipos: 200 con lista vacía, consultando por ese userId');

  // con equipos: el modelo de mentira devuelve a propósito campos sensibles que NO deben salir
  const fecha = new Date('2026-11-10T12:00:00Z');
  docs = [
    {
      _id: 'd1', userId: ID, nombre: 'PC Barbería', version: '1.0.36', canal: 'store', activadoEn: fecha, ultimoHeartbeat: fecha,
      estadoBot: { slots: [{ slot: 0, conectado: true }], pausado: false }, revocado: false,
      ultimoErrorLicencia: { motivo: 'token_vencido', status: 401, en: fecha, recibidoEn: fecha },
      deviceId: 'DEVICE-ID-SECRETO', fingerprint: 'HUELLA-SECRETA', licenseToken: 'TOKEN-SECRETO', clave: 'CLAVE-SECRETA', comandos: [{ tipo: 'x' }], resumen: { ingresosMes: 123 }, revocadoMotivo: 'privado',
    },
    { _id: 'd2', userId: ID, nombre: '', version: '', activadoEn: fecha, ultimoHeartbeat: null, revocado: true, __v: 3 },
  ];
  r = await admin.llamar(`/users/${ID}/devices`, como('admin'));
  assert(r.status === 200 && r.body.devices.length === 2, 'con equipos: 200 y un elemento por equipo');
  assert(!/SECRET|deviceId|fingerprint|licenseToken|comandos|resumen|ingresosMes|privado|userId/i.test(r.texto), 'la respuesta NO contiene deviceId, huella, tokens, claves, comandos ni resumen del negocio');
  const permitidas = ['id', 'nombre', 'version', 'canal', 'activadoEn', 'ultimoHeartbeat', 'estadoBot', 'revocado', 'ultimoErrorLicencia'].sort();
  assert(r.body.devices.every((d) => JSON.stringify(Object.keys(d).sort()) === JSON.stringify(permitidas)), 'cada equipo trae exactamente los 9 campos pedidos, ni uno más');
  const d1 = r.body.devices[0]; const d2 = r.body.devices[1];
  assert(d1.id === 'd1' && d1.nombre === 'PC Barbería' && d1.version === '1.0.36' && d1.canal === 'store' && d1.revocado === false && d1.estadoBot.slots[0].conectado === true, 'los valores del equipo salen tal cual');
  assert(d1.ultimoErrorLicencia.motivo === 'token_vencido' && d1.ultimoErrorLicencia.status === 401 && d1.ultimoErrorLicencia.en === fecha.toISOString(), 'ultimoErrorLicencia sale con motivo, status y fecha');
  assert(d2.canal === null && d2.ultimoErrorLicencia === null && d2.estadoBot === null && d2.revocado === true && d2.ultimoHeartbeat === null, 'un equipo viejo (sin canal ni error) sale con null en esos campos');
  const sel = String(registro.select && registro.select[0]);
  assert(!/deviceId|fingerprint/.test(sel) && /ultimoErrorLicencia/.test(sel), 'la consulta a la base ni siquiera pide deviceId ni huella');

  // solo lectura: el router no tiene otro método para esa ruta
  r = await admin.llamar(`/users/${ID}/devices`, { ...como('admin'), metodo: 'POST', cuerpo: {} });
  assert(r.status === 404, 'la ruta es solo lectura: POST /users/:id/devices no existe');
  r = await admin.llamar(`/users/${ID}/devices`, { ...como('admin'), metodo: 'DELETE' });
  assert(r.status === 404, 'la ruta es solo lectura: DELETE /users/:id/devices no existe');

  await admin.cerrar();
  console.log('\n✅ Todos los tests de dispositivos del admin pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
