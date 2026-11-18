// lib/sesion.js
// Qué hacer con la sesión cuando falla la consulta de /auth/me (o cuando una llamada responde 401).
// Regla: el token se borra SOLO cuando el servidor dice que no sirve (401). Un corte de internet, un timeout o un 5xx no
// son culpa del usuario: la sesión se conserva y se reintenta. Funciones puras: probadas en desktop/tests/sesion.test.js.

// Esperas (en segundos) entre reintentos automáticos: crecen y se estabilizan en un minuto. No hay tope de reintentos: una caída del
// servidor (5xx) no dispara el evento "online" y una ventana de escritorio abierta en el local no dispara "visibilitychange", así que si se
// dejara de reintentar la pantalla "Sin conexión" quedaría trabada aunque la conexión haya vuelto. Cada minuto es un pedido liviano.
const ESPERAS_S = [2, 5, 10, 20, 40, 60];

// 'invalida'    -> el servidor respondió 401: el token no sirve (vencido, revocado, cuenta cambiada). Se borra.
// 'rechazada'   -> el servidor respondió y dijo que no (403 cuenta bloqueada, 404, etc.): no hay sesión usable, pero el
//                  token no se toca (no es una prueba de que esté vencido).
// 'sin_conexion'-> no hubo respuesta (red caída, timeout, cancelada) o el servidor falló (5xx) o pidió esperar (408, 425, 429).
export function clasificarErrorSesion(err) {
  const status = err?.response?.status;
  if (!status) return 'sin_conexion';
  if (status === 401) return 'invalida';
  if (status >= 500 || status === 408 || status === 425 || status === 429) return 'sin_conexion';
  return 'rechazada';
}

// Espera en milisegundos antes del reintento número `intento` (0 = el primero). null solo si el número de intento no es válido.
export function esperaReintento(intento) {
  if (!Number.isInteger(intento) || intento < 0) return null;
  return ESPERAS_S[Math.min(intento, ESPERAS_S.length - 1)] * 1000;
}
