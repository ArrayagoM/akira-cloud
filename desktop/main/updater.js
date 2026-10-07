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

function crearUpdater({ autoUpdater, log, notificar, alCambiar = () => {}, versionActual = '', ahora = () => new Date() }) {
  let descargada = null; // versión lista para instalar
  let disponible = null; // versión nueva detectada (descargándose)
  let progreso = 0;      // % de la descarga en curso
  let ultimoError = null;
  let timers = [];
  const cambio = () => { try { alCambiar(estado()); } catch { /* un oyente roto no afecta al actualizador */ } };

  // Lo que ve el usuario en la interfaz: qué versión tiene, si hay otra y en qué punto está.
  function estado() {
    return {
      versionActual,
      disponible: descargada ? null : disponible,
      descargada: descargada === true ? 'nueva' : descargada,
      descargando: !!disponible && !descargada,
      progreso: Math.round(progreso),
      error: ultimoError,
      instalaDeMadrugada: !!descargada,
    };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: (m) => log('[updater]', m), warn: (m) => log('[updater]', m), error: (m) => log('[updater] ERROR', m), debug() {} };

  autoUpdater.on('update-available', (i) => { disponible = i?.version || true; progreso = 0; ultimoError = null; log('[updater] hay una versión nueva:', i?.version); cambio(); });
  autoUpdater.on('download-progress', (p) => { progreso = p?.percent || 0; cambio(); });
  autoUpdater.on('error', (e) => { ultimoError = e?.message || String(e); log('[updater] error:', ultimoError); cambio(); });
  autoUpdater.on('update-downloaded', (i) => {
    descargada = i?.version || true;
    progreso = 100;
    log('[updater] versión descargada, lista para instalar:', descargada);
    cambio();
    notificar(`Akira ${i?.version || ''} está lista`, 'Se instalará sola esta madrugada, o cuando quieras desde el ícono junto al reloj → "Actualizar ahora".');
  });

  const buscar = () => autoUpdater.checkForUpdates().catch((e) => log('[updater] no se pudo buscar:', e?.message));

  // "Buscar actualizaciones" a pedido del usuario: responde qué pasó (al día / descargando / lista / error).
  function buscarManual(esperaMs = 15_000) {
    if (descargada) return Promise.resolve({ resultado: 'lista', ...estado() });
    return new Promise((resolve) => {
      let listo = false;
      const fin = (resultado) => { if (listo) return; listo = true; clearTimeout(t); autoUpdater.off?.('update-not-available', alDia); autoUpdater.off?.('update-available', hay); autoUpdater.off?.('error', fallo); resolve({ resultado, ...estado() }); };
      const alDia = () => fin('al-dia'); const hay = () => fin('descargando'); const fallo = () => fin('error');
      const t = setTimeout(() => fin(disponible ? 'descargando' : 'al-dia'), esperaMs);
      autoUpdater.on('update-not-available', alDia); autoUpdater.on('update-available', hay); autoUpdater.on('error', fallo);
      autoUpdater.checkForUpdates().catch((e) => { ultimoError = e?.message || String(e); fin('error'); });
    });
  }

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

  return { iniciar, detener, buscar, buscarManual, estado, instalarAhora, tickNocturno, hayDescargada: () => !!descargada };
}

module.exports = { crearUpdater };
