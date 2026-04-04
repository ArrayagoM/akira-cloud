// middleware/auth.js
'use strict';

const passport = require('passport');
const Log      = require('../models/Log');

/**
 * Middleware: requiere JWT válido + cuenta activa
 * Si la cuenta está bloqueada → 403 inmediato
 */
function requireAuth(req, res, next) {
  passport.authenticate('jwt', { session: false }, async (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      const msg = info?.message || 'Token inválido o expirado';
      return res.status(401).json({ error: msg });
    }

    // Verificar bloqueo en tiempo real (aunque el JWT sea válido)
    if (user.status === 'bloqueado') {
      await Log.registrar({
        userId: user._id,
        tipo: 'security_block',
        nivel: 'warn',
        mensaje: 'Intento de acceso con cuenta bloqueada',
        ip: req.ip,
      });
      return res.status(403).json({ error: 'Cuenta bloqueada. Contactá al administrador.' });
    }

    req.user = user;
    next();
  })(req, res, next);
}

/**
 * Middleware: requiere rol de administrador
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado — se requiere rol admin' });
  }
  next();
}

/**
 * Helper para generar JWT
 */
const jwt = require('jsonwebtoken');

function generarJWT(userId, tokenVersion = 0) {
  return jwt.sign(
    { id: userId, tv: tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { requireAuth, requireAdmin, generarJWT };
