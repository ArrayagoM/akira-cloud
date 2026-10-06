// services/bot.manager.js — sustituto liviano para el servidor de Vercel.
// En la plataforma original el panel admin controlaba los bots que corrían
// en el servidor. Ahora cada bot corre en la PC de su cliente: acá no hay
// bots en memoria. Lo único con efecto real es bloquear a un usuario, que
// revoca sus equipos para que la app deje de funcionar en el próximo chequeo
// de licencia (ver routes/licenses.routes.js → heartbeat).
'use strict';

const Device = require('../models/Device');

const SIN_BOTS = 'Los bots corren en la PC de cada cliente, no en el servidor.';

module.exports = {
  getActiveCount: () => 0,
  getActiveUserIds: () => [],
  getQRPendiente: () => null,
  async panicStop(userId, motivo) {
    const r = await Device.updateMany({ userId, revocado: false }, { revocado: true, revocadoMotivo: String(motivo || 'Bloqueado por administrador'), revocadoEn: new Date() });
    return { ok: true, msg: `${r.modifiedCount || 0} equipo(s) revocado(s)` };
  },
  async stopBot() { return { ok: false, msg: SIN_BOTS }; },
  async startBot() { return { ok: false, msg: SIN_BOTS }; },
  async ejecutarHealthcheck() {},
};
