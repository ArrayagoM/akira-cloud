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

  systemBot._soloParaTests_reset();
  console.log('\n✅ Todos los tests de system-bot pasaron.\n');
})().catch((e) => {
  console.error('FAIL (excepción no esperada):', e);
  process.exit(1);
});
