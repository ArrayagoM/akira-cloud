// main/updater.js — actualización automática.
// Busca versiones nuevas en el feed público (build.publish en package.json),
// las descarga en segundo plano y las instala sin que el usuario haga nada:
//  - de madrugada (03:00–05:00) si la PC está prendida, para no cortar el bot
//    en horario de atención (el reinicio dura unos segundos);
//  - o cuando el usuario cierra Akira desde la bandeja ("Salir");
//  - o a pedido, desde el menú de la bandeja ("Actualizar ahora").
// Un fallo de actualización nunca afecta al bot: solo se registra.
'use strict';

const CADA_MS = 4 * 60 * 60 * 1000;

function crearUpdater({ autoUpdater, log, notificar, ahora = () => new Date() }) {
  let descargada = null; // versión lista para instalar
  let timers = [];

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: (m) => log('[updater]', m), warn: (m) => log('[updater]', m), error: (m) => log('[updater] ERROR', m), debug() {} };

  autoUpdater.on('update-available', (i) => log('[updater] hay una versión nueva:', i?.version));
  autoUpdater.on('error', (e) => log('[updater] error:', e?.message || String(e)));
  autoUpdater.on('update-downloaded', (i) => {
    descargada = i?.version || true;
    log('[updater] versión descargada, lista para instalar:', descargada);
    notificar(`Akira ${i?.version || ''} está lista`, 'Se instalará sola esta madrugada, o cuando quieras desde el ícono junto al reloj → "Actualizar ahora".');
  });

  const buscar = () => autoUpdater.checkForUpdates().catch((e) => log('[updater] no se pudo buscar:', e?.message));

  // Instala solo en la ventana nocturna.
  function tickNocturno() {
    const h = ahora().getHours();
    if (descargada && h >= 3 && h < 5) {
      log('[updater] instalando la actualización (ventana nocturna)');
      autoUpdater.quitAndInstall(true, true);
      return true;
    }
    return false;
  }

  function iniciar() {
    timers.push(setTimeout(buscar, 30_000));
    timers.push(setInterval(buscar, CADA_MS));
    timers.push(setInterval(tickNocturno, 20 * 60 * 1000));
  }
  function detener() { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; }
  function instalarAhora() { if (descargada) autoUpdater.quitAndInstall(true, true); return !!descargada; }

  return { iniciar, detener, buscar, instalarAhora, tickNocturno, hayDescargada: () => !!descargada };
}

module.exports = { crearUpdater };
