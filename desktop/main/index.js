// main/index.js — proceso principal de Electron.
// Arranque: abre la base SQLite ANTES de cargar cualquier módulo que toque un
// modelo (bot-service → akira.bot.js → models/* ejecutan crearColeccion() al
// cargarse y necesitan la conexión abierta), levanta el servidor local
// (local-api) y abre una ventana que muestra el MISMO frontend de la
// plataforma servido desde ahí.
'use strict';

const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const userDataDir = app.getPath('userData');

// ── Registro en archivo (userData/logs/akira.log) ─────────────────
// Sin esto, si algo falla en una PC de un cliente no queda ninguna pista.
const logDir = path.join(userDataDir, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'akira.log');
try { if (fs.statSync(logFile).size > 2 * 1024 * 1024) fs.renameSync(logFile, logFile + '.old'); } catch {}
function log(...partes) {
  const linea = `${new Date().toISOString()} ${partes.map((p) => (p instanceof Error ? p.stack : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  try { fs.appendFileSync(logFile, linea); } catch {}
}
process.on('uncaughtException', (e) => log('[uncaughtException]', e));
process.on('unhandledRejection', (e) => log('[unhandledRejection]', e));
log('--- arranque', app.getVersion(), process.platform, os.release());

// Si el usuario pidió restaurar un respaldo, se aplica ACÁ, antes de abrir la base (se guarda una copia de lo anterior).
try {
  const restaurado = require('./respaldo').aplicarRestauracionPendiente(userDataDir);
  if (restaurado) log('[respaldo] restaurado desde un respaldo del', restaurado.manifiesto?.creado, '- copia de lo anterior en', restaurado.resguardo);
} catch (e) { log('[respaldo] no se pudo aplicar la restauración', e); }

const store = require('./db/store');
store.abrir(path.join(userDataDir, 'akira.db')); // DEBE ir antes de cualquier require de un modelo

const esmCompat = require('./esm-compat');
const licenseClient = require('./license/license-client');

// AKIRA_LICENSE_SERVER_URL permite apuntar a un backend local en desarrollo
// (ej. http://localhost:5050); por defecto, el servidor de licencias en Vercel.
const SERVER_URL = process.env.AKIRA_LICENSE_SERVER_URL || 'https://akira-licencias.vercel.app';
licenseClient.configurar({ serverUrl: SERVER_URL });
// MercadoPago notifica a esta URL pública (el servidor guarda el aviso y la
// app lo retira) — ver backend-desktop/routes/bot-gate.routes.js.
process.env.BACKEND_URL = SERVER_URL;

let ventana = null;
let tray = null;
let botService = null;
let localApi = null;
const appHooks = { actualizador: null, userDataDir }; // la API local lo usa para mostrar/instalar actualizaciones, respaldos y diálogos
let actualizador = null;
let pedirMostrar = false; // alguien intentó abrir la app antes de que la ventana existiera
let avisoBandejaMostrado = false;
const iniciaOculta = process.argv.includes('--hidden'); // lo usa el inicio automático con Windows

// Preferencia "Iniciar con Windows" (por defecto sí: el bot tiene que seguir
// atendiendo después de reiniciar la PC, sin que nadie abra nada).
const archivoPrefs = path.join(userDataDir, 'prefs.json');
const leerPrefs = () => { try { return JSON.parse(fs.readFileSync(archivoPrefs, 'utf-8')); } catch { return {}; } };
function aplicarInicioAutomatico(activo) {
  if (!app.isPackaged) return; // en desarrollo no se registra
  app.setLoginItemSettings({ openAtLogin: !!activo, args: ['--hidden'] });
}

function esDeLaApp(url) {
  return !!localApi && url.startsWith(localApi.url);
}

function mostrarVentana() {
  if (!ventana) { pedirMostrar = true; return; }
  if (ventana.isMinimized()) ventana.restore();
  ventana.show();
  ventana.focus();
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Akira',
    icon: path.join(__dirname, 'assets', 'tray.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0a0f1a',
    show: !iniciaOculta,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  ventana.loadURL(localApi.url);

  // Todo lo que no es la propia app (Google, MercadoPago, enlaces) se abre en
  // el navegador del sistema: Google bloquea el login dentro de ventanas
  // embebidas, y el pago no debe pasar por la app.
  const aNavegador = (e, url) => {
    if (esDeLaApp(url)) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  ventana.webContents.on('will-navigate', aNavegador);
  ventana.webContents.on('will-redirect', aNavegador);
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Si la pestaña interna se cae, se vuelve a cargar en vez de dejar la ventana muerta.
  ventana.webContents.on('render-process-gone', (_e, d) => {
    log('[render-process-gone]', d);
    if (d.reason !== 'clean-exit') ventana?.loadURL(localApi.url);
  });
  ventana.webContents.on('did-fail-load', (_e, code, desc, url) => log('[did-fail-load]', code, desc, url));

  // Cerrar la ventana la manda a la bandeja: el bot sigue atendiendo WhatsApp.
  // La primera vez se avisa, para que nadie crea que la app se cerró.
  ventana.on('close', (e) => {
    if (app.isQuitting) return;
    e.preventDefault();
    ventana.hide();
    log('[ventana] oculta en la bandeja');
    if (!avisoBandejaMostrado && Notification.isSupported()) {
      avisoBandejaMostrado = true;
      new Notification({
        title: 'Akira sigue funcionando',
        body: 'Tu bot sigue atendiendo en segundo plano. Para abrirla de nuevo, hacé clic en el ícono de Akira junto al reloj.',
        icon: path.join(__dirname, 'assets', 'tray.png'),
      }).show();
    }
  });

  if (pedirMostrar) { pedirMostrar = false; mostrarVentana(); }
}

function crearTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.setToolTip('Akira');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Akira', click: mostrarVentana },
    { label: 'Actualizar ahora', click: () => { if (!actualizador?.instalarAhora()) actualizador?.buscar(); } },
    {
      label: 'Iniciar con Windows',
      type: 'checkbox',
      checked: leerPrefs().inicioAutomatico !== false,
      click: (item) => {
        fs.writeFileSync(archivoPrefs, JSON.stringify({ ...leerPrefs(), inicioAutomatico: item.checked }));
        aplicarInicioAutomatico(item.checked);
      },
    },
    { type: 'separator' },
    { label: 'Salir (el bot dejará de responder)', click: () => { app.isQuitting = true; Promise.resolve(botService?.detenerTodos()).finally(() => app.quit()); } },
  ]));
  tray.on('click', mostrarVentana);
}

const bloqueo = app.requestSingleInstanceLock();
if (!bloqueo) {
  // Ya hay una Akira abierta (quizás oculta en la bandeja): ella se muestra.
  log('[instancia] ya había otra Akira abierta; esta se cierra');
  app.quit();
} else {
  app.on('second-instance', () => { log('[instancia] segundo intento de abrir; se muestra la ventana'); mostrarVentana(); });

  app.whenReady().then(async () => {
    await esmCompat.preparar(); // Baileys es ESM (ver esm-compat.js)
    // Google Calendar: los tokens se renuevan a través del servidor (el client
    // secret de Google no puede estar en la PC del cliente).
    const { obtenerDeviceId } = require('./device');
    require('./bot-engine/gcal-proxy').instalar({
      request: (refreshToken) => licenseClient.request('/api/google/refresh', 'POST', { refresh_token: refreshToken }, { 'x-device-id': obtenerDeviceId(userDataDir) }),
    });
    botService = require('./slots/bot-service');

    // Si el bot se cae no puede avisar por WhatsApp: se muestra un aviso de Windows y se le pide a la nube
    // una señal de vida inmediata, que es la que manda el email de alerta (ver vigilante-bot.js).
    const vigilante = require('./vigilante-bot').crearVigilante({
      estaCaido: (slot) => { const e = botService.estadoDetallado().slots.find((x) => x.slot === slot); return !!e && e.deseado && !e.conectado; },
      pedirLatido: () => require('./license/guardian').pedirLatido(),
      notificar: (titulo, cuerpo) => {
        log('[alerta]', titulo, '-', cuerpo);
        if (Notification.isSupported()) new Notification({ title: titulo, body: cuerpo, icon: path.join(__dirname, 'assets', 'tray.png') }).show();
      },
    });

    // Respaldo automático cifrado de los datos del negocio (ver respaldo.js)
    const servicioRespaldo = require('./respaldo-servicio').crearServicio({
      userDataDir, snapshotDb: (destino) => store.respaldarA(destino), credenciales: require('./security/credentials-store'), version: app.getVersion(), log,
      carpetaSugerida: path.join(app.getPath('documents'), 'Respaldos de Akira'),
    });
    appHooks.servicioRespaldo = servicioRespaldo;
    // Resumen del día al celular del dueño (opcional; ver resumen-diario.js)
    const ConfigModelo = require('./bot-engine/models/Config');
    const servicioResumenDiario = require('./resumen-diario').crearServicio({
      userDataDir,
      obtenerUserId: () => require('./license/session-store').leer(userDataDir)?.userId || null,
      mensajesHoy: () => botService.mensajesHoy(),
      obtenerNegocio: async (uid) => (await ConfigModelo.findOne({ userId: String(uid) }))?.negocio || '',
      enviar: async (texto) => {
        const uid = require('./license/session-store').leer(userDataDir)?.userId;
        const cel = String((await ConfigModelo.findOne({ userId: String(uid) }))?.celularNotificaciones || '').replace(/\D/g, '');
        if (cel.length < 10) return { ok: false, motivo: 'sin-celular' };
        return botService.avisarDueno(texto) ? { ok: true } : { ok: false, motivo: 'bot-desconectado' };
      },
      log,
    });
    appHooks.servicioResumenDiario = servicioResumenDiario;
    // Mensajes a grupos de clientes (siempre con confirmación del dueño; ver difusion.js)
    appHooks.servicioDifusion = require('./difusion').crearServicio({ userDataDir, enviar: async (jid, texto) => botService.enviarACliente(jid, texto), log });
    // Reseñas después del servicio (opcional, apagado por defecto; ver resenas.js)
    appHooks.servicioResenas = require('./resenas').crearServicio({
      userDataDir,
      obtenerUserId: () => require('./license/session-store').leer(userDataDir)?.userId || null,
      modelos: { Turno: require('./bot-engine/models/Turno'), BotCliente: require('./bot-engine/models/BotCliente'), Config: ConfigModelo },
      enviar: async (jid, texto) => botService.enviarACliente(jid, texto),
      marcarPendiente: (jid, turnoId, link) => botService.marcarResenaPendiente(jid, turnoId, link),
      log,
    });
    // Control remoto mínimo desde el celular (opcional, apagado por defecto; ver comandos-remotos.js)
    const sesionAlmacen = require('./license/session-store');
    const uidActual = () => String(sesionAlmacen.leer(userDataDir)?.userId || '');
    const guardianMod = require('./license/guardian');
    appHooks.servicioCelular = require('./comandos-remotos').crearServicio({
      userDataDir, log,
      llamar: (cuerpo) => licenseClient.request('/api/licenses/comandos', 'POST', { ...cuerpo, deviceId: require('./device').obtenerDeviceId(userDataDir) }),
      acciones: {
        pausarBot: async () => { const slots = botService.slotsActivos(); for (const sl of slots) await botService.stopBot(uidActual(), sl); guardianMod.pedirLatido(); return slots; },
        reanudarBot: async (slots) => { for (const sl of slots) await botService.startBot(uidActual(), sl); guardianMod.pedirLatido(); },
        vacaciones: async (on) => {
          await ConfigModelo.findOneAndUpdate({ userId: uidActual() }, { modoPausa: !!on }, { upsert: true });
          for (const sl of botService.slotsActivos()) botService.recargarConfig(sl);
          guardianMod.pedirLatido();
        },
      },
    });
    const elegir = async (opciones) => { const r = await dialog.showOpenDialog(ventana || undefined, opciones); return r.canceled ? null : r.filePaths[0]; };
    appHooks.elegirCarpeta = () => elegir({ title: 'Carpeta para los respaldos', properties: ['openDirectory', 'createDirectory'] });
    appHooks.elegirArchivo = () => elegir({ title: 'Elegí un respaldo de Akira', properties: ['openFile'], filters: [{ name: 'Respaldo de Akira', extensions: ['akbk'] }] });
    appHooks.abrirCarpeta = (c) => shell.openPath(c);
    appHooks.reiniciar = () => { app.isQuitting = true; Promise.resolve(botService?.detenerTodos()).finally(() => { app.relaunch(); app.exit(0); }); };

    localApi = await require('./local-api/server').iniciar({
      appHooks,
      userDataDir,
      serverUrl: SERVER_URL,
      frontendDir: path.join(__dirname, '..', 'renderer-app'),
      nombreEquipo: os.hostname(),
      botService,
      alCambiarEstado: (ev) => vigilante.alCambiar(ev),
      // El login con Google termina en el navegador del sistema; el código
      // se canjea dentro de la ventana de la app.
      alCodigoOAuth: (code) => {
        log('[oauth] código recibido; se carga en la ventana');
        if (!ventana) return;
        ventana.loadURL(`${localApi.url}/oauth-callback?code=${encodeURIComponent(code)}`);
        mostrarVentana();
      },
    });

    crearVentana();
    crearTray();
    servicioRespaldo.programar();
    servicioResumenDiario.programar();
    appHooks.servicioCelular.programar();
    appHooks.servicioResenas.programar();
    aplicarInicioAutomatico(leerPrefs().inicioAutomatico !== false);
    log('[arranque] listo en', localApi.url, iniciaOculta ? '(oculta)' : '');

    // Actualizaciones automáticas (solo en la app instalada).
    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        actualizador = require('./updater').crearUpdater({
          autoUpdater,
          log,
          versionActual: app.getVersion(),
          alCambiar: (est) => localApi?.emitirATodos('app:actualizacion', est),
          notificar: (titulo, cuerpo) => {
            if (Notification.isSupported()) new Notification({ title: titulo, body: cuerpo, icon: path.join(__dirname, 'assets', 'tray.png') }).show();
          },
        });
        actualizador.iniciar();
        appHooks.actualizador = actualizador;
      } catch (e) { log('[updater] no disponible', e); }
    }

    // Revalida la licencia y reactiva los bots activos aunque nadie abra la ventana.
    require('./license/guardian')
      .iniciar({
        userDataDir, botService, emitir: localApi.emitirAlUsuario,
        datosHeartbeat: async (userId) => ({
          ...(await require('./resumen-web').datosHeartbeat({ userDataDir, userId, botService, version: app.getVersion() })),
          estadoBot: {
            ...botService.estadoDetallado({ pausado: require('./license/guardian').estado().bloqueada }),
            vacaciones: !!(await require('./bot-engine/models/Config').findOne({ userId: String(userId) }))?.modoPausa,
          },
        }),
      })
      .catch((e) => log('[guardian] FALLÓ', e));
  }).catch((e) => log('[arranque] FALLÓ', e));

  app.on('window-all-closed', () => { /* vive en la bandeja */ });
  app.on('child-process-gone', (_e, d) => log('[child-process-gone]', d));
  app.on('before-quit', () => { app.isQuitting = true; log('[salida] before-quit'); });
  app.on('will-quit', () => { actualizador?.detener(); appHooks.servicioRespaldo?.detener(); appHooks.servicioResumenDiario?.detener(); appHooks.servicioCelular?.detener(); appHooks.servicioResenas?.detener(); require('./license/guardian').detener(); localApi?.cerrar(); store.cerrar(); });
}
