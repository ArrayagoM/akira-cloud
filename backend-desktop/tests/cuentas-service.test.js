// tests/cuentas-service.test.js — alta con verificación de email: robots, códigos, reenvíos y altas pisadas. Todo con una base de mentira.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo';
const { crearCuentas } = require('../services/cuentas.service');
const S = require('../lib/seguridad-cuentas');
const L = require('../lib/limite');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
const SECRETO = process.env.JWT_SECRET;

// ── base de mentira ──
function mundo({ correoFalla = false, config = {}, turnstile } = {}) {
  const users = []; const mails = []; const logs = []; const limites = new Map(); let reloj = 1_800_000_000_000; let ids = 0;
  const cadena = (v) => { const p = Promise.resolve(v); p.select = () => p; p.lean = () => p; return p; };
  const aplicar = (u, upd) => { for (const [k, v] of Object.entries(upd)) { if (k === '$unset') for (const c of Object.keys(v)) delete u[c]; else if (k === '$inc') for (const [c, n] of Object.entries(v)) u[c] = (u[c] || 0) + n; else u[k] = v; } };
  const hacer = (d) => { const u = { _id: 'u' + (++ids), ...d }; u.save = async () => u; u.toJSON = () => ({ _id: u._id, email: u.email, nombre: u.nombre }); return u; };
  const User = {
    findOne: (q) => cadena(users.find((u) => (q.email && u.email === q.email) || (q.codigoReferido && u.codigoReferido === q.codigoReferido)) || null),
    create: async (d) => { const u = hacer(d); users.push(u); return u; },
    generarCodigoUnico: async () => 'COD-' + (++ids),
    findByIdAndUpdate: (id, upd, op = {}) => { const u = users.find((x) => x._id === id); if (u) { const antes = { ...u }; aplicar(u, upd); return cadena(op.new ? u : antes); } return cadena(null); },
    findOneAndUpdate: (f, upd, op = {}) => { const u = users.find((x) => x._id === f._id && (!f.verifIntentos || (x.verifIntentos || 0) < f.verifIntentos.$lt)); if (!u) return cadena(null); const antes = { ...u }; aplicar(u, upd); return cadena(op.new ? u : antes); },
    findByIdAndDelete: async (id) => { const i = users.findIndex((x) => x._id === id); if (i >= 0) users.splice(i, 1); },
  };
  const Falso = { async findOneAndUpdate(filtro, upd, op = {}) { const f = limites.get(filtro._id); if (filtro.expira && !(f && f.expira > filtro.expira.$gt)) return null; if (!f && !op.upsert) return null; const n = f ? { ...f } : { _id: filtro._id, n: 0 }; if (upd.$inc) n.n += upd.$inc.n; if (upd.$set) Object.assign(n, upd.$set); limites.set(filtro._id, n); return n; } };
  const cuentas = crearCuentas({
    User, Referido: { create: async () => {} }, Log: { registrar: async (d) => { logs.push(d); } },
    enviarCodigo: async (email, nombre, codigo) => { if (correoFalla) throw new Error('SMTP caído'); mails.push({ email, nombre, codigo }); return true; },
    limitar: (lista) => L.consumirTodos(lista, Falso, reloj), secreto: SECRETO, logger: { warn() {}, error() {} }, ahora: () => reloj, config, verificarTurnstile: turnstile,
  });
  const form = () => S.crearTokenFormulario(SECRETO, reloj - 5000);   // un formulario abierto hace 5 segundos
  const alta = (extra = {}, ctx = { ip: '1.1.1.1' }) => cuentas.registrar({ nombre: 'Ana', apellido: 'López', email: 'ana@negocio.com', password: 'Tr3s-gatos-azules', pais: 'Argentina', formToken: form(), ...extra }, ctx);
  return { cuentas, users, mails, logs, avanzar: (ms) => { reloj += ms; }, alta, form, ahora: () => reloj };
}

(async () => {
  console.log('\n[cuentas-service] Tests:');

  // ── alta normal ──
  let m = mundo(); let r = await m.alta();
  assert(r.status === 201 && r.body.requiereVerificacion === true && r.body.email === 'ana@negocio.com' && !r.usuario && !r.body.token, 'el alta responde "falta verificar" y NO entrega sesión');
  assert(m.users.length === 1 && m.users[0].emailVerificado === false, 'la cuenta nace sin verificar');
  assert(m.mails.length === 1 && /^\d{6}$/.test(m.mails[0].codigo) && m.mails[0].email === 'ana@negocio.com', 'se manda un código de 6 dígitos al email');
  assert(m.users[0].verifCodigoHash && !JSON.stringify(m.users[0]).includes(m.mails[0].codigo), 'en la base queda el hash del código, no el código');

  // ── robots ──
  m = mundo(); r = await m.alta({ formToken: undefined });
  assert(r.status === 400 && r.body.codigo === 'FORMULARIO_INVALIDO' && m.users.length === 0, 'sin token de formulario no se crea nada');
  m = mundo(); r = await m.alta({ formToken: S.crearTokenFormulario(SECRETO, m.ahora() - 300) });
  assert(r.status === 400 && m.users.length === 0, 'un formulario enviado en menos de 3 segundos se rechaza');
  m = mundo(); r = await m.alta({ formToken: S.crearTokenFormulario('otra-clave', m.ahora() - 5000) });
  assert(r.status === 400 && m.users.length === 0, 'un token firmado con otra clave se rechaza');
  m = mundo(); const tk = m.form();
  for (let i = 0; i < 3; i++) await m.alta({ formToken: tk, email: `p${i}@negocio.com` }, { ip: '9.9.9.' + i });
  r = await m.alta({ formToken: tk, email: 'p9@negocio.com' }, { ip: '9.9.9.9' });
  assert(r.status === 400 && m.users.length === 3, 'el mismo token no sirve para registrar cuentas en serie (máximo 3 usos)');
  m = mundo(); r = await m.alta({ sitio_web: 'http://spam.com' });
  assert(r.status === 201 && r.body.requiereVerificacion && m.users.length === 0 && m.mails.length === 0 && r.bloqueado === 'trampa', 'el campo trampa: finge éxito pero no crea cuenta ni manda mail');
  assert(m.logs.some((l) => l.tipo === 'security_block'), 'queda registrado como bloqueo de seguridad');
  m = mundo();
  for (let i = 0; i < 6; i++) await m.alta({ email: `bot${i}@negocio.com` }, { ip: '6.6.6.6' });
  r = await m.alta({ email: 'bot7@negocio.com' }, { ip: '6.6.6.6' });
  assert(r.status === 429 && m.users.length === 6, 'desde la misma IP se pueden crear 6 cuentas por hora; la 7ª se frena');
  assert((await m.alta({ email: 'otra@negocio.com' }, { ip: '7.7.7.7' })).status === 201, 'otra IP sigue pudiendo registrarse');

  // ── validaciones ──
  m = mundo();
  for (const [campo, valor] of [['nombre', '<script>x</script>'], ['nombre', 'Juan123'], ['email', 'a@mailinator.com'], ['email', 'no-es-email'], ['password', 'Password1'], ['password', 'corta1A'], ['celular', 'abc'], ['apellido', 'www.estafa.com']]) {
    r = await m.alta({ [campo]: valor }, { ip: 'v' + campo + valor.length });
    assert(r.status === 400 && r.body.error && m.users.length === 0, `se rechaza ${campo} = ${JSON.stringify(valor)}`);
  }
  for (const raro of [null, undefined, 'texto', 42, ['a'], { nombre: { $gt: '' }, email: { $ne: null }, password: ['x'] }]) {
    const rr = await m.cuentas.registrar(raro, { ip: 'raro' + String(raro).length });
    assert(rr.status >= 400 && m.users.length === 0, `un cuerpo raro no rompe ni crea nada: ${JSON.stringify(raro)}`);
  }

  // ── cuentas repetidas ──
  m = mundo(); await m.alta();
  r = await m.alta({}, { ip: '2.2.2.2' });
  assert(r.status === 409 && r.body.codigo === 'ALTA_RECIENTE' && m.users.length === 1, 'repetir un alta sin confirmar a los pocos minutos no la pisa');
  const pwAntes = m.users[0].password; m.avanzar(6 * 60e3);
  r = await m.alta({ password: 'Otra-clave-9Z' }, { ip: '3.3.3.3' });
  assert(r.status === 201 && m.users.length === 1 && m.users[0].password === 'Otra-clave-9Z' && m.users[0].password !== pwAntes && m.mails.length === 2, 'pasados 5 minutos, un alta sin confirmar se reemplaza con lo nuevo y llega un código nuevo');
  m = mundo(); await m.alta(); const u0 = m.users[0]; u0.emailVerificado = true;
  assert((await m.alta({}, { ip: '4.4.4.4' })).status === 409, 'si la cuenta ya está verificada, el alta se rechaza (409)');
  m = mundo(); await m.alta({ email: 'a.b+promo@gmail.com' });
  r = await m.alta({ email: 'ab@gmail.com' }, { ip: '5.5.5.5' });
  assert(m.users.length === 1 && m.users[0].email === 'ab@gmail.com', 'el email se guarda sin puntos ni +etiqueta en Gmail: no se puede repetir la prueba gratis con alias');

  // ── el correo no sale ──
  m = mundo({ correoFalla: true }); r = await m.alta();
  assert(r.status === 503 && r.body.codigo === 'CORREO_NO_ENVIADO' && m.users.length === 0, 'si no se puede mandar el código, no queda una cuenta imposible de verificar');

  // ── verificación del código ──
  m = mundo(); await m.alta(); const codigo = m.mails[0].codigo; const mal = codigo === '000000' ? '111111' : '000000';
  r = await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo: mal }, { ip: 'a' });
  assert(r.status === 400 && r.body.codigo === 'CODIGO_INCORRECTO' && r.body.quedan === 4 && !r.usuario, 'un código incorrecto dice cuántos intentos quedan');
  r = await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo }, { ip: 'a' });
  assert(r.status === 200 && r.usuario && r.usuario.emailVerificado === true && !m.users[0].verifCodigoHash && !m.users[0].verifExpira, 'el código correcto verifica la cuenta y borra el código');
  r = await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo }, { ip: 'a' });
  assert(r.status === 400 && !r.usuario, 'el mismo código no sirve dos veces');

  m = mundo(); await m.alta(); const cod2 = m.mails[0].codigo; const mal2 = cod2 === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo: mal2 }, { ip: 'b' + i });
  r = await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo: cod2 }, { ip: 'b9' });
  assert(r.status === 429 && r.body.codigo === 'INTENTOS_AGOTADOS' && !r.usuario, 'después de 5 intentos fallidos, ni el código correcto sirve: hay que pedir uno nuevo');

  m = mundo(); await m.alta(); const cod3 = m.mails[0].codigo; const mal3 = cod3 === '000000' ? '111111' : '000000';
  await Promise.all(Array.from({ length: 12 }, (_, i) => m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo: mal3 }, { ip: 'p' + i })));
  assert(m.users[0].verifIntentos === 5, `12 intentos simultáneos solo cuentan 5 comparaciones (quedó en ${m.users[0].verifIntentos})`);

  m = mundo(); await m.alta(); const cod4 = m.mails[0].codigo; m.avanzar(16 * 60e3);
  r = await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo: cod4 }, { ip: 'c' });
  assert(r.status === 400 && r.body.codigo === 'CODIGO_VENCIDO' && !r.usuario, 'el código vence a los 15 minutos');
  r = await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo: '12ab' }, { ip: 'c' });
  assert(r.status === 400 && !r.usuario, 'un código con letras ni se compara');
  r = await m.cuentas.verificarEmail({ email: 'nadie@negocio.com', codigo: '123456' }, { ip: 'c' });
  assert(r.status === 400 && r.body.codigo === 'CODIGO_INVALIDO', 'un email que no existe recibe la misma respuesta genérica');
  m = mundo();
  for (let i = 0; i < 31; i++) await m.cuentas.verificarEmail({ email: `x${i}@negocio.com`, codigo: '123456' }, { ip: 'fuerza-bruta' });
  r = await m.cuentas.verificarEmail({ email: 'y@negocio.com', codigo: '123456' }, { ip: 'fuerza-bruta' });
  assert(r.status === 429, 'una IP que prueba cientos de códigos se frena');

  // ── reenvío ──
  m = mundo(); await m.alta(); m.avanzar(10e3);
  r = await m.cuentas.reenviarCodigo({ email: 'ana@negocio.com' }, { ip: 'r' });
  assert(r.status === 429 && r.body.codigo === 'ESPERAR' && m.mails.length === 1, 'no se puede pedir otro código antes de 60 segundos');
  m.avanzar(60e3); r = await m.cuentas.reenviarCodigo({ email: 'ana@negocio.com' }, { ip: 'r' });
  assert(r.status === 200 && m.mails.length === 2 && m.mails[1].codigo !== undefined, 'pasado el minuto se manda uno nuevo');
  r = await m.cuentas.verificarEmail({ email: 'ana@negocio.com', codigo: m.mails[0].codigo }, { ip: 'r2' });
  assert(r.status === 400 || m.mails[0].codigo === m.mails[1].codigo, 'el código viejo deja de servir al emitir uno nuevo');
  const respConocido = await m.cuentas.reenviarCodigo({ email: 'ana@negocio.com' }, { ip: 'r3' }); const respDesconocido = await m.cuentas.reenviarCodigo({ email: 'nadie@negocio.com' }, { ip: 'r4' });
  assert(respDesconocido.status === 200 && respDesconocido.body.msg === (respConocido.body.msg || respDesconocido.body.msg), 'para un email desconocido la respuesta es genérica (no se puede averiguar quién tiene cuenta)');
  m = mundo(); await m.alta();
  for (let i = 0; i < 6; i++) { m.avanzar(61e3); r = await m.cuentas.reenviarCodigo({ email: 'ana@negocio.com' }, { ip: 'q' + i }); }
  assert(r.status === 429 && m.mails.length <= 6, 'máximo 5 reenvíos por hora a un mismo email (no se puede usar para llenarle la casilla a alguien)');

  // ── interruptor de emergencia y captcha ──
  m = mundo({ config: { exigirVerificacion: false } }); r = await m.alta();
  assert(r.status === 201 && r.usuario && r.usuario.emailVerificado === true && m.mails.length === 0, 'con VERIFICACION_EMAIL=off el alta funciona como antes (sin código)');
  m = mundo({ config: { turnstileSecret: 'sk' }, turnstile: async () => false }); r = await m.alta();
  assert(r.status === 400 && r.body.codigo === 'CAPTCHA_INVALIDO' && m.users.length === 0, 'con captcha activado y respuesta inválida, no se crea la cuenta');
  m = mundo({ config: { turnstileSecret: 'sk' }, turnstile: async (t) => t === 'ok' }); r = await m.alta({ turnstile: 'ok' });
  assert(r.status === 201, 'con captcha válido, se crea');

  console.log('\n✅ Todos los tests del servicio de cuentas pasaron.\n');
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
