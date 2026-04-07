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
    if (Array.isArray(diasBloqueados) && diasBloqueados.includes(fecha)) {
      log(`[Calendar] ${fecha} bloqueado — sin slots`);
      return [];
    }

    const [y, m, d] = fecha.split('-').map(Number);
    const fechaObj  = new Date(y, m - 1, d);
    const diaNombre = DIA_NOMBRE[fechaObj.getDay()];

    // Helpers de conversión minutos ↔ "H:MM"
    const toMins = (hhmm) => {
      const [h, min] = (hhmm || '00:00').split(':').map(Number);
      return (h || 0) * 60 + (min || 0);
    };
    const toStr = (totalMins) => {
      const h   = Math.floor(totalMins / 60);
      const min = totalMins % 60;
      return `${h}:${min.toString().padStart(2, '0')}`;
    };

    // Determinar franjas horarias del día
    let franjas = [];

    if (horarios && horarios[diaNombre]) {
      const diaConf = horarios[diaNombre];
      if (!diaConf.activo) {
        log(`[Calendar] ${diaNombre} marcado como inactivo en horarios`);
        return [];
      }
      if (Array.isArray(diaConf.franjas) && diaConf.franjas.length > 0) {
        // Nuevo formato: múltiples franjas (ej. 9-13 y 17-21:30)
        franjas = diaConf.franjas.map(f => ({
          ini: toMins(f.inicio || '09:00'),
          fin: toMins(f.fin   || '18:00'),
        }));
      } else {
        // Formato legado: un solo rango inicio/fin
        franjas = [{
          ini: toMins(diaConf.inicio || '09:00'),
          fin: toMins(diaConf.fin   || '18:00'),
        }];
      }
    } else {
      const hIni = typeof horaInicio === 'number' ? horaInicio : 9;
      const hFin = typeof horaFin   === 'number' ? horaFin   : 18;
      franjas = [{ ini: hIni * 60, fin: hFin * 60 }];
    }

    log(`[Calendar] ${fecha} (${diaNombre}) franjas: ${franjas.map(f => `${toStr(f.ini)}-${toStr(f.fin)}`).join(', ')} userId=${userId}`);

    const durMins = (typeof duracion === 'number' ? duracion : 1) * 60;

    // Buscar eventos en el día completo (cubre todas las franjas)
    const dayStart = crearFecha(y, m, d, 0, 0);
    const dayEnd   = crearFecha(y, m, d, 23, 59);
    const ev = await obtenerEventos(calendarId || 'principal', dayStart, dayEnd);

    const libres = [];
    for (const franja of franjas) {
      for (let mins = franja.ini; mins + durMins <= franja.fin; mins += durMins) {
        const si = crearFecha(y, m, d, Math.floor(mins / 60), mins % 60);
        const sf = crearFecha(y, m, d, Math.floor((mins + durMins) / 60), (mins + durMins) % 60);
        const ocupado = ev.some(e => {
          const ei = new Date(e.start.dateTime);
          const ef = new Date(e.end.dateTime);
          return si < ef && sf > ei;
        });
        if (!ocupado) libres.push(`${toStr(mins)} - ${toStr(mins + durMins)}`);
      }
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
      log(`❌ crearEvento ERROR: ${e.message} | userId=${userId} | resumen="${resumen}" | ini=${ini} | fin=${fin}`);
      if (e.errors) log(`❌ Validación: ${JSON.stringify(e.errors)}`);
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
    // Usar crearFecha para obtener medianoche en hora Argentina (UTC-3)
    const iniDate = crearFecha(ye, me, de, 0, 0);
    const finDate = crearFecha(ys, ms, ds, 0, 0);

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
