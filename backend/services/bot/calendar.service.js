// services/bot/calendar.service.js
// Servicio de calendario HÍBRIDO:
//   — MongoDB  : fuente de verdad (siempre activo)
//   — Google Calendar : sincronización opcional (cuando el usuario conectó su cuenta)
//
// Flujo crearEvento:
//   1. Verificar conflicto en MongoDB
//   2. Si GCal disponible → verificar conflicto en Google Calendar también
//   3. Crear en MongoDB (fuente de verdad)
//   4. Si GCal disponible → crear en Google Calendar (con attendee si hay email)
//   5. Verificar via GET que el evento de GCal realmente existe
//   6. Guardar googleEventId en el documento Turno de MongoDB
//
// Flujo obtenerEventos:
//   — Solo MongoDB (GCal es de escritura/sync, la disponibilidad la maneja Mongo)
'use strict';

const Turno  = require('../../models/Turno');
const { crearGoogleCalendarService } = require('./google.calendar.service');

const DIA_NOMBRE = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

function crearCalendarService({
  userId,
  calendarId,
  horaInicio,
  horaFin,
  duracion,
  zonaHoraria,
  horarios,
  diasBloqueados,
  log,
  // Google Calendar — opcionales
  googleTokens    = null,   // tokens OAuth2 ya parseados
  googleCalId     = null,   // ID del calendario de Google (default: 'primary')
  onTokenRefresh  = null,   // callback para persistir tokens refrescados
}) {

  // ── Google Calendar service (si hay tokens) ──────────────────
  let gCal = null;
  if (googleTokens?.access_token) {
    try {
      gCal = crearGoogleCalendarService({
        tokens:         googleTokens,
        calendarId:     googleCalId || 'primary',
        log,
        onTokenRefresh,
      });
      if (gCal) {
        log('[Calendar] 🔗 Google Calendar vinculado — modo híbrido activo');
        // Verificar la conexión en background (no bloqueante)
        gCal.verificarConexion().then(r => {
          if (!r.ok) log(`[Calendar] ⚠️ Google Calendar conectado pero verificación falló: ${r.error}`);
          else        log(`[Calendar] ✅ Google Calendar verificado: ${r.calendarSummary || googleCalId || 'primary'}`);
        }).catch(() => {});
      }
    } catch (e) {
      log(`[Calendar] ⚠️ No se pudo crear Google Calendar service: ${e.message}`);
      gCal = null;
    }
  } else {
    log('[Calendar] ✅ Calendario propio (MongoDB) — sin Google Calendar vinculado');
  }

  // ── Timezone offset ──────────────────────────────────────────
  const TZ_OFFSET_H = 3; // Argentina UTC-3, sin DST

  function crearFecha(y, m, d, h = 0, min = 0) {
    return new Date(Date.UTC(y, m - 1, d, h + TZ_OFFSET_H, min, 0, 0));
  }

  function getDiaLocal(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getDay();
  }

  // ── obtenerEventos — solo MongoDB ────────────────────────────
  async function obtenerEventos(calId, ini, fin) {
    try {
      const turnos = await Turno.find({
        userId,
        calendarId: calId || calendarId || 'principal',
        estado:     { $ne: 'cancelado' },
        fechaInicio: { $lt: fin },
        fechaFin:    { $gt: ini },
      }).lean();

      return turnos.map(t => ({
        id:          t._id.toString(),
        summary:     t.resumen,
        description: t.descripcion,
        start:       { dateTime: t.fechaInicio.toISOString() },
        end:         { dateTime: t.fechaFin.toISOString()    },
        googleEventId: t.googleEventId || null,
        _turno:      t,
      }));
    } catch (e) {
      log('❌ Turno.find: ' + e.message);
      return [];
    }
  }

  // ── horariosLibres ───────────────────────────────────────────
  async function horariosLibres(fecha) {
    if (Array.isArray(diasBloqueados) && diasBloqueados.includes(fecha)) {
      log(`[Calendar] ${fecha} bloqueado — sin slots`);
      return [];
    }

    const [y, m, d] = fecha.split('-').map(Number);
    const diaNombre  = DIA_NOMBRE[getDiaLocal(y, m, d)];

    const toMins = (hhmm) => {
      const [h, min] = (hhmm || '00:00').split(':').map(Number);
      return (h || 0) * 60 + (min || 0);
    };
    const toStr = (totalMins) => {
      const h   = Math.floor(totalMins / 60);
      const min = totalMins % 60;
      return `${h}:${min.toString().padStart(2, '0')}`;
    };

    let franjas = [];
    if (horarios && horarios[diaNombre]) {
      const diaConf = horarios[diaNombre];
      if (!diaConf.activo) {
        log(`[Calendar] ${diaNombre} marcado como inactivo`);
        return [];
      }
      if (Array.isArray(diaConf.franjas) && diaConf.franjas.length > 0) {
        franjas = diaConf.franjas.map(f => ({
          ini: toMins(f.inicio || '09:00'),
          fin: toMins(f.fin   || '18:00'),
        }));
      } else {
        franjas = [{ ini: toMins(diaConf.inicio || '09:00'), fin: toMins(diaConf.fin || '18:00') }];
      }
    } else {
      const hIni = typeof horaInicio === 'number' ? horaInicio : 9;
      const hFin = typeof horaFin   === 'number' ? horaFin   : 18;
      franjas = [{ ini: hIni * 60, fin: hFin * 60 }];
    }

    log(`[Calendar] ${fecha} (${diaNombre}) franjas: ${franjas.map(f => `${toStr(f.ini)}-${toStr(f.fin)}`).join(', ')}`);

    const durMins = (typeof duracion === 'number' ? duracion : 1) * 60;
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

  // ── crearEvento — HÍBRIDO con todas las verificaciones ───────
  /**
   * @param {string} calId
   * @param {string} resumen
   * @param {string} desc
   * @param {Date}   ini
   * @param {Date}   fin
   * @param {string} [email]   – email del cliente (para attendee en GCal)
   * @param {string} [tel]
   */
  async function crearEvento(calId, resumen, desc, ini, fin, email, tel) {
    const calIdReal = calId || calendarId || 'principal';

    // ── VERIFICACIÓN 1: conflicto en MongoDB ──
    const conflictoMongo = await Turno.findOne({
      userId,
      calendarId: calIdReal,
      estado:     { $ne: 'cancelado' },
      fechaInicio: { $lt: fin },
      fechaFin:    { $gt: ini },
    }).lean();

    if (conflictoMongo) {
      log(`⚠️ Conflicto MongoDB: slot ya ocupado por "${conflictoMongo.resumen}"`);
      return { slotOcupado: true, fuente: 'mongodb', conflicto: conflictoMongo.resumen };
    }

    // ── VERIFICACIÓN 2: conflicto en Google Calendar (si disponible) ──
    if (gCal) {
      const { conflicto, evento } = await gCal.detectarConflicto(ini, fin);
      if (conflicto) {
        log(`⚠️ Conflicto Google Calendar: "${evento?.summary}"`);
        return { slotOcupado: true, fuente: 'google_calendar', conflicto: evento?.summary };
      }
    }

    // ── ESCRITURA 1: crear en MongoDB (fuente de verdad) ──
    let turnoDoc;
    const clienteNombre = resumen.replace(/turno[:\s-]*/i, '').trim();
    try {
      turnoDoc = await Turno.create({
        userId,
        calendarId:       calIdReal,
        resumen,
        descripcion:      desc  || '',
        fechaInicio:      ini,
        fechaFin:         fin,
        clienteNombre,
        clienteTelefono:  tel   || '',
        clienteEmail:     email || '',
        estado:           'confirmado',
        googleSyncStatus: gCal ? 'pending' : null,
      });
      log(`✅ Turno creado en MongoDB: "${resumen}" (${ini.toISOString()})`);
    } catch (e) {
      log(`❌ crearEvento MongoDB ERROR: ${e.message}`);
      if (e.errors) log(`❌ Validación: ${JSON.stringify(e.errors)}`);
      return null;
    }

    // Emitir evento al panel en tiempo real
    if (global.io) {
      global.io.to(`user:${userId}`).emit('turno:nuevo', {
        id:      turnoDoc._id.toString(),
        resumen: turnoDoc.resumen,
        inicio:  turnoDoc.fechaInicio,
        fin:     turnoDoc.fechaFin,
        cliente: turnoDoc.clienteNombre,
        tel:     turnoDoc.clienteTelefono,
      });
    }

    // ── ESCRITURA 2 + VERIFICACIÓN 3: sincronizar a Google Calendar ──
    if (gCal) {
      try {
        log(`[Calendar] Sincronizando turno ${turnoDoc._id} a Google Calendar...`);
        const gResult = await gCal.crearEvento({
          summary:                resumen,
          description:            desc || '',
          ini,
          fin,
          clienteEmail:           email || '',
          verificarConflictoFlag: false, // ya lo verificamos arriba
        });

        if (gResult.ok) {
          // Guardar el googleEventId en MongoDB para poder eliminarlo/actualizarlo después
          await Turno.findByIdAndUpdate(turnoDoc._id, {
            googleEventId:    gResult.eventId,
            googleCalendarId: gCal.calendarId,
            googleSyncStatus: 'synced',
            googleSyncedAt:   new Date(),
          });
          log(`[Calendar] ✅ Sync GCal OK — eventId: ${gResult.eventId}`);
          if (gResult.link) {
            log(`[Calendar] 🔗 Link GCal: ${gResult.link}`);
          }
        } else {
          // Sincronización falló — el turno en MongoDB queda igual, solo marcamos el error
          await Turno.findByIdAndUpdate(turnoDoc._id, {
            googleSyncStatus: 'failed',
            googleSyncError:  gResult.error || 'unknown',
          });
          if (gResult.conflicto) {
            log(`[Calendar] ⚠️ GCal reportó conflicto post-verificación — turno en MongoDB igual creado`);
          } else {
            log(`[Calendar] ⚠️ Sync GCal falló: ${gResult.error} — turno MongoDB OK de todas formas`);
          }
        }
      } catch (e) {
        log(`[Calendar] ⚠️ Sync GCal excepción: ${e.message} — turno MongoDB OK`);
        await Turno.findByIdAndUpdate(turnoDoc._id, {
          googleSyncStatus: 'failed',
          googleSyncError:  e.message,
        }).catch(() => {});
      }
    }

    return { id: turnoDoc._id.toString(), summary: resumen };
  }

  // ── eliminarEvento ───────────────────────────────────────────
  async function eliminarEvento(calId, evId) {
    try {
      // Buscar el turno para saber si tiene googleEventId
      const turno = await Turno.findById(evId).lean().catch(() => null);
      await Turno.findByIdAndUpdate(evId, { estado: 'cancelado' });
      log(`[Calendar] Turno ${evId} marcado como cancelado`);

      // Eliminar también de Google Calendar si hay vínculo
      if (gCal && turno?.googleEventId) {
        const gResult = await gCal.eliminarEvento(turno.googleEventId);
        if (gResult.ok) {
          log(`[Calendar] ✅ Evento GCal eliminado: ${turno.googleEventId}`);
        } else {
          log(`[Calendar] ⚠️ No se pudo eliminar de GCal: ${gResult.error}`);
        }
      }
      return true;
    } catch (e) {
      log('❌ eliminarEvento: ' + e.message);
      return false;
    }
  }

  // ── consultarRango (alojamiento) ─────────────────────────────
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

    // También verificar en Google Calendar si está disponible
    let gCalConflicto = false;
    if (gCal && eventos.length === 0) {
      const { conflicto } = await gCal.detectarConflicto(iniDate, finDate);
      gCalConflicto = conflicto;
    }

    const disponible = eventos.length === 0 && !gCalConflicto;
    return {
      disponible,
      eventos: eventos.map(t => ({
        id:      t._id.toString(),
        summary: t.resumen,
        start:   { dateTime: t.fechaInicio.toISOString() },
        end:     { dateTime: t.fechaFin.toISOString() },
      })),
    };
  }

  /**
   * Retroactivamente agrega el email del cliente como attendee en GCal.
   * Llamado desde capturaEmail cuando el email llega DESPUÉS de la creación del turno.
   * @param {string} turnoId – _id del Turno en MongoDB
   * @param {string} email
   */
  async function agregarEmailATurno(turnoId, email) {
    if (!gCal || !turnoId || !email) return;
    try {
      const turno = await Turno.findById(turnoId).lean();
      if (!turno) return;

      // Guardar email en el turno
      await Turno.findByIdAndUpdate(turnoId, { clienteEmail: email });

      // Si tiene googleEventId, agregar como attendee
      if (turno.googleEventId) {
        const r = await gCal.agregarAttendee(turno.googleEventId, email);
        if (r.ok) log(`[Calendar] ✅ Email ${email} agregado como attendee en GCal evento ${turno.googleEventId}`);
        else       log(`[Calendar] ⚠️ No se pudo agregar attendee GCal: ${r.error}`);
      }
    } catch (e) {
      log(`[Calendar] agregarEmailATurno error: ${e.message}`);
    }
  }

  // Compatibilidad — ya no necesita tokens externos
  function recargarTokens() { log('[Calendar] recargarTokens — sin acción necesaria'); }

  return {
    isConnected:      () => true,
    gCalConectado:    () => !!gCal,
    crearFecha,
    obtenerEventos,
    horariosLibres,
    consultarRango,
    crearEvento,
    eliminarEvento,
    agregarEmailATurno,
    recargarTokens,
  };
}

module.exports = crearCalendarService;
