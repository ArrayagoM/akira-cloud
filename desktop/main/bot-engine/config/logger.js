// config/logger.js — logger simple para el bot-engine local.
// akira.bot.js solo usa .error()/.warn() de esto (ver grep de
// winstonLogger. en el archivo original) — no hace falta winston completo
// ni transporte a archivo (eso lo maneja electron-log más arriba, en el
// proceso principal de Electron, si hace falta persistirlo — ver
// desktop/main/index.js).
'use strict';

function linea(nivel, args) {
  const ts = new Date().toISOString();
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const out = `${ts} [${nivel}]: ${msg}`;
  if (nivel === 'error') console.error(out);
  else if (nivel === 'warn') console.warn(out);
  else console.log(out);
}

module.exports = {
  info: (...args) => linea('info', args),
  warn: (...args) => linea('warn', args),
  error: (...args) => linea('error', args),
  debug: (...args) => linea('debug', args),
};
