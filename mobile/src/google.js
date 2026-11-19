// src/google.js — piezas puras (sin React Native) del ingreso con Google, para poder probarlas con Node.
// Flujo: la app abre el navegador en /auth/google?mobile_challenge=<sha256 del verificador>; el servidor vuelve a
// akira://oauth?code=<código>; la app canjea el código mandando el verificador (PKCE), así un código robado por otra
// app instalada en el celular no sirve. Detalle del lado del servidor: backend-desktop/routes/auth.routes.js.
'use strict';

const REDIRECCION = 'akira://oauth';

// 32 bytes al azar (los da expo-crypto) → 64 caracteres hexadecimales.
function verificadorDe(bytes) {
  if (!bytes || bytes.length < 32) throw new Error('Faltan bytes al azar para el ingreso con Google');
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join('');
}

function urlInicio(urlBase, desafio) {
  if (!/^[a-f0-9]{64}$/.test(String(desafio))) throw new Error('Desafío inválido');
  return `${String(urlBase).replace(/\/+$/, '')}/auth/google?mobile_challenge=${desafio}`;
}

// Lee el código de la vuelta (akira://oauth?code=...). Devuelve null si no hay.
function codigoDe(url) {
  const m = /^akira:\/\/oauth\/?\?(?:[^#]*&)?code=([a-f0-9]{16,128})(?:&|#|$)/i.exec(String(url || ''));
  return m ? m[1] : null;
}

function urlCanje(codigo, verificador) {
  return `/auth/oauth-token?code=${encodeURIComponent(codigo)}&verifier=${encodeURIComponent(verificador)}`;
}

module.exports = { REDIRECCION, verificadorDe, urlInicio, codigoDe, urlCanje };
