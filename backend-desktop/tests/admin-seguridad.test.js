// tests/admin-seguridad.test.js — panel de administración: texto escrito por el admin escapado antes de usarlo en una regex, cambio de contraseña
// de un usuario que cierra sus sesiones (tokenVersion), /descargas con orden y tope, /ingresos con proyección de campos mínima.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo-123';
const { assert, inyectar, logCapturado, servir, fijarIp, consulta } = require('./_ayuda');

inyectar('config/logger.js', logCapturado());
const reg = { logs: null, pagos: {}, descargas: {}, waauth: null, usuarioActualizado: null };
const usuariosDB = { aaa: null };
const pagos = [
  { userId: 'u1', email: 'a@x.com', plan: 'pro', periodo: 'mensual', monto: 49000, estado: 'aprobado', fecha: '2026-11-05T12:00:00Z', descuentoReferido: 0 },
  { userId: 'u2', email: 'b@x.com', plan: 'basico', periodo: 'mensual', monto: 20000, estado: 'aprobado', fecha: '2026-11-06T12:00:00Z', descuentoReferido: 5000 },
];
inyectar('models/User.js', {
  findById: (id) => consulta(id === '66f1a2b3c4d5e6f7a8b9c0d1' ? usuariosDB.aaa : null),
  findByIdAndUpdate: async (id, upd) => { reg.usuarioActualizado = { id, upd }; return {}; },
  find: () => consulta([]), countDocuments: async () => 10,
});
inyectar('models/Log.js', { registrar: async () => {}, find: (q) => { reg.logs = q; return consulta([]); }, countDocuments: async () => 0 });
inyectar('models/Referido.js', {});
inyectar('models/Device.js', { countDocuments: async () => 3, distinct: async () => ['x', 'y'], find: () => consulta([]) });
inyectar('models/Pago.js', { find: (q) => { reg.pagos.filtro = q; return consulta(pagos, { registro: reg.pagos }); } });
inyectar('models/Descarga.js', { find: (q) => { reg.descargas.filtro = q; return consulta([{ plataforma: 'windows', origen: 'web', visitante: 'v1', fecha: new Date() }], { registro: reg.descargas }); } });
inyectar('models/WAAuth.js', { find: (q) => { reg.waauth = q; return consulta([]); } });
inyectar('models/BotCliente.js', { countDocuments: async () => 0 });
inyectar('models/Config.js', { findOne: () => consulta(null) });
inyectar('services/bot.manager.js', { getActiveUserIds: () => [], getQRPendiente: () => null });
inyectar('middleware/auth.js', { requireAuth: (req, _res, next) => { req.user = { _id: 'adm1', rol: 'admin', email: 'admin@akira.test' }; next(); }, requireAdmin: (_q, _r, n) => n(), generarJWT: () => 't' });

const { escaparRegex } = require('../lib/regex-seguro');

(async () => {
  console.log('\n[admin-seguridad] Tests:');

  // ── escaparRegex ──
  assert(escaparRegex('a.b(c)') === 'a\\.b\\(c\\)' && escaparRegex('.*') === '\\.\\*' && escaparRegex('[x]+') === '\\[x\\]\\+', 'escaparRegex: punto, paréntesis, corchetes, asterisco y más se escapan');
  assert(escaparRegex(undefined) === '' && escaparRegex('x'.repeat(500)).length === 100, 'escaparRegex: vacío y tope de largo (100)');
  const re = new RegExp(escaparRegex('(a+)+$'), 'i');
  assert(re.test('xx(a+)+$') && !re.test('aaaaaaaaaaaaaaaaaaaaaaaa!'), 'escaparRegex: un patrón de "backtracking catastrófico" se busca como texto literal');

  const admin = await servir('/api/admin', require('../routes/admin.routes'), { antes: [fijarIp] });

  // ── logs: la búsqueda libre se escapa ──
  let r = await admin.llamar('/logs?buscar=' + encodeURIComponent('(a+)+$ .*'));
  assert(r.status === 200 && reg.logs.mensaje.$regex === '\\(a\\+\\)\\+\\$ \\.\\*' && reg.logs.mensaje.$options === 'i', '/logs: el texto de búsqueda llega a Mongo escapado');
  r = await admin.llamar('/logs?buscar=(');
  assert(r.status === 200 && reg.logs.mensaje.$regex === '\\(', '/logs: un paréntesis suelto ya no arma una regex inválida');
  r = await admin.llamar('/logs');
  assert(r.status === 200 && reg.logs.mensaje === undefined, '/logs sin búsqueda: sigue sin filtrar por mensaje');

  // ── bot-diagnostic: el id se escapa en la regex de WAAuth ──
  r = await admin.llamar('/users/' + encodeURIComponent('a.*(b') + '/bot-diagnostic');
  assert(r.status === 200 && reg.waauth._id.$regex === '^a\\.\\*\\(b:', '/users/:id/bot-diagnostic: el id se escapa dentro de la regex de WAAuth');
  r = await admin.llamar('/users/66f1a2b3c4d5e6f7a8b9c0d1/bot-diagnostic');
  assert(r.status === 200 && reg.waauth._id.$regex === '^66f1a2b3c4d5e6f7a8b9c0d1:', '/users/:id/bot-diagnostic con un id normal: la regex es la de siempre');

  // ── contraseña desde el admin: sube tokenVersion como el cambio normal ──
  const guardado = []; usuariosDB.aaa = { _id: '66f1a2b3c4d5e6f7a8b9c0d1', password: 'vieja', save: async function () { guardado.push(this.password); } };
  r = await admin.llamar('/users/66f1a2b3c4d5e6f7a8b9c0d1/password', { metodo: 'POST', cuerpo: { nuevaPassword: 'Clave-nueva-larga-1' } });
  assert(r.status === 200 && r.body.ok === true && guardado[0] === 'Clave-nueva-larga-1', 'cambiar la contraseña desde el admin: sigue respondiendo { ok: true } y guarda la nueva');
  assert(reg.usuarioActualizado && reg.usuarioActualizado.id === '66f1a2b3c4d5e6f7a8b9c0d1' && reg.usuarioActualizado.upd.$inc && reg.usuarioActualizado.upd.$inc.tokenVersion === 1, 'cambiar la contraseña desde el admin: sube tokenVersion en 1 (cierra las sesiones abiertas de esa cuenta)');
  reg.usuarioActualizado = null;
  r = await admin.llamar('/users/66f1a2b3c4d5e6f7a8b9c0d1/password', { metodo: 'POST', cuerpo: { nuevaPassword: 'corta' } });
  assert(r.status === 400 && reg.usuarioActualizado === null, 'contraseña de menos de 8 caracteres: 400 y no se toca nada');
  r = await admin.llamar('/users/66f1a2b3c4d5e6f7a8b9c0d9/password', { metodo: 'POST', cuerpo: { nuevaPassword: 'Clave-nueva-larga-1' } });
  assert(r.status === 404 && reg.usuarioActualizado === null, 'usuario inexistente: 404 y no se sube ningún tokenVersion');

  // ── descargas: orden y tope ──
  r = await admin.llamar('/descargas?dias=30');
  assert(r.status === 200 && r.body.total === 1 && r.body.embudo.usuarios === 10 && Array.isArray(r.body.porDia), '/descargas: la respuesta mantiene la forma que usa el panel');
  assert(reg.descargas.sort && reg.descargas.sort[0].fecha === -1, '/descargas: se leen primero las más nuevas (sort por fecha descendente)');
  assert(reg.descargas.limit && reg.descargas.limit[0] === 50000, '/descargas: la lectura tiene un tope (50.000 filas)');
  assert(String(reg.descargas.select[0]) === 'plataforma origen visitante fecha', '/descargas: sigue leyendo solo los 4 campos que usa el resumen');

  // ── ingresos: proyección mínima ──
  r = await admin.llamar('/ingresos');
  assert(r.status === 200 && r.body.ingresos.acumulado === 69000 && r.body.ingresos.pagos === 2 && r.body.ultimosPagos.length === 2 && r.body.porMes.length === 6, '/ingresos: la respuesta mantiene la forma y las cuentas del panel');
  const campos = String(reg.pagos.select && reg.pagos.select[0]).split(/\s+/);
  assert(['userId', 'email', 'plan', 'periodo', 'monto', 'estado', 'fecha', 'descuentoReferido'].every((c) => campos.includes(c)), '/ingresos: la proyección incluye todos los campos que usa el resumen');
  assert(!campos.includes('mpPagoId'), '/ingresos: la proyección deja afuera lo que no se usa (mpPagoId)');
  assert(reg.pagos.limit && reg.pagos.limit[0] === 5000, '/ingresos: sigue trayendo hasta 5000 pagos');

  await admin.cerrar();
  console.log('\n✅ Todos los tests de seguridad del panel admin pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
