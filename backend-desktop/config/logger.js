// config/logger.js
// A diferencia de backend/config/logger.js (que escribe a backend/logs/*.log),
// este logger es solo-consola: el filesystem de una función Vercel es de
// solo lectura salvo /tmp, y los logs de consola ya quedan capturados por
// Vercel (pestaña "Logs" del deployment) sin necesitar transporte a archivo.
'use strict';

// winston no es dependencia de este proyecto (a propósito — evita el
// transporte a archivo por defecto, que no funciona en el filesystem de
// solo lectura de una función Vercel). Implementación mínima compatible
// con la superficie que usan las rutas copiadas (.info/.warn/.error/.http).
function linea(nivel, args) {
  const ts = new Date().toISOString();
  const msg = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  const out = `${ts} [${nivel}]: ${msg}`;
  if (nivel === 'error') console.error(out);
  else if (nivel === 'warn') console.warn(out);
  else console.log(out);
}

module.exports = {
  info: (...args) => linea('info', args),
  warn: (...args) => linea('warn', args),
  error: (...args) => linea('error', args),
  http: (...args) => linea('http', args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') linea('debug', args);
  },
};
