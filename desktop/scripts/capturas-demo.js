// scripts/capturas-demo.js — saca capturas de pantalla REALES del programa para la landing, con datos de ejemplo inventados
// (un negocio ficticio: "Aurora Estudio"). Levanta el servidor local del programa con una base temporal, una "nube" de mentira y una IA
// de mentira (no usa claves ni toca tus datos), abre la interfaz en una ventana y guarda un PNG por pantalla.
//
//   node_modules\electron\dist\electron.exe scripts\capturas-demo.js [carpeta-de-salida]
//
// Se corre como aplicación de Electron (no como Node suelto): la base local necesita el mismo runtime que la app real.
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const Module = require('module');
const { app, BrowserWindow } = require('electron');

const salida = path.resolve(process.argv[2] || path.join(__dirname, '..', 'capturas'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akira-demo-'));
app.setPath('userData', tmp); // nada de esto toca los datos reales de la app instalada
app.disableHardwareAcceleration();
app.getVersion = () => '1.0.26'; // el pie del menú muestra la versión de la app (en esta prueba sería la de Electron)

const DEMO_USER = { _id: 'demo', id: 'demo', nombre: 'Lucía', apellido: 'Romero', email: 'demo@akiracloud.lat', rol: 'user', plan: 'pro', status: 'activo', planExpira: new Date(Date.now() + 24 * 86400000).toISOString() };
const ESPERA = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[capturas]', ...a);

// ── "Nube" de mentira: lo único que el programa le pide al servidor de licencias para mostrar las pantallas ──
function nubeFalsa() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const ruta = req.url.split('?')[0]; res.setHeader('Content-Type', 'application/json');
      if (ruta === '/api/auth/me') return res.end(JSON.stringify({ user: DEMO_USER }));
      if (ruta === '/api/subscriptions/mi-suscripcion') return res.end(JSON.stringify({ plan: 'pro', planBase: 'pro', status: 'activo', planVigente: true, planExpira: DEMO_USER.planExpira, diasRestantes: 24, esAdmin: false, trial: null, limites: { mensajes: null, bots: 1, calendar: true, mp: true, audio: true } }));
      if (ruta === '/api/auth/alertas') return res.end(JSON.stringify({ email: true, push: true }));
      res.end('{}');
    }).listen(0, '127.0.0.1', () => resolve(s));
  });
}

// ── Licencia de mentira (así la sesión del programa se valida sin internet) ──
const rel = (r) => path.join(__dirname, '..', r);
const inyectar = (r, exportado) => { const f = rel(r); Module._cache[f] = { id: f, filename: f, loaded: true, exports: exportado, children: [], paths: [] }; };
const LICENCIA = { plan: 'pro', features: { calendar: true, mercadopago: true, audio: true }, slotsMax: 1, vigente: true, expira: null };
inyectar('main/license/license-client.js', {
  configurar() {}, request: async (ruta) => (ruta === '/api/auth/me' ? { user: DEMO_USER } : {}), activar: async () => LICENCIA, heartbeat: async () => LICENCIA,
  getEstado: () => LICENCIA, restaurarEstado() {}, licenciaCacheVigente: () => true, quotaCheck: async () => ({ permitido: true }), features: async () => LICENCIA,
});

// ── Datos de ejemplo (negocio ficticio) ──
async function sembrar() {
  const uid = 'demo';
  const Config = require('../main/bot-engine/models/Config'); const Turno = require('../main/bot-engine/models/Turno');
  const Movimiento = require('../main/bot-engine/models/Movimiento'); const BotCliente = require('../main/bot-engine/models/BotCliente');
  const CtaCte = require('../main/bot-engine/models/CtaCte'); const Pedido = require('../main/bot-engine/models/Pedido');
  const Profesional = require('../main/bot-engine/models/Profesional'); const Proveedor = require('../main/bot-engine/models/Proveedor');
  const Conocimiento = require('../main/bot-engine/models/Conocimiento'); const Documento = require('../main/bot-engine/models/Documento');
  const caja = require('../main/gestion/caja');

  const hoy = new Date();
  const dia = (n, h, m = 0) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n, h, m);
  const horarios = Object.fromEntries(['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].map((d) => [d, { activo: true, inicio: '09:00', fin: '18:00' }]).concat([['sabado', { activo: true, inicio: '09:00', fin: '13:00' }], ['domingo', { activo: false }]]));
  await Config.findOneAndUpdate({ userId: uid }, {
    negocio: 'Aurora Estudio', miNombre: 'Lucía', tipoNegocio: 'turnos', servicios: 'turnos y reservas', celularNotificaciones: '5492241555000', aliasTransferencia: 'aurora.estudio', precioTurno: 8000,
    serviciosList: [{ nombre: 'Corte', precio: 8000, duracion: 45 }, { nombre: 'Color completo', precio: 28000, duracion: 120 }, { nombre: 'Brushing', precio: 6500, duracion: 40 }, { nombre: 'Tratamiento de keratina', precio: 35000, duracion: 150 }, { nombre: 'Manicura', precio: 7000, duracion: 45 }, { nombre: 'Peinado de evento', precio: 18000, duracion: 90 }],
    catalogo: [
      { nombre: 'Shampoo reparador 350 ml', descripcion: 'Para cabello dañado', precio: 6500, stock: 12, categoria: 'Cuidado', disponible: true, codigo: '7790001000011' },
      { nombre: 'Acondicionador hidratante 350 ml', descripcion: 'Hidratación diaria', precio: 6200, stock: 9, categoria: 'Cuidado', disponible: true, codigo: '7790001000028' },
      { nombre: 'Máscara nutritiva 250 g', descripcion: 'Tratamiento semanal', precio: 9800, stock: 6, categoria: 'Cuidado', disponible: true, codigo: '7790001000035' },
      { nombre: 'Protector térmico en spray', descripcion: 'Antes de la plancha', precio: 7400, stock: 14, categoria: 'Styling', disponible: true, codigo: '7790001000042' },
      { nombre: 'Esmalte semipermanente', descripcion: 'Colores de temporada', precio: 4200, stock: 25, categoria: 'Uñas', disponible: true, codigo: '7790001000059' },
      { nombre: 'Cepillo desenredante', descripcion: 'Cerdas suaves', precio: 5300, stock: 3, categoria: 'Accesorios', disponible: true, codigo: '7790001000066' },
    ],
    horariosAtencion: horarios,
  }, { upsert: true });
  const cfg = await Config.findOne({ userId: uid }); cfg.setKey('keyGroq', 'gsk_demo_para_capturas'); await cfg.save();

  const clientes = [['Valentina Suárez', '5492241555101'], ['Martina Gómez', '5492241555102'], ['Camila Herrera', '5492241555103'], ['Sofía Benítez', '5492241555104'], ['Julieta Díaz', '5492241555105'], ['Agustina Pérez', '5492241555106'], ['Florencia Ruiz', '5492241555107'], ['Lucas Fernández', '5492241555108'], ['Paula Acosta', '5492241555109'], ['Rocío Molina', '5492241555110']];
  for (const [nombre, tel] of clientes) await BotCliente.create({ userId: uid, jid: `${tel}@s.whatsapp.net`, nombre, etiquetas: nombre.startsWith('Valentina') ? ['vip'] : [], turnosConfirmados: [1] });

  // turnos de la semana (algunos ya cobrados con MercadoPago)
  const servicios = [['Corte', 8000, 45], ['Color completo', 28000, 120], ['Brushing', 6500, 40], ['Tratamiento de keratina', 35000, 150], ['Manicura', 7000, 45], ['Peinado de evento', 18000, 90]];
  let n = 0;
  const plan = [[-6, 10], [-6, 15], [-5, 11], [-4, 10], [-4, 16], [-3, 9], [-3, 12], [-2, 10], [-2, 14], [-1, 11], [-1, 16], [0, 9], [0, 11], [0, 15], [1, 10], [1, 12], [1, 16], [2, 10], [2, 14], [3, 9], [3, 11], [4, 10], [5, 9]];
  for (const [d, h] of plan) {
    const [sv, precio, dur] = servicios[n % servicios.length]; const [nombre, tel] = clientes[n % clientes.length]; n++;
    const futuro = d > 0;
    await Turno.create({ userId: uid, calendarId: `demo-${n}`, fechaInicio: dia(d, h), fechaFin: dia(d, h, dur), resumen: `${sv} — ${nombre.split(' ')[0]}`, clienteNombre: nombre, clienteTelefono: tel, estado: futuro && n % 4 === 0 ? 'pendiente' : 'confirmado', pago: futuro && n % 4 === 0 ? undefined : { monto: precio, metodo: n % 3 === 0 ? 'efectivo' : 'mercadopago' } });
  }
  const fecha = (dd) => caja.fechaLocal(dia(dd, 12));
  const movs = [['gasto', 'Alquiler', 180000, -9, 'transferencia', 'Alquiler del local'], ['gasto', 'Servicios (luz, agua, internet)', 42000, -8, 'transferencia', 'Luz y gas'], ['gasto', 'Insumos y mercadería', 65500, -6, 'efectivo', 'Tintura y oxidante'], ['gasto', 'Marketing', 12000, -5, 'mercadopago', 'Publicidad en redes'], ['ingreso', 'Ventas', 13000, -4, 'efectivo', 'Venta: 2× Shampoo reparador'], ['ingreso', 'Ventas', 9800, -3, 'mercadopago', 'Venta: Máscara nutritiva'], ['gasto', 'Insumos y mercadería', 28300, -2, 'efectivo', 'Esmaltes y limas'], ['ingreso', 'Ventas', 18000, -1, 'efectivo', 'Venta: Protector térmico + Cepillo'], ['ingreso', 'Cobros en efectivo', 24000, 0, 'efectivo', 'Cobro de seña en el local']];
  for (const [tipo, categoria, monto, dd, metodo, descripcion] of movs) await Movimiento.create({ userId: uid, tipo, categoria, monto, fecha: fecha(dd), metodo, descripcion, origen: tipo === 'ingreso' && descripcion.startsWith('Venta') ? 'venta' : 'manual', items: descripcion.startsWith('Venta') ? [{ nombre: 'Producto', precio: monto, cantidad: 1 }] : undefined, cliente: '' });

  await CtaCte.create({ userId: uid, entidad: 'cliente', entidadClave: '2241555103', nombre: 'Camila Herrera', telefono: '2241555103', tipo: 'cargo', monto: 28000, fecha: fecha(-12), concepto: 'Color completo (a pagar)' });
  await CtaCte.create({ userId: uid, entidad: 'cliente', entidadClave: '2241555107', nombre: 'Florencia Ruiz', telefono: '2241555107', tipo: 'cargo', monto: 15500, fecha: fecha(-5), concepto: 'Brushing y productos' });
  const prov = await Proveedor.create({ userId: uid, nombre: 'Distribuidora Belleza Sur', telefono: '5492241555300', activo: true });
  await CtaCte.create({ userId: uid, entidad: 'proveedor', proveedorId: String(prov._id), nombre: 'Distribuidora Belleza Sur', tipo: 'cargo', monto: 96000, fecha: fecha(-7), concepto: 'Reposición de tinturas' });
  await Proveedor.create({ userId: uid, nombre: 'Insumos Pro', telefono: '5492241555301', activo: true });

  await Profesional.create({ userId: uid, nombre: 'Lucía Romero', activo: true, comision: 0, color: '#00e87b' });
  await Profesional.create({ userId: uid, nombre: 'Tomás Villalba', activo: true, comision: 40, color: '#38bdf8' });

  const pedido = (num, estado, nombre, items, total) => Pedido.create({ userId: uid, numero: num, estado, jid: `549224155510${num}@s.whatsapp.net`, nombre, items, subtotal: total, envio: 0, total, entrega: 'retiro', creadoEn: dia(-num, 12).toISOString() });
  await pedido(1, 'pagado', 'Valentina Suárez', [{ nombre: 'Shampoo reparador 350 ml', precio: 6500, cantidad: 2 }], 13000);
  await pedido(2, 'pendiente-pago', 'Martina Gómez', [{ nombre: 'Máscara nutritiva 250 g', precio: 9800, cantidad: 1 }, { nombre: 'Cepillo desenredante', precio: 5300, cantidad: 1 }], 15100);
  await pedido(3, 'entregado', 'Sofía Benítez', [{ nombre: 'Esmalte semipermanente', precio: 4200, cantidad: 3 }], 12600);

  await Conocimiento.create({ userId: uid, titulo: 'Preguntas frecuentes de Aurora', origen: 'texto', caracteres: 1800, fragmentos: ['Aceptamos transferencia, MercadoPago y efectivo. Los turnos se reservan con una seña.', 'Estamos en Belgrano 450. Atendemos de lunes a viernes de 9 a 18 y sábados de 9 a 13.'] });
  await Documento.create({ userId: uid, jid: '5492241555102@s.whatsapp.net', nombreOriginal: 'comprobante-seña.png', mimetype: 'image/png', ruta: 'x', estado: 'nuevo', tipo: 'comprobante', monto: 4000 });
  log('datos de ejemplo cargados');
}

// ── Navegación y capturas ──
async function esperarRender(win, ms = 2600) { await ESPERA(ms); }
async function js(win, codigo) { return win.webContents.executeJavaScript(codigo, true); }
async function capturar(win, nombre, ms, alto = 900) {
  win.setContentSize(1440, alto); await esperarRender(win, ms);
  const img = await win.webContents.capturePage();
  fs.mkdirSync(salida, { recursive: true });
  fs.writeFileSync(path.join(salida, `${nombre}.png`), img.toPNG());
  log('guardada', nombre);
}
async function ir(win, base, ruta) { await win.loadURL(base + ruta); await esperarRender(win, 1200); }

const clickPorTexto = (texto, selector = 'button') => `(() => { const el = [...document.querySelectorAll('${selector}')].find((b) => b.textContent.trim().includes(${JSON.stringify(texto)})); if (!el) return false; el.click(); return true; })()`;
const escribir = (selector, valor) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valor)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;

app.whenReady().then(async () => {
  try {
    const nube = await nubeFalsa();
    require('../main/db/store').abrir(path.join(tmp, 'akira.db'));
    await require('../main/esm-compat').preparar();
    await sembrar();
    fs.writeFileSync(path.join(tmp, 'import-demo.done'), new Date().toISOString()); // sin importación desde la nube: no hay nube de verdad

    const botService = require('../main/slots/bot-service');
    botService.getBotStatus = () => ({ activo: true, conectado: true });
    const appHooks = {};
    const modelos = { Movimiento: require('../main/bot-engine/models/Movimiento'), Turno: require('../main/bot-engine/models/Turno'), BotCliente: require('../main/bot-engine/models/BotCliente'), Config: require('../main/bot-engine/models/Config') };
    appHooks.servicioWebhooks = require('../main/webhooks').crearServicio({ userDataDir: tmp, log });
    appHooks.servicioExportacion = require('../main/exportacion-auto').crearServicio({ userDataDir: tmp, obtenerUserId: () => 'demo', modelos, log });
    appHooks.servicioMcp = require('../main/mcp/servicio').crearServicio({ userDataDir: tmp, obtenerUserId: () => 'demo', version: '1.0.26', log });
    appHooks.servicioMarketing = require('../main/marketing/servicio').crearServicio({
      userDataDir: tmp, log, llamarIA: async () => 'Opción 1\n¡Este sábado tenemos huecos libres en la mañana para que te des un nuevo look! Vení a Aurora Estudio y aprovechá el turno para un corte a $8.000.\nReservá por WhatsApp y asegurá tu espacio.\n\n#PeluqueríaAurora #CorteDePelo #TurnosDisponibles #SábadoDeCorte\n\nFoto o video sugerido: una foto del interior del estudio con la silla de corte vacía y luz natural de la mañana.\n\nOpción 2\n¿Querés cambiar tu estilo antes del fin de semana? Este sábado por la mañana quedan turnos libres para corte a $8.000. Mandanos un mensaje por WhatsApp y agendá tu hora.\n\n#Corte #SábadoEnAurora #TurnosAbiertos #RenováTuPeinado\n\nFoto o video sugerido: un video corto de Lucía preparando las herramientas de corte, lista para recibir a la próxima clienta.',
    });
    await appHooks.servicioMcp.activar(true);
    appHooks.servicioMcp.crearConexion({ nombre: 'Claude en mi PC', dias: 90 });
    require('../main/marketing/perfil').guardar(tmp, { tipoVenta: 'minorista' });

    const srv = await require('../main/local-api/server').iniciar({ appHooks, userDataDir: tmp, serverUrl: `http://127.0.0.1:${nube.address().port}`, frontendDir: path.join(__dirname, '..', 'renderer-app'), nombreEquipo: 'demo', botService });
    log('servidor local en', srv.url);

    const win = new BrowserWindow({ width: 1440, height: 900, show: true, frame: false, x: 0, y: 0, backgroundColor: '#0a0a0a', webPreferences: { backgroundThrottling: false } });
    await win.loadURL(srv.url + '/login');
    await js(win, "localStorage.setItem('akira_token','demo-token'); localStorage.setItem('akira_primeros_pasos_oculto','1'); true");

    for (const [nombre, ruta, ms, alto] of [['dashboard', '/dashboard', 4200, 1000], ['agenda', '/agenda', 3800, 1000], ['caja', '/caja', 3500, 1250], ['reportes', '/reportes', 4200, 1250], ['catalogo', '/catalogo', 3000, 760], ['clientes', '/clientes', 3000, 900], ['pedidos', '/pedidos', 3000, 780], ['deudores', '/deudores', 3000, 640], ['conocimiento', '/conocimiento', 3000, 780], ['integraciones', '/integraciones', 4500, 1600]]) {
      await ir(win, srv.url, ruta); await capturar(win, nombre, ms, alto);
    }
    // Marketing: la pantalla de especialistas y un borrador generado
    await ir(win, srv.url, '/marketing'); await capturar(win, 'marketing-equipo', 3200, 1150);
    await js(win, clickPorTexto('Redactor de publicaciones')); await ESPERA(900);
    await js(win, escribir('textarea', 'Hay turnos libres el sábado a la mañana')); await ESPERA(300);
    await js(win, clickPorTexto('Generar borrador')); await capturar(win, 'marketing-borrador', 3800, 1500);
    await js(win, 'window.scrollTo(0, 0); true'); await ESPERA(300);
    // Planes
    await ir(win, srv.url, '/planes'); await capturar(win, 'planes', 3000, 1000);
    log('listo →', salida);
  } catch (e) { console.error('[capturas] ERROR', e); process.exitCode = 1; }
  finally { setTimeout(() => app.exit(process.exitCode || 0), 500); }
});
