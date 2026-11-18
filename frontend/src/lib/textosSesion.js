// lib/textosSesion.js
// Textos de sesión que dependen de CÓMO entró el usuario (auth_provider del modelo de usuario: 'local' | 'google' | 'facebook').
// Quien entra con Google o Facebook no tiene una contraseña de Akira para "volver a ingresar". Si el dato no está, el texto es
// neutro. Funciones puras: probadas en desktop/tests/sesion.test.js.

const COLA = ' para que el bot siga validando su licencia. Desde ahora la sesión se renueva sola mientras uses Akira.';

export function detalleSesionExpirada(provider) {
  if (provider === 'google') return `Volvé a iniciar sesión con Google${COLA}`;
  if (provider === 'facebook') return `Volvé a iniciar sesión con Facebook${COLA}`;
  if (provider === 'local') return `Volvé a ingresar con tu email y tu contraseña${COLA}`;
  return `Volvé a iniciar sesión${COLA}`;
}

// Mensaje de la pantalla de ingreso cuando el login con Google/Facebook no se pudo completar (?error=oauth_failed).
export const MENSAJE_OAUTH_FALLIDO =
  'No pudimos completar el ingreso con Google o Facebook. Suele pasar si se cerró la ventana antes de terminar, si no se aceptó el permiso, si se cortó internet o si pasaron varios minutos (el enlace de ingreso se usa una sola vez). Tocá el botón de nuevo para reintentar. Si sigue fallando, probá con tu email o escribinos a soporte@akiracloud.lat.';
