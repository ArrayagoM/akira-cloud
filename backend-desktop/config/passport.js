// config/passport.js
'use strict';

const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const GoogleStrategy   = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const LocalStrategy    = require('passport-local').Strategy;
const bcrypt           = require('bcryptjs');
const User             = require('../models/User');
const logger           = require('./logger');
const { decidirVinculoOAuth } = require('../lib/seguridad-cuentas');

module.exports = (passport) => {

  // ── JWT ─────────────────────────────────────────────────
  passport.use(new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await User.findById(payload.id).select('-password');
        if (!user) return done(null, false);
        if (user.status === 'bloqueado') {
          return done(null, false, { message: 'Cuenta bloqueada' });
        }
        // Cuenta creada con email y contraseña que todavía no confirmó su email: no tiene sesión válida
        if (user.emailVerificado === false) return done(null, false, { message: 'Confirmá tu email para continuar.' });
        // Verificar que el token no haya sido revocado
        if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
          return done(null, false, { message: 'Sesión expirada. Iniciá sesión nuevamente.' });
        }
        return done(null, user);
      } catch (err) {
        return done(err, false);
      }
    }
  ));

  // ── Local (Email/Password) ───────────────────────────────
  passport.use(new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) return done(null, false, { message: 'Credenciales incorrectas' });
        if (user.status === 'bloqueado') return done(null, false, { message: 'Cuenta bloqueada' });
        if (!user.password) return done(null, false, { message: 'Esta cuenta usa OAuth. Iniciá sesión con Google o Facebook.' });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return done(null, false, { message: 'Credenciales incorrectas' });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  // ── Google OAuth ─────────────────────────────────────────
  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy(
      {
        clientID:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:  process.env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(null, false, { message: 'No se pudo obtener el email de Google' });

          let user = await User.findOne({ email }).select('+password');
          const decision = decidirVinculoOAuth(user && { tieneClave: !!user.password, emailVerificado: user.emailVerificado }, { proveedor: 'google', emailVerificadoPorProveedor: profile.emails?.[0]?.verified !== false && profile._json?.email_verified !== false });
          if (decision.rechazar) return done(null, false, { message: decision.motivo });

          if (!user) {
            const nombreGoogle = profile.name?.givenName || 'Usuario';
            user = await User.create({
              nombre:        nombreGoogle,
              apellido:      profile.name?.familyName || '',
              email,
              auth_provider: 'google',
              googleId:      profile.id,
              avatar:        profile.photos?.[0]?.value,
              emailVerificado: true,
              status:        'activo',
              rol:           'user',
              codigoReferido: await User.generarCodigoUnico(nombreGoogle),
            });
            logger.info(`[Auth] Nuevo usuario Google: ${email}`);
          } else {
            // Entrar con Google prueba que la persona controla ese email. Si la cuenta tenía una contraseña que nunca se confirmó por código,
            // se borra (podría haberla puesto otra persona antes) y se cierran todas las sesiones anteriores.
            if (!user.googleId) { user.googleId = profile.id; user.auth_provider = 'google'; }
            if (decision.borrarClave) { user.password = undefined; user.auth_provider = 'google'; logger.warn(`[Auth] ${email}: contraseña sin verificar borrada al vincular Google`); }
            if (decision.cerrarSesiones) user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.emailVerificado = true; user.emailVerificadoEn = user.emailVerificadoEn || new Date();
            await user.save();
          }

          if (user.status === 'bloqueado') return done(null, false, { message: 'Cuenta bloqueada' });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    ));
  }

  // ── Facebook OAuth ───────────────────────────────────────
  if (process.env.FACEBOOK_APP_ID) {
    passport.use(new FacebookStrategy(
      {
        clientID:     process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL:  process.env.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'emails', 'name', 'photos'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(null, false, { message: 'No se pudo obtener el email de Facebook' });

          let user = await User.findOne({ email }).select('+password');
          const decision = decidirVinculoOAuth(user && { tieneClave: !!user.password, emailVerificado: user.emailVerificado }, { proveedor: 'facebook' });

          if (!user) {
            const nombreFacebook = profile.name?.givenName || 'Usuario';
            user = await User.create({
              nombre:        nombreFacebook,
              apellido:      profile.name?.familyName || '',
              email,
              auth_provider: 'facebook',
              facebookId:    profile.id,
              avatar:        profile.photos?.[0]?.value,
              emailVerificado: true,
              status:        'activo',
              rol:           'user',
              codigoReferido: await User.generarCodigoUnico(nombreFacebook),
            });
            logger.info(`[Auth] Nuevo usuario Facebook: ${email}`);
          } else {
            if (!user.facebookId) { user.facebookId = profile.id; user.auth_provider = 'facebook'; }
            if (decision.borrarClave) { user.password = undefined; user.auth_provider = 'facebook'; logger.warn(`[Auth] ${email}: contraseña sin verificar borrada al vincular Facebook`); }
            if (decision.cerrarSesiones) user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.emailVerificado = true; user.emailVerificadoEn = user.emailVerificadoEn || new Date();
            await user.save();
          }

          if (user.status === 'bloqueado') return done(null, false, { message: 'Cuenta bloqueada' });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    ));
  }
};
