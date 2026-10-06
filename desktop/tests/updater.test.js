// tests/updater.test.js — la actualización automática no debe cortar el bot en
// horario de atención y un fallo nunca debe tumbar nada.
'use strict';
const { EventEmitter } = require('events');
const { crearUpdater } = require('../main/updater');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

console.log('\n[updater] Tests:');
const au = new EventEmitter();
au.checkForUpdates = async () => ({}); let instalo = 0; au.quitAndInstall = () => { instalo++; };
const avisos = []; let hora = 15;
const u = crearUpdater({ autoUpdater: au, log: () => {}, notificar: (t, c) => avisos.push([t, c]), ahora: () => ({ getHours: () => hora }) });

assert(au.autoDownload === true, 'descarga las versiones nuevas en segundo plano');
assert(au.autoInstallOnAppQuit === true, 'se instala al cerrar Akira desde la bandeja');
assert(u.tickNocturno() === false && instalo === 0, 'sin versión descargada no hace nada');

au.emit('update-downloaded', { version: '1.0.2' });
assert(u.hayDescargada() && avisos.length === 1, 'al descargar una versión avisa al usuario');
hora = 15; assert(u.tickNocturno() === false && instalo === 0, 'a las 15:00 (horario de atención) NO reinicia el bot');
hora = 4; assert(u.tickNocturno() === true && instalo === 1, 'a las 04:00 instala la actualización');
assert(u.instalarAhora() === true && instalo === 2, '"Actualizar ahora" desde la bandeja instala cuando el usuario lo pide');

au.checkForUpdates = async () => { throw new Error('sin internet'); };
u.buscar().then(() => {
  assert(true, 'si no se puede buscar actualizaciones (sin internet) no se rompe nada');
  au.emit('error', new Error('x'));
  assert(true, 'un error del actualizador solo se registra');
  console.log('\n✅ Todos los tests de updater pasaron.\n');
}).catch((e) => { console.error('❌', e.message); process.exit(1); });
