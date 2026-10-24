// tests/seguridad-cuentas.test.js — reglas de validación, códigos de verificación, token de formulario, limitador y vínculo con Google/Facebook.
'use strict';
const S = require('../lib/seguridad-cuentas');
const L = require('../lib/limite');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

(async () => {
  console.log('\n[seguridad-cuentas] Tests:');

  // ── nombre ──
  for (const ok of ['Juan', 'María José', "D'Angelo", 'Pérez-Gómez', 'Ñandú', 'Li Wei']) assert(S.validarNombre(ok).ok, `nombre válido: ${ok}`);
  for (const mal of ['', 'a', 'J', 'Juan123', '<script>alert(1)</script>', 'www.estafa.com', 'visita http://x.io', 'user@mail.com', 'Ganá plata.ar', 'aaaaaaaa', '{"$gt":""}', '1234'])
    assert(!S.validarNombre(mal).ok, `nombre rechazado: ${JSON.stringify(mal)}`);
  assert(S.validarNombre('  Ana   María ').valor === 'Ana María', 'el nombre se limpia de espacios de más');
  assert(S.validarNombre('x'.repeat(200)).ok === false, 'un nombre larguísimo se rechaza');
  assert(S.validarNombre('', { obligatorio: false }).ok && S.validarNombre('', { obligatorio: false }).valor === '', 'el apellido puede ir vacío');
  assert(!S.validarNombre({ $gt: '' }).ok && !S.validarNombre(['a', 'b']).ok, 'un objeto o lista en lugar de texto no pasa');

  // ── celular ──
  assert(S.validarCelular('').ok && S.validarCelular('+54 9 11 5555-1234').ok && S.validarCelular('(011) 4555 1234').ok, 'celular: vacío o con formato común');
  assert(!S.validarCelular('abc').ok && !S.validarCelular('123').ok && !S.validarCelular('1'.repeat(20)).ok && !S.validarCelular('55;DROP').ok, 'celular: letras, muy corto, muy largo o con símbolos se rechaza');

  // ── email ──
  assert(S.validarEmail('Ana@Gmail.com').valor === 'ana@gmail.com', 'el email se pasa a minúsculas');
  for (const mal of ['', 'sin-arroba', 'a@b', 'a b@c.com', 'a@@c.com', '<x>@c.com', 'a@c.com,b@c.com', 'x'.repeat(260) + '@c.com']) assert(!S.validarEmail(mal).ok, `email inválido: ${mal.slice(0, 30)}`);
  for (const d of ['mailinator.com', 'guerrillamail.com', 'x.yopmail.com', '10minutemail.com']) assert(!S.validarEmail('a@' + d).ok, `email descartable bloqueado: ${d}`);
  assert(S.validarEmail('juan@gmail.com').ok && S.validarEmail('info@mi-negocio.com.ar').ok, 'emails normales pasan');

  // ── contraseña ──
  for (const ok of ['Tr3s-gatos-azules', 'Cafe_con_Leche7', 'Mi.perro.Rufo.2020']) assert(S.validarPassword(ok, { email: 'juan@gmail.com', nombre: 'Juan' }).ok, `contraseña aceptada: ${ok}`);
  for (const [mal, why] of [['corta1A', 'muy corta'], ['todominusculas1', 'sin mayúscula'], ['TODOMAYUSCULAS1', 'sin minúscula'], ['SinNumeros', 'sin número'], ['Password1', 'común'], ['Qwerty123', 'común'], ['Argentina2024', 'común'], ['Hola1234', 'común'], ['Aa123456', 'secuencia'], ['Boca1234', 'común'], ['Contraseña1', 'común']])
    assert(!S.validarPassword(mal).ok, `contraseña rechazada (${why}): ${mal}`);
  assert(!S.validarPassword('A1' + 'a'.repeat(80)).ok, 'más de 72 caracteres se rechaza (bcrypt ignora el resto)');
  assert(!S.validarPassword('Juanperez2024X', { email: 'juanperez@gmail.com' }).ok, 'no puede contener el email');
  assert(!S.validarPassword('Roberto2024xx', { nombre: 'Roberto' }).ok, 'no puede contener el nombre');
  assert(!S.validarPassword(undefined).ok && !S.validarPassword({ a: 1 }).ok, 'tipos raros no pasan');

  // ── códigos de verificación ──
  const c = S.generarCodigo();
  assert(/^\d{6}$/.test(c), 'el código tiene 6 dígitos');
  assert(new Set(Array.from({ length: 200 }, S.generarCodigo)).size > 150, 'los códigos varían (no son predecibles)');
  const h = S.hashCodigo(c, 'Ana@Gmail.com', 'secreto');
  assert(h.length === 64 && !h.includes(c), 'en la base se guarda un hash, no el código');
  assert(S.codigoCoincide(c, 'ana@gmail.com', h, 'secreto'), 'el código correcto coincide (sin importar mayúsculas del email)');
  assert(!S.codigoCoincide('000000' === c ? '111111' : '000000', 'ana@gmail.com', h, 'secreto'), 'un código incorrecto no coincide');
  assert(!S.codigoCoincide(c, 'otro@gmail.com', h, 'secreto') && !S.codigoCoincide(c, 'ana@gmail.com', h, 'otra-clave'), 'el código sirve solo para ese email y esa clave del servidor');
  assert(!S.codigoCoincide('12345', 'a@b.com', h, 's') && !S.codigoCoincide('abcdef', 'a@b.com', h, 's') && !S.codigoCoincide(c, 'a@b.com', '', 's') && !S.codigoCoincide(c, 'a@b.com', null, 's'), 'formato inválido o sin código guardado no coincide');

  // ── token de formulario ──
  const t0 = 1_700_000_000_000;
  const tok = S.crearTokenFormulario('sec', t0);
  assert(S.revisarTokenFormulario(tok, 'sec', t0 + 5000).ok, 'un token con más de 3 s de edad sirve');
  assert(S.revisarTokenFormulario(tok, 'sec', t0 + 500).motivo === 'rapido', 'enviado en menos de 3 s: parece un robot');
  assert(S.revisarTokenFormulario(tok, 'sec', t0 + 3 * 3600e3).motivo === 'vencido', 'vencido a las 2 horas');
  assert(S.revisarTokenFormulario(tok, 'otra', t0 + 5000).motivo === 'firma', 'firmado con otra clave: no sirve');
  assert(S.revisarTokenFormulario(tok.slice(0, -2) + 'xx', 'sec', t0 + 5000).motivo === 'firma', 'un token alterado no sirve');
  assert(S.revisarTokenFormulario('', 'sec').motivo === 'falta' && S.revisarTokenFormulario('a.b', 'sec').motivo === 'falta' && S.revisarTokenFormulario(undefined, 'sec').motivo === 'falta', 'sin token no pasa');
  assert(S.revisarTokenFormulario(S.crearTokenFormulario('sec', t0 + 99999999), 'sec', t0).motivo === 'futuro', 'un token del futuro no sirve');

  // ── limitador (con una base de mentira) ──
  const filas = new Map();
  const Falso = {
    async findOneAndUpdate(filtro, upd, op = {}) {
      const f = filas.get(filtro._id);
      const vigente = f && (!filtro.expira || f.expira > filtro.expira.$gt);
      if (!vigente && filtro.expira) return null;                       // no existe o venció
      if (!f && !op.upsert) return null;
      const nueva = f ? { ...f } : { _id: filtro._id, n: 0 };
      if (upd.$inc) nueva.n += upd.$inc.n; if (upd.$set) Object.assign(nueva, upd.$set);
      filas.set(filtro._id, nueva); return nueva;
    },
  };
  const t = 1_800_000_000_000;
  const r1 = await L.consumir('reg:ip:1.1.1.1', { max: 3, ventanaMs: 60000 }, Falso, t);
  await L.consumir('reg:ip:1.1.1.1', { max: 3, ventanaMs: 60000 }, Falso, t + 1); await L.consumir('reg:ip:1.1.1.1', { max: 3, ventanaMs: 60000 }, Falso, t + 2);
  const r4 = await L.consumir('reg:ip:1.1.1.1', { max: 3, ventanaMs: 60000 }, Falso, t + 3);
  assert(r1.ok && r1.n === 1 && !r4.ok && r4.n === 4 && r4.reintentarEnSeg > 0, 'el cuarto intento con tope 3 se frena y dice cuánto esperar');
  assert((await L.consumir('reg:ip:2.2.2.2', { max: 3, ventanaMs: 60000 }, Falso, t)).ok, 'otra IP tiene su propio contador');
  assert((await L.consumir('reg:ip:1.1.1.1', { max: 3, ventanaMs: 60000 }, Falso, t + 61000)).ok, 'pasada la ventana, el contador arranca de nuevo');
  const multi = await L.consumirTodos([['a', { max: 5, ventanaMs: 1000 }], ['b', { max: 0, ventanaMs: 1000 }]], Falso, t);
  assert(!multi.ok && multi.clave === 'b', 'con varios topes se corta en el primero que se pasa');
  const roto = await L.consumir('x', { max: 1, ventanaMs: 1000 }, { findOneAndUpdate: async () => { throw new Error('base caída'); } }, t);
  assert(roto.ok && roto.falloBase, 'si la base falla no se bloquea a todo el mundo');
  assert(/segundos/.test(L.mensajeEspera(30)) && /minutos/.test(L.mensajeEspera(600)), 'el mensaje de espera habla en segundos o minutos');

  // ── Google / Facebook ──
  assert(S.decidirVinculoOAuth(null, { proveedor: 'google' }).crear === true, 'si la cuenta no existe, se crea ya verificada');
  const vieja = S.decidirVinculoOAuth({ tieneClave: true, emailVerificado: undefined }, { proveedor: 'google' });
  assert(vieja.vincular && vieja.borrarClave && vieja.cerrarSesiones && vieja.marcarVerificado, 'cuenta con contraseña nunca verificada: al entrar con Google se borra la contraseña y se cierran las sesiones (evita el secuestro previo)');
  const sinVerif = S.decidirVinculoOAuth({ tieneClave: true, emailVerificado: false }, { proveedor: 'facebook' });
  assert(sinVerif.borrarClave && sinVerif.cerrarSesiones, 'cuenta registrada pero sin verificar: igual');
  const probada = S.decidirVinculoOAuth({ tieneClave: true, emailVerificado: true }, { proveedor: 'google' });
  assert(probada.vincular && !probada.borrarClave && !probada.cerrarSesiones, 'cuenta verificada por código: se conserva su contraseña');
  assert(!S.decidirVinculoOAuth({ tieneClave: false, emailVerificado: undefined }, { proveedor: 'google' }).borrarClave, 'cuenta sin contraseña: no hay nada que borrar');
  assert(S.decidirVinculoOAuth({ tieneClave: true }, { proveedor: 'google', emailVerificadoPorProveedor: false }).rechazar === true, 'si el proveedor no confirmó el email, se rechaza');
  assert(S.decidirVinculoOAuth(null, { proveedor: 'google', emailVerificadoPorProveedor: false }).rechazar === true, 'tampoco se crea una cuenta nueva si el proveedor no confirmó el email');

  console.log('\n✅ Todos los tests de seguridad de cuentas pasaron.\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
