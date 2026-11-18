// tests/autorreferido.test.js — AUD-001 #12: nadie puede ganar el descuento (ni generar una comisión) refiriéndose a sí mismo con un alias de su propio email.
// Si el referido y el referente normalizan al mismo email, el referido simplemente no se aplica: la cuenta se crea igual, sin error visible.
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-largo-largo-largo';
const { crearCuentas } = require('../services/cuentas.service');
const R = require('../lib/referidos');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

// ── email "de fondo" ──
console.log('\n[autorreferido] Tests:');
assert(R.emailBase('Ana@Negocio.com') === 'ana@negocio.com', 'emailBase: pasa a minúsculas');
assert(R.emailBase('a.n.a+promo@gmail.com') === 'ana@gmail.com', 'emailBase: en Gmail saca los puntos y todo lo que va después de +');
assert(R.emailBase('Ana+x+y@GMAIL.com') === 'ana@gmail.com', 'emailBase: Gmail con varios + y mayúsculas');
assert(R.emailBase('a.na@googlemail.com') === 'ana@gmail.com', 'emailBase: googlemail.com es lo mismo que gmail.com');
assert(R.emailBase('a.na+x@outlook.com') === 'a.na+x@outlook.com', 'emailBase: en otros dominios NO se tocan puntos ni + (podrían ser casillas distintas)');
assert(R.emailBase('') === '' && R.emailBase(null) === '' && R.emailBase('sin-arroba') === 'sin-arroba' && R.emailBase('@gmail.com') === '@gmail.com', 'emailBase: vacío, null y textos raros no rompen');
assert(R.esAutorreferido('ana+1@gmail.com', 'a.na@gmail.com') === true, 'esAutorreferido: alias de Gmail del mismo dueño → true');
assert(R.esAutorreferido('ana@gmail.com', 'beto@gmail.com') === false, 'esAutorreferido: personas distintas → false');
assert(R.esAutorreferido('a.na@outlook.com', 'ana@outlook.com') === false, 'esAutorreferido: en Outlook los puntos distinguen casillas → false');
assert(R.esAutorreferido('', 'ana@gmail.com') === false && R.esAutorreferido('ana@gmail.com', undefined) === false, 'esAutorreferido: si falta un email no se afirma nada (false)');

// ── el alta real (servicio de cuentas) con una base de mentira ──
function mundo() {
  const users = []; const referidosCreados = []; let ids = 0;
  const cadena = (v) => { const p = Promise.resolve(v); p.select = () => p; p.lean = () => p; return p; };
  const User = {
    findOne: (q) => cadena(users.find((u) => (q.email && u.email === q.email) || (q.codigoReferido && u.codigoReferido === q.codigoReferido)) || null),
    create: async (d) => { const u = { _id: 'u' + (++ids), ...d }; u.save = async () => u; users.push(u); return u; },
    generarCodigoUnico: async () => 'COD-' + (++ids),
    findByIdAndUpdate: (id, upd) => { const u = users.find((x) => x._id === id); if (u) Object.assign(u, upd); return cadena(u); },
    findByIdAndDelete: async () => {},
  };
  const advertencias = [];
  const cuentas = crearCuentas({
    User, Referido: { create: async (d) => { referidosCreados.push(d); } }, Log: { registrar: async () => {} },
    enviarCodigo: async () => true, limitar: async () => ({ ok: true }), secreto: process.env.JWT_SECRET,
    logger: { warn: (m) => advertencias.push(m), error() {} }, config: { exigirToken: false },
  });
  const alta = (email, codigo, extra = {}) => cuentas.registrar({ nombre: 'Persona', apellido: 'Prueba', email, password: 'Tr3s-gatos-azules', pais: 'Argentina', codigoReferidoUsado: codigo, ...extra }, { ip: '1.1.1.1' });
  return { User, users, referidosCreados, advertencias, alta };
}

(async () => {
  let m = mundo();
  // el referente: se registró con puntos en su Gmail (como lo guarda Google), con el código COD-ANA
  m.users.push({ _id: 'ref1', email: 'a.na@gmail.com', codigoReferido: 'COD-ANA', save: async () => {} });

  let r = await m.alta('ana+promo@gmail.com', 'COD-ANA');
  const yo = m.users.find((u) => u.email === 'ana@gmail.com') || m.users.find((u) => u._id !== 'ref1');
  assert(r.status === 201 && r.body.requiereVerificacion === true && !r.body.error, 'autorreferido (alias de Gmail): el alta responde 201 normal, sin ningún error visible');
  assert(yo && yo.codigoReferidoUsado === '' && yo.descuentoReferido === 0, 'autorreferido: la cuenta se crea SIN referido ni descuento');
  assert(m.referidosCreados.length === 0, 'autorreferido: no se crea ningún registro de Referido (no hay comisión para nadie)');
  assert(m.advertencias.some((a) => a.includes('autorreferido')), 'autorreferido: queda registrado en el log del servidor');
  assert(!JSON.stringify(r.body).toLowerCase().includes('referid'), 'autorreferido: la respuesta no menciona nada de referidos (no se le explica cómo evadir el control)');

  m = mundo();
  m.users.push({ _id: 'ref1', email: 'a.na@gmail.com', codigoReferido: 'COD-ANA', save: async () => {} });
  r = await m.alta('a.n.a@googlemail.com', 'COD-ANA');
  const g = m.users.find((u) => u._id !== 'ref1');
  assert(r.status === 201 && g.codigoReferidoUsado === '' && g.descuentoReferido === 0 && m.referidosCreados.length === 0, 'autorreferido con googlemail.com y puntos: tampoco se aplica');

  // ── el caso legítimo sigue igual ──
  m = mundo();
  m.users.push({ _id: 'ref1', email: 'a.na@gmail.com', codigoReferido: 'COD-ANA', save: async () => {} });
  r = await m.alta('beto@gmail.com', 'COD-ANA');
  const beto = m.users.find((u) => u._id !== 'ref1');
  assert(r.status === 201 && beto.codigoReferidoUsado === 'COD-ANA' && beto.descuentoReferido === 5000, 'una persona distinta con el código: el referido y el descuento de $5000 se aplican como siempre');
  assert(m.referidosCreados.length === 1 && m.referidosCreados[0].referente === 'ref1' && m.referidosCreados[0].referido === beto._id && m.referidosCreados[0].codigo === 'COD-ANA', 'una persona distinta: se crea el registro de Referido con el referente correcto');

  m = mundo();
  m.users.push({ _id: 'ref1', email: 'ana@outlook.com', codigoReferido: 'COD-ANA', save: async () => {} });
  r = await m.alta('a.na@outlook.com', 'COD-ANA');
  const out = m.users.find((u) => u._id !== 'ref1');
  assert(r.status === 201 && out.codigoReferidoUsado === 'COD-ANA' && m.referidosCreados.length === 1, 'en Outlook los puntos son otra casilla: ahí el referido SÍ se aplica (no se bloquea a nadie por error)');

  m = mundo();
  r = await m.alta('beto@gmail.com', 'CODIGO-INEXISTENTE');
  assert(r.status === 201 && m.users[0].codigoReferidoUsado === '' && m.referidosCreados.length === 0, 'un código que no existe: se ignora como antes');
  m = mundo();
  r = await m.alta('beto@gmail.com', '');
  assert(r.status === 201 && m.users[0].descuentoReferido === 0, 'sin código: alta normal');

  console.log('\n✅ Todos los tests de autorreferido pasaron.\n');
})().catch((e) => { console.error(e); process.exit(1); });
