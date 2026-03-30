// services/bot/calendar.service.js
// Calendario propio en MongoDB — sin dependencia de Google Calendar.
'use strict';

const Turno = require('../../models/Turno');

const DIA_NOMBRE = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

function crearCalendarService({ userId, calendarId, horaInicio, horaFin, duracion, zonaHoraria, horarios, diasBloqueados, log }) {

  // Siempre conectado — no depende de OAuth
  function isConnected() { return true; }

  // Crea un objeto Date a partir de componentes (UTC-3 Argentina)
  function crearFecha(y, m, d, h = 0, min = 0) {
    return new Date(Date.UTC(y, m - 1, d, h + 3, min, 0, 0));
  }

  // Obtiene turnos en un rango de fechas para un calendarId
  async function obtenerEventos(calId, ini, fin) {
    try {
      const turnos = await Turno.find({
        userId,
        calendarId: calId || calendarId || 'principal',
        estado:     { $ne: 'cancelado' },
        fechaInicio: { $lt: fin },
        fechaFin:    { $gt: ini },
      }).lean();

      // Retorna formato compatible con el código existente del bot
      return turnos.map(t => ({
        id:      t._id.toString(),
        summary: t.resumen,
        description: t.descripcion,
        start: { dateTime: t.fechaInicio.toISOString() },
        end:   { dateTime: t.fechaFin.toISOString()    },
        _turno: t,
      }));
    } catch (e) {
      log('❌ Turno.find: ' + e.message);
      return [];
    }
  }

  // Retorna slots horarios libres para una fecha dada
  async function horariosLibres(fecha) {
    if (Array.isArray(diasBloqueados) && diasBloqueados.includes(fecha)) return [];

    const [y, m, d] = fecha.split('-').map(Number);
    const fechaObj  = new Date(y, m - 1, d);
    const diaNombre = DIA_NOMBRE[fechaObj.getDay()];

    let hIni = typeof horaInicio === 'number' ? horaInicio : 9;
    let hFin = typeof horaFin   === 'number' ? horaFin   : 18;

    if (horarios && horarios[diaNombre]) {
      const diaConf = horarios[diaNombre];
      if (!diaConf.activo) return [];
      hIni = parseInt((diaConf.inicio || '09:00').split(':')[0]);
      hFin = parseInt((diaConf.fin   || '18:00').split(':')[0]);
    }

    const dur = typeof duracion === 'number' ? duracion : 1;
    const ini = crearFecha(y, m, d, hIni);
    const fin = crearFecha(y, m, d, hFin);
    const ev  = await obtenerEventos(calendarId || 'principal', ini, fin);

    const libres = [];
    for (let h = hIni; h + dur <= hFin; h++) {
      const si = crearFecha(y, m, d, h);
      const sf = crearFecha(y, m, d, h + dur);
      const ocupado = ev.some(e => {
        const ei = new Date(e.start.dateTime);
        const ef = new Date(e.end.dateTime);
        return si < ef && sf > ei;
      });
      if (!ocupado) libres.push(`${h}:00 - ${h + dur}:00`);
    }
    return libres;
  }

  // Crea un turno en MongoDB
  async function crearEvento(calId, resumen, desc, ini, fin, email, tel) {
    try {
      const clienteNombre = resumen.replace(/turno[:\s-]*/i, '').trim();

      const turno = await Turno.create({
        userId,
        calendarId:      calId || calendarId || 'principal',
        resumen,
        descripcion:     desc  || '',
        fechaInicio:     ini,
        fechaFin:        fin,
        clienteNombre,
        clienteTelefono: tel   || '',
        clienteEmail:    email || '',
        estado:          'confirmado',
      });

      log(`✅ Turno creado: ${resumen} (${ini.toISOString()})`);

      if (global.io) {
        global.io.to(`user:${userId}`).emit('turno:nuevo', {
          id:      turno._id.toString(),
          resumen: turno.resumen,
          inicio:  turno.fechaInicio,
          fin:     turno.fechaFin,
          cliente: turno.clienteNombre,
          tel:     turno.clienteTelefono,
        });
      }

      return { id: turno._id.toString(), summary: resumen };
    } catch (e) {
      log('❌ crearEvento: ' + e.message);
      return null;
    }
  }

  // Cancela un turno (soft delete)
  async function eliminarEvento(calId, evId) {
    try {
      await Turno.findByIdAndUpdate(evId, { estado: 'cancelado' });
      return true;
    } catch (e) {
      log('❌ eliminarEvento: ' + e.message);
      return false;
    }
  }

  // Disponibilidad por rango de fechas (alojamiento)
  async function consultarRango(fechaEntrada, fechaSalida, nombreUnidad = null) {
    if (Array.isArray(diasBloqueados) && diasBloqueados.length > 0) {
      const ini = new Date(fechaEntrada);
      const fin = new Date(fechaSalida);
      for (let day = new Date(ini); day < fin; day.setDate(day.getDate() + 1)) {
        const iso = day.toISOString().slice(0, 10);
        if (diasBloqueados.includes(iso)) {
          return { disponible: false, motivo: `El ${iso} no hay disponibilidad.` };
        }
      }
    }

    const [ye, me, de] = fechaEntrada.split('-').map(Number);
    const [ys, ms, ds] = fechaSalida.split('-').map(Number);
    const iniDate = new Date(Date.UTC(ye, me - 1, de));
    const finDate = new Date(Date.UTC(ys, ms - 1, ds));

    const query = {
      userId,
      estado:      { $ne: 'cancelado' },
      fechaInicio: { $lt: finDate },
      fechaFin:    { $gt: iniDate },
    };
    if (nombreUnidad) query.calendarId = nombreUnidad;

    const eventos = await Turno.find(query).lean();
    return {
      disponible: eventos.length === 0,
      eventos: eventos.map(t => ({
        id:      t._id.toString(),
        summary: t.resumen,
        start:   { dateTime: t.fechaInicio.toISOString() },
        end:     { dateTime: t.fechaFin.toISOString() },
      })),
    };
  }

  // Compatibilidad — ya no necesita tokens
  function recargarTokens() { log('ℹ️ Calendario propio — sin tokens'); }

  log('✅ Calendario propio (MongoDB) listo — sin Google Calendar');

  return { isConnected, crearFecha, obtenerEventos, horariosLibres, consultarRango, crearEvento, eliminarEvento, recargarTokens };
}

module.exports = crearCalendarService;
