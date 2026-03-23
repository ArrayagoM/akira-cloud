// routes/auth.routes.js
'use strict';

const router = require('express').Router();
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Log = require('../models/Log');
const { requireAuth, generarJWT } = require('../middleware/auth');
const logger = require('../config/logger');

// ── Validaciones ────────────────────────────────────────────
const registerValidations = [
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 100 }),
  body('apellido').trim().optional().isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener mayúsculas, minúsculas y números'),
];

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/debug — solo en desarrollo, diagnóstico rápido
// ─────────────────────────────────────────────────────────────
router.get('/debug', async (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const mongoose = require('mongoose');
  const checks = {
    mongodb:
      mongoose.connection.readyState === 1
        ? 'OK'
        : `FALLO (state=${mongoose.connection.readyState})`,
    jwt_secret: process.env.JWT_SECRET ? 'OK' : 'FALTA en .env',
    encryption_key: process.env.ENCRYPTION_KEY
      ? `OK (${process.env.ENCRYPTION_KEY.length} chars)`
      : 'FALTA en .env',
    node_env: process.env.NODE_ENV || 'no seteado',
    mongo_uri: process.env.MONGO_URI
      ? process.env.MONGO_URI.replace(/:([^:@]+)@/, ':****@')
      : 'FALTA en .env',
  };

  try {
    const { encrypt, decrypt } = require('../services/crypto.service');
    const enc = encrypt('test');
    const dec = decrypt(enc);
    checks.crypto = dec === 'test' ? 'OK' : 'FALLO — ENCRYPTION_KEY inválida';
  } catch (e) {
    checks.crypto = 'FALLO — ' + e.message;
  }

  try {
    const User = require('../models/User');
    await User.findOne({}).lean();
    checks.db_query = 'OK';
  } catch (e) {
    checks.db_query = 'FALLO — ' + e.message;
  }

  const allOk = Object.values(checks).every((v) => v === 'OK' || v.startsWith('OK'));
  res.status(allOk ? 200 : 500).json({ status: allOk ? 'todo OK' : 'hay problemas', checks });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────────────────────────
router.post('/register', registerValidations, async (req, res) => {
  const validErr = handleValidation(req, res);
  if (validErr !== null) return;

  try {
    const { nombre, apellido, email, password, celular, pais } = req.body;

    const existe = await User.findOne({ email: email.toLowerCase() });
    if (existe) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    // Validar JWT_SECRET ANTES de crear el usuario (fail-fast)
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('cambia_esto')) {
      logger.error(
        '[Auth] ¡CONFIGURACIÓN INVÁLIDA! JWT_SECRET tiene el valor de ejemplo. Editá backend/.env',
      );
      return res.status(500).json({
        error:
          'El servidor no está configurado correctamente. Editá JWT_SECRET en backend/.env y reiniciá el servidor.',
      });
    }

    // Validar ENCRYPTION_KEY ANTES de crear el usuario
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.startsWith('cambia_esto')) {
      logger.error(
        '[Auth] ¡CONFIGURACIÓN INVÁLIDA! ENCRYPTION_KEY tiene el valor de ejemplo. Editá backend/.env',
      );
      return res.status(500).json({
        error:
          'El servidor no está configurado correctamente. Editá ENCRYPTION_KEY en backend/.env y reiniciá el servidor.',
      });
    }

    // Crear usuario
    const user = await User.create({
      nombre: nombre.trim(),
      apellido: (apellido || '').trim(),
      email: email.toLowerCase(),
      password,
      celular: celular || '',
      pais: pais || 'Argentina',
      auth_provider: 'local',
    });

    // Generar JWT — si falla, borrar el usuario para no dejar huérfanos
    let token;
    try {
      token = generarJWT(user._id);
    } catch (jwtErr) {
      logger.error('[Auth] Error generando JWT — borrando usuario recién creado:', jwtErr.message);
      await User.findByIdAndDelete(user._id).catch(() => {});
      return res
        .status(500)
        .json({ error: 'Error interno al crear la sesión. Revisá JWT_SECRET en .env' });
    }

    await Log.registrar({
      userId: user._id,
      tipo: 'auth_register',
      mensaje: `Nuevo registro: ${email}`,
      ip: req.ip,
    });
    logger.info(`[Auth] ✅ Registro exitoso: ${email}`);

    res.status(201).json({ token, user: user.toJSON() });
  } catch (err) {
    // Log completo — captura cualquier tipo de error incluyendo objetos no-Error
    const errInfo = {
      message: err?.message || '',
      name: err?.name || err?.constructor?.name || '',
      code: err?.code || '',
      type: typeof err,
      string: String(err),
      mongoErrors: err?.errors
        ? Object.fromEntries(
            Object.entries(err.errors).map(([k, v]) => [k, v?.message || String(v)]),
          )
        : undefined,
    };
    logger.error('[Auth] Error register DETALLADO: ' + JSON.stringify(errInfo, null, 2));

    // Manejar errores específicos de Mongoose / MongoDB
    if (err.name === 'ValidationError') {
      const msgs = Object.values(err.errors)
        .map((e) => e.message)
        .join(', ');
      return res.status(400).json({ error: 'Datos inválidos: ' + msgs });
    }
    if (err.code === 11000) {
      const campoRaw = Object.keys(err.keyValue || {})[0] || 'campo';
      // Mapear nombres técnicos de MongoDB a mensajes amigables
      const camposAmigables = {
        email: 'email',
        phoneNumber: 'email', // índice legacy — tratarlo como email
        celular: 'teléfono',
        googleId: 'cuenta de Google',
        facebookId: 'cuenta de Facebook',
      };
      const campoAmigable = camposAmigables[campoRaw] || campoRaw;
      logger.warn(`[Auth] Duplicate key en campo: ${campoRaw} → mostrando como: ${campoAmigable}`);
      return res.status(409).json({ error: `Ya existe una cuenta con ese ${campoAmigable}` });
    }

    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Error al registrar. Intentá de nuevo.'
          : err.message || err.name || JSON.stringify(errInfo),
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/auth/cleanup-dev — SOLO DESARROLLO
//  Borra un usuario por email (para limpiar registros huérfanos)
// ─────────────────────────────────────────────────────────────
router.delete('/cleanup-dev', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Falta el email' });
  const result = await User.findOneAndDelete({ email: email.toLowerCase() });
  if (!result) return res.status(404).json({ error: 'Usuario no encontrado' });
  logger.warn(`[DEV] Usuario eliminado manualmente: ${email}`);
  res.json({ ok: true, eliminado: email });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────────────────────
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    const validErr = handleValidation(req, res);
    if (validErr !== null) return;

    passport.authenticate('local', async (err, user, info) => {
      if (err) return next(err);

      if (!user) {
        await Log.registrar({
          tipo: 'auth_fail',
          nivel: 'warn',
          mensaje: `Login fallido para: ${req.body.email}`,
          ip: req.ip,
        });
        return res.status(401).json({ error: info?.message || 'Credenciales incorrectas' });
      }

      // Actualizar metadatos de login
      await User.findByIdAndUpdate(user._id, {
        ultimoLogin: new Date(),
        ipUltimoLogin: req.ip,
        $inc: { loginCount: 1 },
      });

      await Log.registrar({
        userId: user._id,
        tipo: 'auth_login',
        mensaje: 'Login exitoso',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const token = generarJWT(user._id);
      logger.info(`[Auth] Login: ${user.email}`);
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

// ─────────────────────────────────────────────────────────────
//  PUT /api/auth/password
// ─────────────────────────────────────────────────────────────
router.put(
  '/password',
  requireAuth,
  [
    body('passwordActual').notEmpty().withMessage('Ingresá tu contraseña actual'),
    body('passwordNueva')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('La nueva contraseña debe tener mayúsculas, minúsculas y números'),
  ],
  async (req, res) => {
    const validErr = handleValidation(req, res);
    if (validErr !== null) return;

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

      await Log.registrar({
        userId: user._id,
        tipo: 'config_update',
        mensaje: 'Contraseña cambiada',
        ip: req.ip,
      });
      res.json({ msg: 'Contraseña actualizada correctamente' });
    } catch (err) {
      res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
  },
);

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  await Log.registrar({ userId: req.user._id, tipo: 'auth_logout', mensaje: 'Logout', ip: req.ip });
  res.json({ msg: 'Sesión cerrada' });
});

// ─────────────────────────────────────────────────────────────
//  GOOGLE OAuth
// ─────────────────────────────────────────────────────────────
router.get(
  '/google',
  passport.authenticate('google', { session: false, scope: ['profile', 'email'] }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed`,
  }),
  async (req, res) => {
    const token = generarJWT(req.user._id);
    await User.findByIdAndUpdate(req.user._id, {
      ultimoLogin: new Date(),
      $inc: { loginCount: 1 },
    });
    await Log.registrar({
      userId: req.user._id,
      tipo: 'auth_login',
      mensaje: 'Login Google',
      ip: req.ip,
    });
    res.redirect(`${process.env.FRONTEND_URL}/oauth-callback?token=${token}`);
  },
);

// ─────────────────────────────────────────────────────────────
//  FACEBOOK OAuth
// ─────────────────────────────────────────────────────────────
router.get('/facebook', passport.authenticate('facebook', { session: false, scope: ['email'] }));

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=facebook_failed`,
  }),
  async (req, res) => {
    const token = generarJWT(req.user._id);
    await User.findByIdAndUpdate(req.user._id, {
      ultimoLogin: new Date(),
      $inc: { loginCount: 1 },
    });
    await Log.registrar({
      userId: req.user._id,
      tipo: 'auth_login',
      mensaje: 'Login Facebook',
      ip: req.ip,
    });
    res.redirect(`${process.env.FRONTEND_URL}/oauth-callback?token=${token}`);
  },
);

module.exports = router;
