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
const REINTENTO_MS = 10 * 60 * 1000; // si la descarga falla (corte, archivo a medio subir), se vuelve a intentar sola
const MAX_REINTENTOS = 6;

function crearUpdater({ autoUpdater, log, notificar, alCambiar = () => {}, versionActual = '', ahora = () => new Date(), setT = setTimeout }) {
  let descargada = null; // versión lista para instalar
  let disponible = null; // versión nueva detectada (descargándose)
  let progreso = 0;      // % de la descarga en curso
  let ultimoError = null;
  let timers = [];
  let reintentos = 0;
  const cambio = () => { try { alCambiar(estado()); } catch { /* un oyente roto no afecta al actualizador */ } };

  // Lo que ve el usuario en la interfaz: qué versión tiene, si hay otra y en qué punto está.
  function estado() {
    return {
      versionActual,
      disponible: descargada ? null : disponible,
      descargada: descargada === true ? 'nueva' : descargada,
      descargando: !!disponible && !descargada && !ultimoError,
      fallo: !!disponible && !descargada && !!ultimoError, // la descarga falló y se reintenta sola
      progreso: Math.round(progreso),
      error: ultimoError,
      instalaDeMadrugada: !!descargada,
    };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: (m) => log('[updater]', m), warn: (m) => log('[updater]', m), error: (m) => log('[updater] ERROR', m), debug() {} };

  autoUpdater.on('update-available', (i) => {
    disponible = i?.version || true; progreso = 0; ultimoError = null; log('[updater] hay una versión nueva:', i?.version);
    // Salió otra versión mientras había una lista: el actualizador descarta la anterior y baja la nueva, así que la "lista" ya no sirve.
    if (descargada && descargada !== disponible) { log('[updater] la versión lista', descargada, 'quedó vieja; se descarga la', disponible); descargada = null; }
    cambio();
  });
  autoUpdater.on('download-progress', (p) => { progreso = p?.percent || 0; cambio(); });
  autoUpdater.on('error', (e) => {
    ultimoError = e?.message || String(e); log('[updater] error:', ultimoError);
    cambio();
    if (disponible && !descargada) programarReintento();
  });
  autoUpdater.on('update-downloaded', (i) => {
    descargada = i?.version || true;
    progreso = 100;
    log('[updater] versión descargada, lista para instalar:', descargada);
    cambio();
    notificar(`Akira ${i?.version || ''} está lista`, 'Se instalará sola esta madrugada, o cuando quieras desde el ícono junto al reloj → "Actualizar ahora".');
  });

  const buscar = () => autoUpdater.checkForUpdates().catch((e) => log('[updater] no se pudo buscar:', e?.message));

  // Una descarga fallida (por ejemplo, el archivo cambió mientras se subía la versión) se reintenta en 10 minutos, hasta 6 veces.
  function programarReintento() {
    if (reintentos >= MAX_REINTENTOS) return;
    reintentos++;
    const t = setT(() => { log('[updater] reintentando la descarga (', reintentos, ')'); buscar(); }, REINTENTO_MS);
    t?.unref?.(); timers.push(t);
  }

  // quitAndInstall falla si el actualizador ya no tiene el instalador (por ejemplo, salió otra versión): en vez de dejar al usuario
  // con un botón que no hace nada, se descarta lo "listo" y se vuelve a descargar.
  function instalar() {
    try { autoUpdater.quitAndInstall(true, true); return true; }
    catch (e) {
      log('[updater] no se pudo instalar, se descarga de nuevo:', e?.message);
      descargada = null; ultimoError = null; progreso = 0; cambio();
      buscar();
      return false;
    }
  }

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
      return instalar();
    }
    return false;
  }

  function iniciar() {
    timers.push(setTimeout(buscar, 30_000));
    timers.push(setInterval(buscar, CADA_MS));
    timers.push(setInterval(tickNocturno, 20 * 60 * 1000));
  }
  function detener() { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; }
  function instalarAhora() { return descargada ? instalar() : false; }

  return { iniciar, detener, buscar, buscarManual, estado, instalarAhora, tickNocturno, hayDescargada: () => !!descargada };
}

module.exports = { crearUpdater };
