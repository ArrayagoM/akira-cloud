// local-api/importador.js
// Trae a la base local lo que el usuario ya tenía cargado en la plataforma:
// configuración del negocio + API keys (llegan descifradas por HTTPS y se
// vuelven a cifrar acá con safeStorage), clientes con su historial, turnos
// y lista de espera. Es idempotente: conserva los _id originales, así que
// volver a importar actualiza en vez de duplicar.
'use strict';

const licenseClient = require('../license/license-client');
const Config = require('../bot-engine/models/Config');
const BotCliente = require('../bot-engine/models/BotCliente');
const Turno = require('../bot-engine/models/Turno');
const WaitlistEntry = require('../bot-engine/models/WaitlistEntry');
const Log = require('../bot-engine/models/Log');

const CAMPOS_SECRETOS = ['keyGroq', 'keyMP', 'idCalendar', 'keyRime', 'keyNgrok', 'credentialsGoogleB64', 'googleCalendarTokens'];

async function importarConfig(userId, headers) {
  const { config, secrets } = await licenseClient.request('/api/sync/config', 'GET', null, headers);
  if (!config) return { config: false, keys: 0 };

  const { _id, ...resto } = config;
  let cfg = await Config.findOne({ userId });
  if (!cfg) {
    cfg = await Config.create({ ...Config.DEFAULTS, ...resto, _id, userId });
  } else {
    Object.assign(cfg, resto, { userId });
  }
  let keys = 0;
  for (const campo of CAMPOS_SECRETOS) {
    if (secrets?.[campo]) { cfg.setKey(campo, secrets[campo]); keys++; }
  }
  await cfg.save();
  return { config: true, keys };
}

async function importarColeccion(nombre, Modelo, userId, headers, onProgreso) {
  let cursor = null;
  let importados = 0;
  let omitidos = 0;
  do {
    const q = `/api/sync/${nombre}?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    const { items, nextCursor } = await licenseClient.request(q, 'GET', null, headers);
    for (const item of items) {
      try {
        await Modelo.findByIdAndUpdate(item._id, { ...item, userId }, { upsert: true });
        importados++;
      } catch (e) {
        if (e.code === 11000) omitidos++; // choca con un registro local distinto (mismo slot/cliente)
        else throw e;
      }
    }
    onProgreso?.(nombre, importados);
    cursor = nextCursor;
  } while (cursor);
  return { importados, omitidos };
}

async function importarTodo({ userId, deviceId, onProgreso }) {
  const headers = { 'x-device-id': deviceId };
  const resumen = {};
  resumen.config = await importarConfig(userId, headers);
  resumen.clientes = await importarColeccion('clientes', BotCliente, userId, headers, onProgreso);
  resumen.turnos = await importarColeccion('turnos', Turno, userId, headers, onProgreso);
  resumen.waitlist = await importarColeccion('waitlist', WaitlistEntry, userId, headers, onProgreso);
  await Log.registrar({
    userId, tipo: 'config_update',
    mensaje: `Importado desde la nube: ${resumen.config.keys} key(s), ${resumen.clientes.importados} cliente(s), ${resumen.turnos.importados} turno(s)`,
  });
  return resumen;
}

module.exports = { importarTodo };
