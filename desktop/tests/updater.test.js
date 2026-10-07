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
u.buscar().then(async () => {
  assert(true, 'si no se puede buscar actualizaciones (sin internet) no se rompe nada');
  au.emit('error', new Error('x'));
  assert(true, 'un error del actualizador solo se registra');

  // ── estado que ve el usuario en la interfaz (aviso "reiniciar ahora") ──
  const cambios = [];
  const au2 = new EventEmitter(); au2.checkForUpdates = async () => ({}); au2.quitAndInstall = () => {};
  const u2 = crearUpdater({ autoUpdater: au2, log: () => {}, notificar: () => {}, alCambiar: (e) => cambios.push(e), versionActual: '1.0.8' });
  assert(u2.estado().versionActual === '1.0.8' && !u2.estado().descargando && !u2.estado().descargada, 'al arrancar: versión actual y nada pendiente');
  au2.emit('update-available', { version: '1.0.9' });
  assert(u2.estado().descargando && u2.estado().disponible === '1.0.9', 'al detectar una versión nueva muestra que se está descargando');
  au2.emit('download-progress', { percent: 42.4 });
  assert(u2.estado().progreso === 42, 'informa el avance de la descarga');
  au2.emit('update-downloaded', { version: '1.0.9' });
  assert(u2.estado().descargada === '1.0.9' && !u2.estado().descargando && u2.estado().instalaDeMadrugada, 'descargada: queda lista para "Reiniciar y actualizar"');
  assert(cambios.length >= 3 && cambios[cambios.length - 1].descargada === '1.0.9', 'avisa a la interfaz cada cambio (para mostrar el aviso sin recargar)');
  assert((await u2.buscarManual()).resultado === 'lista', 'si ya hay una descargada, "buscar" responde que está lista');

  // "Buscar actualizaciones" a pedido
  const au3 = new EventEmitter(); au3.quitAndInstall = () => {};
  const u3 = crearUpdater({ autoUpdater: au3, log: () => {}, notificar: () => {}, versionActual: '1.0.8' });
  au3.checkForUpdates = async () => { setTimeout(() => au3.emit('update-not-available', {}), 10); return {}; };
  assert((await u3.buscarManual(2000)).resultado === 'al-dia', 'buscar manual: "estás al día"');
  au3.checkForUpdates = async () => { setTimeout(() => au3.emit('update-available', { version: '1.0.9' }), 10); return {}; };
  assert((await u3.buscarManual(2000)).resultado === 'descargando', 'buscar manual: "hay una nueva, descargando"');
  au3.checkForUpdates = async () => { throw new Error('sin internet'); };
  assert((await crearUpdater({ autoUpdater: au3, log: () => {}, notificar: () => {} }).buscarManual(2000)).resultado === 'error', 'buscar manual sin internet: informa el error sin romper');

  console.log('\n✅ Todos los tests de updater pasaron.\n');
}).catch((e) => { console.error('❌', e.message); process.exit(1); });
