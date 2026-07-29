// tests/system-bot.test.js
// Tests del canal de comandos de sistema para el admin (WhatsApp). El gate de
// seguridad (fromMe + jid del canal + rol==='admin') vive en akira.bot.js y
// no se testea acá — esto prueba la lógica determinística de comandos y la
// máquina de estados de confirmación, con un botManager falso inyectado
// (no requiere Mongo real: Log.registrar() atrapa sus propios fallos).
'use strict';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_key_de_al_menos_32_caracteres_1234';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akira-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const systemBot = require('../services/system.bot');
const Log = require('../models/Log');
const Config = require('../models/Config');
const User = require('../models/User');
const { mesActual } = require('../services/bot/quota.service');

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}

console.log('\n[system-bot] Tests:');

// ── esComandoSistemaCandidato: detección barata sin Mongo ──────────
assert(systemBot.esComandoSistemaCandidato('sistema estado') === true, 'detecta "sistema estado"');
assert(systemBot.esComandoSistemaCandidato('Sistema Caidos') === true, 'case-insensitive');
assert(systemBot.esComandoSistemaCandidato('  sistema ayuda  ') === true, 'ignora espacios');
assert(systemBot.esComandoSistemaCandidato('si') === true, 'detecta confirmación "si"');
assert(systemBot.esComandoSistemaCandidato('sí') === true, 'detecta confirmación "sí" con tilde');
assert(systemBot.esComandoSistemaCandidato('no') === true, 'detecta cancelación "no"');
assert(systemBot.esComandoSistemaCandidato('cancelar') === true, 'detecta "cancelar"');
assert(systemBot.esComandoSistemaCandidato('hola como estas') === false, 'mensaje normal no es candidato');
assert(systemBot.esComandoSistemaCandidato('') === false, 'texto vacío no es candidato');
assert(systemBot.esComandoSistemaCandidato(null) === false, 'null no rompe ni es candidato');
assert(systemBot.esComandoSistemaCandidato('sistemas de riego') === true, 'nota: cualquier texto que arranque con "sistema" cuenta como candidato (el parseo fino pasa dentro de manejarComandoSistema)');

// ── Confirmación / cancelación de acción pendiente ─────────────────
(async () => {
  const mensajesEnviados = [];
  const fakeEnviar = async (jid, texto) => { mensajesEnviados.push({ jid, texto }); };

  // Sin botManager configurado: "sistema estado" no debe explotar.
  const manejado0 = await systemBot.manejarComandoSistema('sistema estado', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejado0 === true, 'sin botManager configurado, "sistema estado" se maneja (avisa que no está disponible) sin crashear');
  assert(mensajesEnviados[mensajesEnviados.length - 1].texto.includes('no disponible'), 'avisa que el sistema no está disponible sin botManager');

  // Configuramos un botManager falso para el resto de los tests.
  let stopBotLlamadoCon = null;
  let startBotLlamadoCon = null;
  const fakeBotManager = {
    getWorkerInfo: () => ({ conectado: true }),
    getBotStatus: (uid, slot) => ({ activo: false, slot }),
    stopBot: async (uid, slot) => { stopBotLlamadoCon = { uid, slot }; return { ok: true }; },
    startBot: async (uid, slot) => { startBotLlamadoCon = { uid, slot }; return { ok: true, msg: 'reiniciado' }; },
    enviarMensajeExterno: async () => true,
  };
  systemBot.configurarBotManager(fakeBotManager);

  // "si" sin ninguna acción pendiente → no debe hacer nada, debe devolver false
  // (para que el llamador no trate el mensaje como "consumido").
  systemBot._soloParaTests_reset();
  const manejadoSinPendiente = await systemBot.manejarComandoSistema('si', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoSinPendiente === false, '"si" sin acción pendiente devuelve false (no se come el mensaje)');

  // Confirmar una acción pendiente de restart
  systemBot._soloParaTests_reset();
  systemBot._soloParaTests_setPendiente({
    accion: 'restart', targetUserId: 'uid-negocio-1', targetSlot: 0,
    negocio: 'Peluquería Ana', createdAt: Date.now(), expiresAt: Date.now() + 60000,
  });
  mensajesEnviados.length = 0;
  const manejadoConfirm = await systemBot.manejarComandoSistema('si', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoConfirm === true, '"si" con acción pendiente se maneja (devuelve true)');
  assert(stopBotLlamadoCon?.uid === 'uid-negocio-1' && stopBotLlamadoCon?.slot === 0, 'confirmar restart llama a stopBot con el uid/slot correctos');
  assert(startBotLlamadoCon?.uid === 'uid-negocio-1' && startBotLlamadoCon?.slot === 0, 'confirmar restart llama a startBot con el uid/slot correctos');
  assert(systemBot._soloParaTests_getPendiente() === null, 'la acción pendiente se limpia después de confirmar');
  assert(mensajesEnviados.some((m) => m.texto.includes('Reiniciando')), 'avisa que está reiniciando');
  assert(mensajesEnviados.some((m) => m.texto.includes('reiniciado')), 'avisa el resultado final');

  // Cancelar una acción pendiente
  systemBot._soloParaTests_reset();
  systemBot._soloParaTests_setPendiente({
    accion: 'restart', targetUserId: 'uid-negocio-2', targetSlot: 0,
    negocio: 'Lavadero Sur', createdAt: Date.now(), expiresAt: Date.now() + 60000,
  });
  stopBotLlamadoCon = null;
  const manejadoCancel = await systemBot.manejarComandoSistema('no', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoCancel === true, '"no" con acción pendiente se maneja');
  assert(stopBotLlamadoCon === null, 'cancelar NO llama a stopBot');
  assert(systemBot._soloParaTests_getPendiente() === null, 'la acción pendiente se limpia después de cancelar');

  // Expiración: una acción pendiente vencida se trata como inexistente
  systemBot._soloParaTests_reset();
  systemBot._soloParaTests_setPendiente({
    accion: 'restart', targetUserId: 'uid-negocio-3', targetSlot: 0,
    negocio: 'Vieja', createdAt: Date.now() - 10 * 60000, expiresAt: Date.now() - 60000, // venció hace 1 min
  });
  stopBotLlamadoCon = null;
  const manejadoExpirado = await systemBot.manejarComandoSistema('si', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoExpirado === false, 'una confirmación después de vencida la ventana no ejecuta nada (devuelve false)');
  assert(stopBotLlamadoCon === null, 'no se llama a stopBot para una acción ya vencida');

  // "sistema ayuda" siempre responde con la lista de comandos
  mensajesEnviados.length = 0;
  const manejadoAyuda = await systemBot.manejarComandoSistema('sistema ayuda', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoAyuda === true, '"sistema ayuda" se maneja');
  assert(mensajesEnviados[0].texto.includes('Comandos de sistema'), 'responde con la lista de comandos');
  assert(mensajesEnviados[0].texto.includes('sistema reporte'), 'la ayuda menciona "sistema reporte"');
  assert(mensajesEnviados[0].texto.includes('sistema numero'), 'la ayuda menciona "sistema numero"');

  // ── esCanalAdminActivo / desregistrarCanalAdmin ────────────────────
  systemBot._soloParaTests_reset();
  assert(systemBot.esCanalAdminActivo('uid1', 'x@s.whatsapp.net') === false, 'sin canal registrado, ningún jid es válido');
  systemBot.registrarCanalAdmin('uid1', 'x@s.whatsapp.net');
  assert(systemBot.esCanalAdminActivo('uid1', 'x@s.whatsapp.net') === true, 'jid+userId correctos activan el canal');
  assert(systemBot.esCanalAdminActivo('uid1', 'otro@s.whatsapp.net') === false, 'un jid distinto no activa el canal');
  assert(systemBot.esCanalAdminActivo('uid-otro', 'x@s.whatsapp.net') === false, 'un userId distinto no activa el canal aunque el jid coincida');
  systemBot.desregistrarCanalAdmin('uid-otro');
  assert(systemBot.esCanalAdminActivo('uid1', 'x@s.whatsapp.net') === true, 'desregistrar con un userId que no es el dueño del canal no lo afecta');
  systemBot.desregistrarCanalAdmin('uid1');
  assert(systemBot.esCanalAdminActivo('uid1', 'x@s.whatsapp.net') === false, 'desregistrar con el userId correcto limpia el canal');

  // ── validarNumeroContacto ───────────────────────────────────────────
  let v = systemBot.validarNumeroContacto('5493411234567');
  assert(v.ok === true && v.digits === '5493411234567', 'número válido se acepta tal cual');
  v = systemBot.validarNumeroContacto('+54 9 341 123-4567');
  assert(v.ok === true && v.digits === '5493411234567', 'ignora +, espacios y guiones');
  v = systemBot.validarNumeroContacto('123');
  assert(v.ok === false, 'rechaza número demasiado corto');
  v = systemBot.validarNumeroContacto('1'.repeat(20));
  assert(v.ok === false, 'rechaza número demasiado largo');
  v = systemBot.validarNumeroContacto('');
  assert(v.ok === false, 'rechaza vacío');

  // ── construirReporte (función pura) ─────────────────────────────────
  const mesStr = '2026-07';
  const usuariosReporte = [
    { _id: 'u1', plan: 'trial', botActivo: true, botConectado: true, mensajesMes: 95, mesContadorMensajes: mesStr },
    { _id: 'u2', plan: 'basico', botActivo: true, botConectado: false, mensajesMes: 100, mesContadorMensajes: mesStr },
    { _id: 'u3', plan: 'pro', botActivo: false, botConectado: false, mensajesMes: 0, mesContadorMensajes: '' },
    { _id: 'u4', plan: 'agencia', botActivo: true, botConectado: true, mensajesMes: 0, mesContadorMensajes: '' },
  ];
  const negocioPorUidReporte = { u1: 'Trial Shop', u2: 'Basico Shop' };
  const reporte = systemBot.construirReporte({
    usuarios: usuariosReporte, negocioPorUid: negocioPorUidReporte,
    erroresCount: 3, workerConectado: true, mesStr,
  });
  assert(reporte.includes('Negocios activos: 3'), 'cuenta solo los botActivo=true (u1,u2,u4)');
  assert(reporte.includes('🟢 2 conectados'), 'u1 y u4 están conectados');
  assert(reporte.includes('🔴 1 caídos'), 'u2 está caído');
  assert(reporte.includes('Worker: 🟢 conectado'), 'refleja el estado del worker');
  assert(
    reporte.includes('trial: 1') && reporte.includes('basico: 1') && reporte.includes('pro: 1') && reporte.includes('agencia: 1'),
    'breakdown por plan cuenta todos los usuarios, activos o no',
  );
  assert(reporte.includes('Trial Shop: 95/100'), 'trial al 95% del cupo aparece como cerca del límite');
  assert(!reporte.includes('Basico Shop'), 'basico al 20% del cupo NO aparece como cerca del límite');
  assert(reporte.includes('Errores/críticos (24h):* 3'), 'incluye el conteo de errores recibido');

  const reporteVacio = systemBot.construirReporte({
    usuarios: [], negocioPorUid: {}, erroresCount: 0, workerConectado: false, mesStr,
  });
  assert(reporteVacio.includes('Negocios activos: 0'), 'sin usuarios, cero negocios activos');
  assert(reporteVacio.includes('Worker: 🔴 desconectado'), 'refleja worker desconectado');
  assert(reporteVacio.includes('Ninguno.'), 'sin nadie cerca del límite, dice "Ninguno."');
  assert(reporteVacio.includes('Sin usuarios'), 'sin usuarios, el breakdown de planes dice "Sin usuarios"');

  // ── formatearListaErrores (función pura) ────────────────────────────
  assert(systemBot.formatearListaErrores([], {}).includes('Sin errores'), 'lista vacía de errores');
  const logsErrores = [
    { userId: 'u1', tipo: 'error', nivel: 'critical', mensaje: 'Bot caído', createdAt: new Date('2026-07-20T10:00:00Z') },
    { userId: null, tipo: 'error', nivel: 'error', mensaje: 'Fallo genérico', createdAt: new Date('2026-07-20T11:00:00Z') },
  ];
  const textoErrores = systemBot.formatearListaErrores(logsErrores, { u1: 'Negocio Uno' });
  assert(textoErrores.includes('Últimos 2 errores'), 'encabezado con la cantidad correcta');
  assert(textoErrores.includes('🔴') && textoErrores.includes('Negocio Uno') && textoErrores.includes('Bot caído'), 'nivel critical: ícono rojo + nombre del negocio');
  assert(textoErrores.includes('🟠') && textoErrores.includes('Sistema') && textoErrores.includes('Fallo genérico'), 'log sin userId se etiqueta "Sistema" con ícono naranja');

  // ── "sistema numero" — dispatch completo (pendiente, inválido, cancelar) ──
  systemBot._soloParaTests_reset();
  systemBot.configurarBotManager(fakeBotManager);
  mensajesEnviados.length = 0;
  const manejadoNumero = await systemBot.manejarComandoSistema('sistema numero 5493411234567', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoNumero === true, '"sistema numero <numero>" se maneja');
  assert(systemBot._soloParaTests_getPendiente()?.accion === 'set_numero', 'crea una acción pendiente set_numero');
  assert(systemBot._soloParaTests_getPendiente()?.numero === '5493411234567', 'guarda el número ya normalizado');
  assert(mensajesEnviados.some((m) => m.texto.includes('Confirmás cambiar el número')), 'pide confirmación');

  systemBot._soloParaTests_reset();
  systemBot.configurarBotManager(fakeBotManager);
  mensajesEnviados.length = 0;
  const manejadoNumeroInvalido = await systemBot.manejarComandoSistema('sistema numero 123', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoNumeroInvalido === true, 'un número inválido igual se maneja (avisa el error)');
  assert(systemBot._soloParaTests_getPendiente() === null, 'un número inválido NO crea confirmación pendiente');
  assert(mensajesEnviados.some((m) => m.texto.includes('inválido')), 'avisa que el número es inválido');

  systemBot._soloParaTests_reset();
  systemBot._soloParaTests_setPendiente({
    accion: 'set_numero', numero: '5493411234567', negocio: null,
    createdAt: Date.now(), expiresAt: Date.now() + 60000,
  });
  mensajesEnviados.length = 0;
  const manejadoCancelNumero = await systemBot.manejarComandoSistema('no', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
  assert(manejadoCancelNumero === true, 'cancelar un cambio de número pendiente se maneja');
  assert(mensajesEnviados[0].texto.includes('el número de contacto'), 'cancelar set_numero da un mensaje específico (no "null")');
  assert(systemBot._soloParaTests_getPendiente() === null, 'la acción pendiente se limpia tras cancelar');

  // Confirmar "sistema numero" persiste en Config y re-registra el canal
  // admin de inmediato — se mockea Config.findOneAndUpdate para no requerir
  // Mongo real (mismo criterio que el resto de la suite).
  {
    const originalFindOneAndUpdate = Config.findOneAndUpdate;
    let ultimoUpdate = null;
    Config.findOneAndUpdate = async (filtro, update) => { ultimoUpdate = { filtro, update }; return {}; };

    systemBot._soloParaTests_reset();
    systemBot.configurarBotManager(fakeBotManager);
    systemBot._soloParaTests_setPendiente({
      accion: 'set_numero', numero: '5493411234567', negocio: null,
      createdAt: Date.now(), expiresAt: Date.now() + 60000,
    });
    mensajesEnviados.length = 0;
    const manejadoConfirmNumero = await systemBot.manejarComandoSistema('si', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
    assert(manejadoConfirmNumero === true, 'confirmar "sistema numero" se maneja');
    assert(ultimoUpdate?.filtro?.userId === 'uid-admin', 'persiste el cambio para el userId admin correcto');
    assert(ultimoUpdate?.update?.$set?.celularNotificaciones === '5493411234567', 'guarda el número validado en Config');
    assert(systemBot.esCanalAdminActivo('uid-admin', '5493411234567@s.whatsapp.net') === true, 'el canal admin queda activo en el número nuevo de inmediato');
    assert(mensajesEnviados.some((m) => m.texto.includes('actualizado')), 'confirma el cambio al admin');

    Config.findOneAndUpdate = originalFindOneAndUpdate;
  }

  // ── "sistema reporte" / "sistema errores" — dispatch completo (mockeando Mongo) ──
  {
    const originalUserFind = User.find;
    const originalConfigFind = Config.find;
    const originalLogCount = Log.countDocuments;

    User.find = () => ({
      select: () => ({
        lean: async () => ([
          { _id: 'u1', plan: 'trial', botActivo: true, botConectado: true, mensajesMes: 99, mesContadorMensajes: mesActual() },
        ]),
      }),
    });
    Config.find = () => ({ select: () => ({ lean: async () => ([{ userId: 'u1', negocio: 'Negocio Test' }]) }) });
    Log.countDocuments = async () => 2;

    systemBot._soloParaTests_reset();
    systemBot.configurarBotManager(fakeBotManager);
    mensajesEnviados.length = 0;
    const manejadoReporte = await systemBot.manejarComandoSistema('sistema reporte', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
    assert(manejadoReporte === true, '"sistema reporte" se maneja end-to-end');
    assert(mensajesEnviados[0].texto.includes('Reporte del sistema'), 'responde con el reporte');
    assert(mensajesEnviados[0].texto.includes('Negocio Test'), 'resuelve el nombre real del negocio vía Config');
    assert(mensajesEnviados[0].texto.includes('Errores/críticos (24h):* 2'), 'incluye el conteo real de Log.countDocuments');

    User.find = originalUserFind;
    Config.find = originalConfigFind;
    Log.countDocuments = originalLogCount;
  }

  {
    const originalLogFind = Log.find;
    const originalConfigFind = Config.find;

    Log.find = () => ({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => ([
              { userId: 'u1', tipo: 'error', nivel: 'critical', mensaje: 'Algo se rompió', createdAt: new Date() },
            ]),
          }),
        }),
      }),
    });
    Config.find = () => ({ select: () => ({ lean: async () => ([{ userId: 'u1', negocio: 'Negocio Test' }]) }) });

    systemBot._soloParaTests_reset();
    systemBot.configurarBotManager(fakeBotManager);
    mensajesEnviados.length = 0;
    const manejadoErrores = await systemBot.manejarComandoSistema('sistema errores 5', 'admin@s.whatsapp.net', 'uid-admin', fakeEnviar);
    assert(manejadoErrores === true, '"sistema errores [n]" se maneja end-to-end');
    assert(mensajesEnviados[0].texto.includes('Negocio Test') && mensajesEnviados[0].texto.includes('Algo se rompió'), 'resuelve negocio y muestra el mensaje del log real');

    Log.find = originalLogFind;
    Config.find = originalConfigFind;
  }

  systemBot._soloParaTests_reset();
  console.log('\n✅ Todos los tests de system-bot pasaron.\n');
})().catch((e) => {
  console.error('FAIL (excepción no esperada):', e);
  process.exit(1);
});
