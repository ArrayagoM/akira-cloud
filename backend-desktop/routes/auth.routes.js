// routes/auth.routes.js
// Copia recortada de backend/routes/auth.routes.js: mismo login/registro/
// OAuth/JWT (para que un usuario del SaaS y del software de escritorio
// compartan cuenta sin fricción). Se omiten a propósito, por ahora:
//   - /debug y /cleanup-dev (rutas de diagnóstico de desarrollo)
//   (forgot/reset-password y generar-codigo se incorporaron al migrar toda la
//   plataforma a este servidor; el email usa SMTP_* si está configurado.)
'use strict';

const router = require('express').Router();
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Log = require('../models/Log');
const Referido = require('../models/Referido');
const { requireAuth, generarJWT } = require('../middleware/auth');
const logger = require('../config/logger');
const { expiracionSegunCliente, payloadDe, evaluarRenovacion } = require('../lib/sesion');
const S = require('../lib/seguridad-cuentas');
const { consumir, consumirTodos, mensajeEspera } = require('../lib/limite');
const { crearCuentas } = require('../services/cuentas.service');

// Alta con verificación de email (lógica en services/cuentas.service.js).
// Interruptores de emergencia por variable de entorno: VERIFICACION_EMAIL=off (si el correo no funciona), REGISTRO_TOKEN=off.
const cuentas = crearCuentas({
  User, Referido, Log, logger,
  enviarCodigo: (email, nombre, codigo) => require('../services/email.service').enviarCodigoVerificacion(email, nombre, codigo),
  limitar: (lista) => consumirTodos(lista),
  secreto: process.env.JWT_SECRET,
  // El captcha de Cloudflare Turnstile está listo en el servidor (services/cuentas.service.js) pero NO conectado a la pantalla de registro:
  // por eso no se lee TURNSTILE_SECRET acá (activarlo sin el widget impediría todos los registros).
  config: { exigirVerificacion: process.env.VERIFICACION_EMAIL !== 'off', exigirToken: process.env.REGISTRO_TOKEN !== 'off' },
});

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/form-token — lo pide el formulario de registro al abrirse (contra robots que mandan el pedido directo)
// ─────────────────────────────────────────────────────────────
router.get('/form-token', async (req, res) => {
  const t = await consumir(`ftk:ip:${req.ip}`, { max: 60, ventanaMs: 3600e3 });
  if (!t.ok) return res.status(429).json({ error: mensajeEspera(t.reintentarEnSeg) });
  res.set('Cache-Control', 'no-store');
  res.json({ token: S.crearTokenFormulario(process.env.JWT_SECRET) });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/register — crea la cuenta SIN verificar y manda un código al email (no entrega sesión hasta confirmarlo)
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const r = await cuentas.registrar(req.body, { ip: req.ip });
    if (r.usuario) { // solo con VERIFICACION_EMAIL=off: se comporta como antes
      const token = generarJWT(r.usuario._id, 0, { expiresIn: expiracionSegunCliente(req) });
      return res.status(201).json({ token, user: r.usuario.toJSON() });
    }
    res.status(r.status).json(r.body);
  } catch (err) {
    logger.error('[Auth] Error register: ' + (err?.message || String(err)));
    if (err.code === 11000) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    res.status(500).json({ error: 'Error al registrar. Intentá de nuevo.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/verificar-email { email, codigo } — confirma el email y entrega la sesión
// ─────────────────────────────────────────────────────────────
router.post('/verificar-email', async (req, res) => {
  try {
    const r = await cuentas.verificarEmail(req.body, { ip: req.ip });
    if (r.usuario) {
      const token = generarJWT(r.usuario._id, r.usuario.tokenVersion ?? 0, { expiresIn: expiracionSegunCliente(req) });
      return res.json({ token, user: r.usuario.toJSON() });
    }
    res.status(r.status).json(r.body);
  } catch (err) {
    logger.error('[Auth] Error verificar-email: ' + (err?.message || String(err)));
    res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/reenviar-codigo { email } — siempre responde igual (no revela si el email existe)
// ─────────────────────────────────────────────────────────────
router.post('/reenviar-codigo', async (req, res) => {
  try { const r = await cuentas.reenviarCodigo(req.body, { ip: req.ip }); res.status(r.status).json(r.body); }
  catch (err) { logger.error('[Auth] Error reenviar-codigo: ' + (err?.message || String(err))); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' }); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────────────────────
router.post(
  '/login',
  [body('email').isString().isLength({ max: 254 }).isEmail().normalizeEmail(), body('password').isString().isLength({ min: 1, max: 200 })],
  async (req, res, next) => {
    const tope = await consumir(`login:ip:${req.ip}`, { max: 40, ventanaMs: 15 * 60e3 }); // en la base: el límite en memoria se reinicia en cada arranque del servidor
    if (!tope.ok) return res.status(429).json({ error: mensajeEspera(tope.reintentarEnSeg) });
    const validErr = handleValidation(req, res);
    if (validErr !== null) return;

    const candidato = await User.findOne({ email: req.body.email.toLowerCase() }).select('+loginFailedCount +loginLockedUntil');
    if (candidato?.loginLockedUntil && candidato.loginLockedUntil > new Date()) {
      const minutosRestantes = Math.ceil((candidato.loginLockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `Cuenta bloqueada por demasiados intentos. Intentá en ${minutosRestantes} minuto${minutosRestantes === 1 ? '' : 's'}.`,
      });
    }

    passport.authenticate('local', async (err, user, info) => {
      if (err) return next(err);

      if (!user) {
        if (candidato) {
          const nuevoCount = (candidato.loginFailedCount || 0) + 1;
          const update = { loginFailedCount: nuevoCount };
          if (nuevoCount >= 5) {
            update.loginLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            update.loginFailedCount = 0;
          }
          await User.findByIdAndUpdate(candidato._id, update).catch(() => {});
        }
        await Log.registrar({ tipo: 'auth_fail', nivel: 'warn', mensaje: `Login fallido (desktop) para: ${req.body.email}`, ip: req.ip });
        return res.status(401).json({ error: info?.message || 'Credenciales incorrectas' });
      }

      // Cuenta creada con email y contraseña que todavía no confirmó su email: no entra hasta escribir el código.
      if (user.emailVerificado === false) {
        await cuentas.reenviarCodigo({ email: user.email }, { ip: req.ip }).catch(() => {});
        return res.status(403).json({ codigo: 'EMAIL_NO_VERIFICADO', error: 'Confirmá tu email para entrar. Te enviamos un código.', email: user.email });
      }

      await User.findByIdAndUpdate(user._id, {
        ultimoLogin: new Date(),
        ipUltimoLogin: req.ip,
        $inc: { loginCount: 1 },
        loginFailedCount: 0,
        loginLockedUntil: null,
      });

      await Log.registrar({ userId: user._id, tipo: 'auth_login', mensaje: 'Login exitoso (desktop)', ip: req.ip, userAgent: req.headers['user-agent'] });

      const token = generarJWT(user._id, user.tokenVersion ?? 0, { expiresIn: expiracionSegunCliente(req) });
      res.json({ token, user: user.toJSON() });
    })(req, res, next);
  },
);

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/me
// ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toJSON() });
});

// ───────────────────────────────────────────────────────
//  POST /api/auth/renovar — cambia la sesión actual (todavía vigente) por una nueva, para que la app de escritorio no venza mientras se usa.
//  No renueva sesiones de más de 180 días desde el ingreso con contraseña (ver lib/sesion.js) y respeta cuenta bloqueada y tokenVersion
//  (requireAuth ya los controla: cambiar la contraseña o cerrar sesión en todos invalida también esta renovación).
// ───────────────────────────────────────────────────────
router.post('/renovar', requireAuth, async (req, res) => {
  try {
    const actual = payloadDe((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    const ev = evaluarRenovacion(actual);
    if (!ev.ok) return res.status(401).json({ error: ev.motivo === 'sesion_muy_antigua' ? 'La sesión es muy antigua: volvé a ingresar con tu contraseña.' : 'Sesión inválida', motivo: ev.motivo });
    const u = await User.findById(req.user._id).select('tokenVersion').lean();
    const token = generarJWT(req.user._id, u?.tokenVersion ?? 0, { expiresIn: expiracionSegunCliente(req), oa: ev.oa });
    res.json({ token });
  } catch (err) {
    logger.error('[Auth] renovar: ' + err.message);
    res.status(500).json({ error: 'No se pudo renovar la sesión' });
  }
});

// ───────────────────────────────────────────────────────
//  GET/PUT /api/auth/alertas — preferencias de las alertas operativas por email
//  (avisan si el bot se cae o vuelve; por defecto activadas)
// ───────────────────────────────────────────────────────
router.get('/alertas', requireAuth, (req, res) => {
  res.json({ email: req.user.alertas?.email !== false, push: req.user.alertas?.push !== false });
});
router.put('/alertas', requireAuth, async (req, res) => {
  const cambios = {};
  for (const k of ['email', 'push']) {
    if (req.body?.[k] === undefined) continue;
    if (typeof req.body[k] !== 'boolean') return res.status(400).json({ error: 'Valor inválido' });
    cambios[`alertas.${k}`] = req.body[k];
  }
  if (!Object.keys(cambios).length) return res.status(400).json({ error: 'Valor inválido' });
  const u = await User.findByIdAndUpdate(req.user._id, cambios, { new: true });
  res.json({ email: u?.alertas?.email !== false, push: u?.alertas?.push !== false });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/generar-codigo — genera codigoReferido si el usuario no tiene uno
// ─────────────────────────────────────────────────────────────
router.post('/generar-codigo', requireAuth, async (req, res) => {
  try {
    if (req.user.codigoReferido) {
      return res.json({ codigoReferido: req.user.codigoReferido });
    }

    const codigo = await User.generarCodigoUnico(req.user.nombre);
    await User.findByIdAndUpdate(req.user._id, { codigoReferido: codigo });
    logger.info(`[Auth] Código referido generado para ${req.user.email}: ${codigo}`);
    res.json({ codigoReferido: codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/auth/password
// ─────────────────────────────────────────────────────────────
router.put(
  '/password',
  requireAuth,
  [
    body('passwordActual').isString().isLength({ min: 1, max: 200 }).withMessage('Ingresá tu contraseña actual'),
    body('passwordNueva').isString().isLength({ min: 8, max: 200 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
  ],
  async (req, res) => {
    const validErr = handleValidation(req, res);
    if (validErr !== null) return;
    const tope = await consumir(`pw:u:${req.user._id}`, { max: 10, ventanaMs: 3600e3 });
    if (!tope.ok) return res.status(429).json({ error: mensajeEspera(tope.reintentarEnSeg) });
    const pw = S.validarPassword(req.body.passwordNueva, { email: req.user.email, nombre: req.user.nombre });
    if (!pw.ok) return res.status(400).json({ error: pw.error, errors: [{ msg: pw.error }] });
    if (req.body.passwordNueva === req.body.passwordActual) return res.status(400).json({ error: 'La contraseña nueva tiene que ser distinta de la actual.' });

    try {
      const user = await User.findById(req.user._id).select('+password');

      if (user.auth_provider !== 'local') {
        return res
          .status(400)
          .json({ error: 'Los usuarios de OAuth no pueden cambiar contraseña aquí' });
      }

      const ok = await user.compararPassword(req.body.passwordActual);
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

      user.password = req.body.passwordNueva;
      await user.save();

      // Invalidar todos los tokens anteriores incrementando tokenVersion
      await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });
      const tokenNuevo = generarJWT(user._id, (user.tokenVersion ?? 0) + 1);

      await Log.registrar({
        userId: user._id,
        tipo: 'config_update',
        mensaje: 'Contraseña cambiada',
        ip: req.ip,
      });
      res.json({ msg: 'Contraseña actualizada correctamente', token: tokenNuevo });
    } catch (err) {
      res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
  },
);

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/baja-novedades?t=<token> — link del pie de los emails
// ─────────────────────────────────────────────────────────────
router.get('/baja-novedades', async (req, res) => {
  const pagina = (titulo, texto) => res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Akira Cloud</title><body style="margin:0;background:#050505;font-family:-apple-system,Segoe UI,sans-serif;color:#e5e5e5;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px"><div style="max-width:420px;text-align:center"><div style="font-size:40px">🤖</div><h2 style="color:#fff">${titulo}</h2><p style="color:#aaa;line-height:1.5">${texto}</p><a href="https://akiracloud.lat" style="color:#00e87b">Ir a Akira Cloud</a></div></body>`);
  try {
    const { id, p } = require('jsonwebtoken').verify(String(req.query.t || ''), process.env.JWT_SECRET);
    if (p !== 'baja-novedades') throw new Error('token inválido');
    await User.findByIdAndUpdate(id, { novedadesActivas: false });
    return pagina('Listo, no te enviaremos más novedades', 'Seguís recibiendo los avisos importantes de tu cuenta (pagos, recuperar contraseña).');
  } catch {
    return res.status(400) && pagina('Link inválido', 'Este link de baja no es válido o está incompleto.');
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  await Log.registrar({ userId: req.user._id, tipo: 'auth_logout', mensaje: 'Logout (desktop)', ip: req.ip });
  res.json({ msg: 'Sesión cerrada' });
});

// ─────────────────────────────────────────────────────────────
//  Códigos OAuth efímeros (mismo patrón que backend/routes/auth.routes.js)
// ─────────────────────────────────────────────────────────────
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const OAuthCode = require('../models/OAuthCode');

// Guardado en Mongo (no en memoria): en Vercel el callback y el canje del
// código corren en invocaciones distintas, sin memoria compartida.
async function crearCodigoOAuth(token) {
  const code = crypto.randomBytes(32).toString('hex');
  await OAuthCode.create({ code, token, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  return code;
}

router.get('/oauth-token', async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Falta el código' });
  // findOneAndDelete = un solo uso, atómico
  const entry = await OAuthCode.findOneAndDelete({ code });
  if (!entry || entry.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Código inválido o expirado' });
  }
  res.json({ token: entry.token });
});

// ── Flujo de escritorio ──────────────────────────────────────
// La app de escritorio abre el navegador en /google?desktop_port=NNNN y
// escucha en http://127.0.0.1:NNNN. El puerto viaja en `state`, firmado
// (el callback de Google vuelve por el navegador, no hay sesión de servidor
// donde guardarlo). Solo se acepta redirigir a loopback, nunca a otro host.
function stateDeEscritorio(req) {
  const port = parseInt(req.query.desktop_port, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return undefined;
  return jwt.sign({ dp: port }, process.env.JWT_SECRET, { expiresIn: '10m' });
}

function puertoDeEscritorio(req) {
  if (!req.query.state) return null;
  try {
    const { dp } = jwt.verify(String(req.query.state), process.env.JWT_SECRET);
    return Number.isInteger(dp) ? dp : null;
  } catch {
    return null;
  }
}

function iniciarOAuth(proveedor, scope) {
  return (req, res, next) => {
    const opts = { session: false, scope };
    const state = stateDeEscritorio(req);
    if (state) opts.state = state;
    passport.authenticate(proveedor, opts)(req, res, next);
  };
}

function callbackOAuth(proveedor, etiqueta) {
  const autenticar = passport.authenticate(proveedor, {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=${proveedor}_failed`,
  });
  const finalizar = async (req, res) => {
    const userFull = await User.findById(req.user._id).select('tokenVersion').lean();
    const puerto = puertoDeEscritorio(req);
    const token = generarJWT(req.user._id, userFull?.tokenVersion ?? 0, { expiresIn: puerto ? (process.env.DESKTOP_JWT_EXPIRES_IN || '30d') : undefined });
    await User.findByIdAndUpdate(req.user._id, { ultimoLogin: new Date(), $inc: { loginCount: 1 } });
    await Log.registrar({ userId: req.user._id, tipo: 'auth_login', mensaje: `Login ${etiqueta} (desktop)`, ip: req.ip });
    const code = await crearCodigoOAuth(token);
    if (puerto) return res.redirect(`http://127.0.0.1:${puerto}/callback?code=${code}`);
    res.redirect(`${process.env.FRONTEND_URL}/oauth-callback?code=${code}`);
  };
  return [autenticar, finalizar];
}

router.get('/google', iniciarOAuth('google', ['profile', 'email']));
router.get('/google/callback', ...callbackOAuth('google', 'Google'));

router.get('/facebook', iniciarOAuth('facebook', ['email']));
router.get('/facebook/callback', ...callbackOAuth('facebook', 'Facebook'));

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────
router.post('/forgot-password',
  [body('email').isString().isLength({ max: 254 }).isEmail().normalizeEmail()],
  async (req, res) => {
    const validErr = handleValidation(req, res);
    if (validErr !== null) return;
    try {
      // Siempre responder igual — no revelar si el email existe
      const okMsg = { msg: 'Si ese email está registrado, recibirás un link en minutos.' };
      const topeIp = await consumir(`fp:ip:${req.ip}`, { max: 10, ventanaMs: 3600e3 });
      if (!topeIp.ok) return res.status(429).json({ error: mensajeEspera(topeIp.reintentarEnSeg) });
      const topeEmail = await consumir(`fp:em:${req.body.email.toLowerCase()}`, { max: 3, ventanaMs: 3600e3 });
      if (!topeEmail.ok) return res.json(okMsg); // sin enviar nada: así no se puede usar para llenarle la casilla a alguien
      const user = await User.findOne({ email: req.body.email.toLowerCase() });
      if (!user || user.auth_provider !== 'local') return res.json(okMsg);

      const token = require('crypto').randomBytes(32).toString('hex');
      const hash  = require('crypto').createHash('sha256').update(token).digest('hex');

      await User.findByIdAndUpdate(user._id, {
        resetPasswordToken:   hash,
        resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
      });

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
      const { enviarRecuperoPassword } = require('../services/email.service');
      await enviarRecuperoPassword(user.email, user.nombre, resetUrl);

      await Log.registrar({ userId: user._id, tipo: 'auth_reset_request', mensaje: 'Solicitud de recupero de contraseña', ip: req.ip });
      res.json(okMsg);
    } catch (err) {
      logger.error('[Auth] forgot-password error:', err.message);
      res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────
router.post('/reset-password',
  [
    body('email').isString().isLength({ max: 254 }).isEmail().normalizeEmail(),
    body('token').isString().isLength({ min: 20, max: 200 }),
    body('password').isString().isLength({ min: 8, max: 200 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  ],
  async (req, res) => {
    const validErr = handleValidation(req, res);
    if (validErr !== null) return;
    const topeRp = await consumir(`rp:ip:${req.ip}`, { max: 20, ventanaMs: 3600e3 });
    if (!topeRp.ok) return res.status(429).json({ error: mensajeEspera(topeRp.reintentarEnSeg) });
    const pw = S.validarPassword(req.body.password, { email: req.body.email });
    if (!pw.ok) return res.status(400).json({ error: pw.error, errors: [{ msg: pw.error }] });
    try {
      const hash = require('crypto').createHash('sha256').update(req.body.token).digest('hex');
      const user = await User.findOne({
        email:                req.body.email.toLowerCase(),
        resetPasswordToken:   hash,
        resetPasswordExpires: { $gt: new Date() },
      }).select('+resetPasswordToken +resetPasswordExpires +password');

      if (!user) return res.status(400).json({ error: 'Link inválido o expirado. Solicitá uno nuevo.' });

      user.password = req.body.password;
      user.resetPasswordToken   = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      // Invalidar todos los tokens activos
      // Llegar a este paso prueba que la persona controla el email: también queda verificado.
      await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 }, emailVerificado: true, emailVerificadoEn: new Date() });
      await Log.registrar({ userId: user._id, tipo: 'auth_reset_done', mensaje: 'Contraseña reseteada via email', ip: req.ip });

      res.json({ msg: 'Contraseña actualizada correctamente. Ya podés iniciar sesión.' });
    } catch (err) {
      logger.error('[Auth] reset-password error:', err.message);
      res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
    }
  }
);

module.exports = router;
