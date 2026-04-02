// services/bot/waitlist.service.js
// Lista de espera automática: cuando se libera un turno, notifica al siguiente en cola.
'use strict';

const WaitlistEntry = require('../../models/WaitlistEntry');
const OFERTA_DURACION_MS = 15 * 60 * 1000; // 15 minutos

function crearWaitlistService({ userId, calendarId, log }) {
  // timers activos: key → setTimeout handle
  const timersActivos = {};

  // Agrega cliente a la lista de espera
  async function agregarALista(jid, nombre, tel, fecha, hora = null) {
    try {
      // Evitar duplicados para el mismo cliente+fecha
      const existe = await WaitlistEntry.findOne({ userId, jid, fecha, estado: 'esperando' });
      if (existe) return { ok: false, msg: 'Ya estás en la lista de espera para esa fecha.' };

      await WaitlistEntry.create({
        userId, jid,
        clienteNombre: nombre,
        clienteTel:    tel,
        fecha,
        hora,
        calendarId:    calendarId || 'principal',
      });
      log(`[Waitlist] ✅ ${nombre} anotado para ${fecha}${hora ? ' ' + hora : ''}`);
      return { ok: true };
    } catch (e) {
      log(`[Waitlist] ❌ agregarALista: ${e.message}`);
      return { ok: false, msg: 'Error al anotarte. Intentá de nuevo.' };
    }
  }

  // Notifica al siguiente en la cola cuando se libera un slot
  async function notificarSiguiente(fecha, hora, enviarMensaje, notificarDueno) {
    try {
      const entry = await WaitlistEntry.findOne({
        userId, fecha, estado: 'esperando',
        $or: [{ hora: null }, { hora: hora }],
      }).sort({ createdAt: 1 });

      if (!entry) {
        log(`[Waitlist] Sin candidatos para ${fecha} ${hora}`);
        return;
      }

      const ahora = new Date();
      entry.estado      = 'contactado';
      entry.contactadoEn = ahora;
      entry.expiraEn     = new Date(ahora.getTime() + OFERTA_DURACION_MS);
      await entry.save();

      const msg =
        `🎉 ¡Buenas ${entry.clienteNombre}! Se liberó un turno para el *${fecha}*` +
        (hora ? ` a las *${hora}*` : '') +
        `.\n¿Lo querés? Respondé *SÍ* para confirmarlo.\n⏳ Tenés 15 minutos antes de que se le ofrezca a otro.`;
      await enviarMensaje(entry.jid, msg);
      log(`[Waitlist] 📩 Oferta enviada a ${entry.clienteNombre} (${entry.jid})`);

      // Timer de expiración: si no responde, pasar al siguiente
      const key = `${entry._id}`;
      if (timersActivos[key]) clearTimeout(timersActivos[key]);
      timersActivos[key] = setTimeout(async () => {
        delete timersActivos[key];
        const fresca = await WaitlistEntry.findById(entry._id);
        if (fresca?.estado === 'contactado') {
          fresca.estado = 'expirado';
          await fresca.save();
          log(`[Waitlist] ⏰ Oferta expirada para ${entry.clienteNombre} — buscando siguiente`);
          await notificarSiguiente(fecha, hora, enviarMensaje, notificarDueno);
        }
      }, OFERTA_DURACION_MS);

    } catch (e) {
      log(`[Waitlist] ❌ notificarSiguiente: ${e.message}`);
    }
  }

  // Confirma la reserva del cliente que está en estado 'contactado'
  async function confirmarDesdeWaitlist(jid, fecha, crearEventoFn, nombre) {
    try {
      const entry = await WaitlistEntry.findOne({ userId, jid, fecha, estado: 'contactado' });
      if (!entry) return { ok: false };
      if (new Date() > entry.expiraEn) {
        entry.estado = 'expirado';
        await entry.save();
        return { ok: false, expirado: true };
      }
      entry.estado = 'confirmado';
      await entry.save();
      return { ok: true, hora: entry.hora };
    } catch (e) {
      log(`[Waitlist] ❌ confirmarDesdeWaitlist: ${e.message}`);
      return { ok: false };
    }
  }

  // Verifica si el cliente tiene una oferta de waitlist activa
  async function tieneOfertaActiva(jid, fecha) {
    const entry = await WaitlistEntry.findOne({
      userId, jid, fecha, estado: 'contactado',
      expiraEn: { $gt: new Date() },
    });
    return entry || null;
  }

  // Listar espera activa para una fecha (para el dashboard)
  async function listarEspera(fecha) {
    return WaitlistEntry.find({ userId, fecha, estado: 'esperando' }).sort({ createdAt: 1 }).lean();
  }

  return { agregarALista, notificarSiguiente, confirmarDesdeWaitlist, tieneOfertaActiva, listarEspera };
}

module.exports = crearWaitlistService;
