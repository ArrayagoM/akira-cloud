// services/bot.manager.js — sustituto liviano para el servidor de Vercel.
// En la plataforma original el panel admin controlaba los bots que corrían
// en el servidor. Ahora cada bot corre en la PC de su cliente: acá no hay
// bots en memoria. Lo único con efecto real es bloquear a un usuario, que
// revoca sus equipos para que la app deje de funcionar en el próximo chequeo
// de licencia (ver routes/licenses.routes.js → heartbeat).
'use strict';

const Device = require('../models/Device');
const User = require('../models/User');

const SIN_BOTS = 'Los bots corren en la PC de cada cliente, no en el servidor.';
// Los equipos revocados por un bloqueo llevan esta marca, para que al desbloquear se devuelvan SOLO esos (no los que el usuario quitó él).
const MARCA_BLOQUEO = 'Bloqueo de cuenta: ';

module.exports = {
  MARCA_BLOQUEO,
  getActiveCount: () => 0,
  getActiveUserIds: () => [],
  getQRPendiente: () => null,
  // Bloquea la cuenta de verdad (antes solo revocaba los equipos y el usuario seguía entrando): marca el estado, invalida sus sesiones
  // (tokenVersion) y revoca sus equipos. Nunca bloquea a un administrador.
  async panicStop(userId, motivo) {
    const razon = String(motivo || 'Bloqueado por administrador');
    const u = await User.findOneAndUpdate({ _id: userId, rol: { $ne: 'admin' } }, { status: 'bloqueado', bloqueadoPor: razon, $inc: { tokenVersion: 1 } });
    if (!u) return { ok: false, msg: 'No se bloqueó: el usuario no existe o es administrador.' };
    const r = await Device.updateMany({ userId, revocado: false }, { revocado: true, revocadoMotivo: MARCA_BLOQUEO + razon, revocadoEn: new Date() });
    return { ok: true, msg: `Cuenta bloqueada y ${r.modifiedCount || 0} equipo(s) revocado(s)` };
  },
  // Desbloquea: la cuenta vuelve a estar activa y se devuelven los equipos que había revocado el bloqueo (no los demás).
  async desbloquear(userId) {
    await User.findByIdAndUpdate(userId, { status: 'activo', bloqueadoPor: null });
    const r = await Device.updateMany({ userId, revocado: true, revocadoMotivo: { $regex: '^' + MARCA_BLOQUEO } }, { revocado: false, revocadoMotivo: '' });
    return { ok: true, msg: `Cuenta activa y ${r.modifiedCount || 0} equipo(s) devuelto(s)` };
  },
  async stopBot() { return { ok: false, msg: SIN_BOTS }; },
  async startBot() { return { ok: false, msg: SIN_BOTS }; },
  async ejecutarHealthcheck() {},
};
