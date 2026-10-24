// services/cuentas.service.js
// Alta de cuentas con verificación de email, sin Express (las rutas de auth.routes.js solo traducen a HTTP). Todo lo que toca el mundo de afuera
// llega inyectado (base de datos, envío de mail, limitador, reloj), así se prueba entero en tests/cuentas-service.test.js.
//
// Lo que antes no existía: cualquiera podía crear una cuenta con cualquier email y entraba al instante. Ahora:
//   1. el alta pasa por un token de formulario + campo trampa + topes por IP (contra robots),
//   2. la cuenta nace SIN verificar y no recibe sesión hasta escribir el código de 6 dígitos que llega al mail,
//   3. el código vence a los 15 minutos, se guarda como hash y admite 5 intentos,
//   4. los reenvíos y los intentos tienen topes por email y por IP.
'use strict';

const validator = require('validator');
const S = require('../lib/seguridad-cuentas');
const { mensajeEspera } = require('../lib/limite');

const HORA = 3600e3, DIA = 24 * HORA;
const GENERICO_REENVIO = 'Si ese email tiene una cuenta pendiente de confirmar, te enviamos un código nuevo.';

function crearCuentas({ User, Referido, Log, enviarCodigo, limitar, secreto, logger = console, ahora = Date.now, config = {}, verificarTurnstile = null }) {
  const cfg = {
    exigirVerificacion: config.exigirVerificacion !== false,   // VERIFICACION_EMAIL=off la apaga en una emergencia (ej.: el correo no funciona)
    exigirToken: config.exigirToken !== false,
    turnstileSecret: config.turnstileSecret || '',
    ...config,
  };
  const registrarLog = (datos) => Promise.resolve(Log && Log.registrar ? Log.registrar(datos) : null).catch(() => {});
  const err = (status, mensaje, extra = {}) => ({ status, body: { error: mensaje, errors: [{ msg: mensaje }], ...extra } });
  const canonico = (email) => validator.normalizeEmail(email) || email;

  // Genera un código nuevo, lo guarda (hash) y lo manda por mail. → true si salió el mail.
  async function emitirCodigo(user) {
    const codigo = S.generarCodigo();
    await User.findByIdAndUpdate(user._id, { verifCodigoHash: S.hashCodigo(codigo, user.email, secreto), verifExpira: new Date(ahora() + S.CODIGO_VIDA_MS), verifIntentos: 0, verifEnviadoEn: new Date(ahora()) });
    try { return !!(await enviarCodigo(user.email, user.nombre, codigo)); }
    catch (e) { logger.error && logger.error('[Cuentas] no se pudo enviar el código: ' + e.message); return false; }
  }

  async function registrar(b, { ip = 'desconocida' } = {}) {
    b = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    const t = ahora();

    const tope = await limitar([[`reg:ip:${ip}`, { max: 6, ventanaMs: HORA }], [`reg:ipd:${ip}`, { max: 15, ventanaMs: DIA }]]);
    if (!tope.ok) return err(429, mensajeEspera(tope.reintentarEnSeg), { codigo: 'DEMASIADOS_INTENTOS' });

    // Campo trampa: las personas no lo ven; los robots lo llenan. Se les responde "todo bien" para que no cambien de táctica.
    if (S.limpiar(b.sitio_web, 50)) {
      await registrarLog({ tipo: 'security_block', nivel: 'warn', mensaje: `Registro bloqueado (campo trampa): ${S.limpiar(b.email, 80)}`, ip });
      return { status: 201, body: { requiereVerificacion: true, email: S.limpiar(b.email, 120).toLowerCase() }, bloqueado: 'trampa' };
    }
    if (cfg.exigirToken) {
      const tk = S.revisarTokenFormulario(b.formToken, secreto, t);
      const reuso = tk.ok ? await limitar([[`ft:${tk.nonce}`, { max: 3, ventanaMs: 2 * HORA }]]) : { ok: false };
      if (!tk.ok || !reuso.ok) {
        await registrarLog({ tipo: 'security_block', nivel: 'warn', mensaje: `Registro bloqueado (formulario ${tk.motivo || 'reusado'}): ${S.limpiar(b.email, 80)}`, ip });
        return err(400, 'No pudimos validar el formulario. Recargá la página e intentá de nuevo.', { codigo: 'FORMULARIO_INVALIDO' });
      }
    }
    if (cfg.turnstileSecret) {
      const ok = verificarTurnstile ? await verificarTurnstile(b.turnstile, ip, cfg.turnstileSecret).catch(() => false) : false;
      if (!ok) return err(400, 'No pudimos comprobar que sos una persona. Probá de nuevo.', { codigo: 'CAPTCHA_INVALIDO' });
    }

    const n = S.validarNombre(b.nombre), a = S.validarNombre(b.apellido, { obligatorio: false }), e = S.validarEmail(b.email), c = S.validarCelular(b.celular);
    const malo = [n, a, e, c].find((x) => !x.ok);
    if (malo) return err(400, malo.error);
    const p = S.validarPassword(b.password, { email: e.valor, nombre: n.valor });
    if (!p.ok) return err(400, p.error);
    const email = canonico(e.valor);
    const pais = S.validarPais(b.pais).valor;

    const topeEmail = await limitar([[`reg:em:${email}`, { max: 4, ventanaMs: HORA }]]);
    if (!topeEmail.ok) return err(429, mensajeEspera(topeEmail.reintentarEnSeg), { codigo: 'DEMASIADOS_INTENTOS' });

    const existente = await User.findOne({ email }).select('+verifPedidoEn');
    let user = null, creada = false;
    if (existente) {
      const pendiente = existente.emailVerificado === false && existente.auth_provider === 'local';
      if (!pendiente) return err(409, 'Ya existe una cuenta con ese email');
      // Alta sin confirmar: nunca pudo entrar, así que no se pierde nada si se la reemplaza con lo nuevo; pero no se pisa una de hace instantes
      // (así nadie puede cambiarle la contraseña a una persona que se está registrando justo ahora).
      if (existente.verifPedidoEn && t - new Date(existente.verifPedidoEn).getTime() < 5 * 60e3) {
        return err(409, 'Ya te enviamos un código a ese email hace un momento. Revisá tu bandeja (y el spam) o esperá unos minutos para volver a registrarte.', { codigo: 'ALTA_RECIENTE', requiereVerificacion: true, email });
      }
      existente.nombre = n.valor; existente.apellido = a.valor; existente.celular = c.valor; existente.pais = pais; existente.password = p.valor; existente.verifPedidoEn = new Date(t);
      await existente.save();
      user = existente;
    } else {
      if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).startsWith('cambia_esto')) return err(500, 'El servidor no está configurado correctamente.');
      const codigoUsado = String(b.codigoReferidoUsado || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
      const referente = codigoUsado ? await User.findOne({ codigoReferido: codigoUsado }).lean() : null;
      user = await User.create({
        nombre: n.valor, apellido: a.valor, email, password: p.valor, celular: c.valor, pais, auth_provider: 'local',
        codigoReferido: await User.generarCodigoUnico(n.valor), codigoReferidoUsado: referente ? codigoUsado : '', descuentoReferido: referente ? 5000 : 0,
        emailVerificado: cfg.exigirVerificacion ? false : true, verifPedidoEn: new Date(t),
      });
      creada = true;
      if (referente && Referido) await Referido.create({ referente: referente._id, referido: user._id, codigo: codigoUsado }).catch((e2) => logger.warn && logger.warn('[Cuentas] no se pudo crear Referido: ' + e2.message));
    }

    await registrarLog({ userId: user._id, tipo: 'auth_register', mensaje: `Nuevo registro${cfg.exigirVerificacion ? ' (pendiente de verificar email)' : ''}: ${email}`, ip });
    if (!cfg.exigirVerificacion) return { status: 201, body: { requiereVerificacion: false, email }, usuario: user };

    if (!(await emitirCodigo(user))) {
      if (creada) await User.findByIdAndDelete(user._id).catch(() => {});
      return err(503, 'No pudimos enviarte el código de verificación. Intentá de nuevo en unos minutos.', { codigo: 'CORREO_NO_ENVIADO' });
    }
    return { status: 201, body: { requiereVerificacion: true, email } };
  }

  async function verificarEmail(b, { ip = 'desconocida' } = {}) {
    b = b && typeof b === 'object' ? b : {};
    const e = S.validarEmail(b.email); const codigo = String(b.codigo ?? '').replace(/\s/g, '');
    if (!e.ok || !/^\d{6}$/.test(codigo)) return err(400, 'Escribí el código de 6 dígitos que te enviamos.');
    const email = canonico(e.valor);
    const tope = await limitar([[`ver:ip:${ip}`, { max: 30, ventanaMs: HORA }], [`ver:em:${email}`, { max: 12, ventanaMs: HORA }]]);
    if (!tope.ok) return err(429, mensajeEspera(tope.reintentarEnSeg), { codigo: 'DEMASIADOS_INTENTOS' });

    const generico = err(400, 'El código es incorrecto o venció. Pedí uno nuevo.', { codigo: 'CODIGO_INVALIDO' });
    const u = await User.findOne({ email }).select('+verifCodigoHash +verifExpira');
    if (!u || u.emailVerificado !== false || !u.verifCodigoHash) return generico;
    if (!u.verifExpira || new Date(u.verifExpira).getTime() < ahora()) return err(400, 'El código venció. Pedí uno nuevo.', { codigo: 'CODIGO_VENCIDO' });

    // Atómico: aunque lleguen 100 pedidos a la vez, solo se comparan hasta CODIGO_MAX_INTENTOS veces por código.
    const antes = await User.findOneAndUpdate({ _id: u._id, verifIntentos: { $lt: S.CODIGO_MAX_INTENTOS } }, { $inc: { verifIntentos: 1 } }, { new: false }).select('+verifIntentos');
    if (!antes) return err(429, 'Probaste demasiadas veces. Pedí un código nuevo.', { codigo: 'INTENTOS_AGOTADOS' });
    if (!S.codigoCoincide(codigo, u.email, u.verifCodigoHash, secreto)) {
      const quedan = S.CODIGO_MAX_INTENTOS - ((antes.verifIntentos || 0) + 1);
      await registrarLog({ userId: u._id, tipo: 'auth_fail', nivel: 'warn', mensaje: 'Código de verificación incorrecto', ip });
      return err(400, quedan > 0 ? `Código incorrecto. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.` : 'Código incorrecto. Pedí uno nuevo.', { codigo: 'CODIGO_INCORRECTO', quedan });
    }
    const listo = await User.findByIdAndUpdate(u._id, { emailVerificado: true, emailVerificadoEn: new Date(ahora()), $unset: { verifCodigoHash: 1, verifExpira: 1, verifEnviadoEn: 1 }, verifIntentos: 0 }, { new: true });
    await registrarLog({ userId: u._id, tipo: 'auth_verify', mensaje: 'Email verificado', ip });
    return { status: 200, body: { ok: true }, usuario: listo || u };
  }

  async function reenviarCodigo(b, { ip = 'desconocida' } = {}) {
    b = b && typeof b === 'object' ? b : {};
    const e = S.validarEmail(b.email);
    if (!e.ok) return { status: 200, body: { msg: GENERICO_REENVIO } };       // no se revela nada
    const email = canonico(e.valor);
    const tope = await limitar([[`rev:ip:${ip}`, { max: 20, ventanaMs: HORA }], [`rev:em:${email}`, { max: 5, ventanaMs: HORA }]]);
    if (!tope.ok) return err(429, mensajeEspera(tope.reintentarEnSeg), { codigo: 'DEMASIADOS_INTENTOS' });
    const u = await User.findOne({ email }).select('+verifEnviadoEn');
    if (u && u.emailVerificado === false && u.auth_provider === 'local') {
      const espera = u.verifEnviadoEn ? S.REENVIO_ESPERA_MS - (ahora() - new Date(u.verifEnviadoEn).getTime()) : 0;
      if (espera > 0) return err(429, `Esperá ${Math.ceil(espera / 1000)} segundos para pedir otro código.`, { codigo: 'ESPERAR', esperarSeg: Math.ceil(espera / 1000) });
      await emitirCodigo(u);
    }
    return { status: 200, body: { msg: GENERICO_REENVIO } };
  }

  return { registrar, verificarEmail, reenviarCodigo, emitirCodigo, canonico };
}

// Verificación del captcha opcional de Cloudflare Turnstile (se activa cargando TURNSTILE_SECRET en el servidor).
async function verificarTurnstileCloudflare(token, ip, secreto) {
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: secreto, response: String(token), remoteip: String(ip || '') }) });
  const j = await r.json().catch(() => ({}));
  return j.success === true;
}

module.exports = { crearCuentas, verificarTurnstileCloudflare };
