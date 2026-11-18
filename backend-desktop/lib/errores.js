// lib/errores.js
// Respuesta de error "segura" para las rutas: el detalle técnico (err.message, que puede traer rutas, consultas o textos de la base)
// se queda en el log del servidor y al cliente le llega un mensaje genérico en español. Los mensajes pensados para la persona
// (validaciones, "contraseña incorrecta"…) NO pasan por acá: se siguen escribiendo a mano en cada ruta.
'use strict';

const logger = require('../config/logger');

const MENSAJE_GENERICO = 'Ocurrió un error. Intentá de nuevo en un momento.';

// responderError(res, 'Admin GET /users', err)                       → 500 { error: MENSAJE_GENERICO }
// responderError(res, 'Admin POST /email-prueba', err, { extra: { ok: false } })   → 500 { ok: false, error: ... }
// responderError(res, 'Subs', err, { status: 503, mensaje: 'No disponible.' })
function responderError(res, etiqueta, err, { status = 500, mensaje = MENSAJE_GENERICO, extra = {} } = {}) {
  const detalle = err && err.message ? err.message : String(err);
  logger.error(`[${etiqueta}] ${detalle}`);
  return res.status(status).json({ ...extra, error: mensaje });
}

module.exports = { responderError, MENSAJE_GENERICO };
