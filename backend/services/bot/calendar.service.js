// services/bot/calendar.service.js
// Integración con Google Calendar.
'use strict';

const fs             = require('fs');
const { google }     = require('googleapis');

// Mapa JS day-of-week → nombre en horariosAtencion
const DIA_NOMBRE = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

function crearCalendarService({ calendarId, credentialsPath, horaInicio, horaFin, duracion, zonaHoraria, horarios, diasBloqueados, log }) {
  let calendarAuth = null;

  if (credentialsPath && fs.existsSync(credentialsPath)) {
    try {
      calendarAuth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
      log('✅ Google Calendar configurado');
    } catch (e) { log('⚠️ Calendar: ' + e.message); }
  }

  function crearFecha(y, m, d, h = 0, min = 0) {
    return new Date(Date.UTC(y, m - 1, d, h + 3, min, 0, 0));
  }

  async function obtenerEventos(calId, ini, fin) {
    if (!calendarAuth) return [];
    try {
      const cal = google.calendar({ version: 'v3', auth: calendarAuth });
      const r = await cal.events.list({
        calendarId: calId,
        timeMin: ini.toISOString(),
        timeMax: fin.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      return r.data.items || [];
    } catch (e) { log('❌ Calendar: ' + e.message); return []; }
  }

  async function horariosLibres(fecha) {
    // 1. Verificar días bloqueados
    if (Array.isArray(diasBloqueados) && diasBloqueados.includes(fecha)) return [];

    // 2. Determinar horario del día según configuración
    const [y, m, d] = fecha.split('-').map(Number);
    const fechaObj  = new Date(y, m - 1, d);
    const diaNombre = DIA_NOMBRE[fechaObj.getDay()];

    let hIni = horaInicio;
    let hFin = horaFin;

    if (horarios && horarios[diaNombre]) {
      const diaConf = horarios[diaNombre];
      if (!diaConf.activo) return []; // día cerrado
      hIni = parseInt((diaConf.inicio || '09:00').split(':')[0]);
      hFin = parseInt((diaConf.fin   || '18:00').split(':')[0]);
    }

    const ev = await obtenerEventos(calendarId, crearFecha(y, m, d, hIni), crearFecha(y, m, d, hFin));
    const libres = [];
    for (let h = hIni; h < hFin; h++) {
      const si = crearFecha(y, m, d, h);
      const sf = crearFecha(y, m, d, h + duracion);
      const ocu = ev.some(e => {
        const ei = new Date(e.start.dateTime || e.start.date);
        const ef = new Date(e.end.dateTime   || e.end.date);
        return si < ef && sf > ei;
      });
      if (!ocu) libres.push(`${h}:00 - ${h + 1}:00`);
    }
    return libres;
  }

  async function crearEvento(calId, resumen, desc, ini, fin, email, tel) {
    if (!calendarAuth) return null;
    try {
      const cal = google.calendar({ version: 'v3', auth: calendarAuth });
      const r = await cal.events.insert({
        calendarId: calId,
        resource: {
          summary: resumen,
          description: desc + (tel ? `\nTel: +${tel}` : '') + (email ? `\nEmail: ${email}` : ''),
          start: { dateTime: ini.toISOString(), timeZone: zonaHoraria },
          end:   { dateTime: fin.toISOString(), timeZone: zonaHoraria },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 },
              { method: 'popup', minutes: 30 },
            ],
          },
        },
        sendUpdates: 'none',
      });
      return r.data;
    } catch (e) { log('❌ Evento: ' + e.message); return null; }
  }

  async function eliminarEvento(calId, evId) {
    if (!calendarAuth) return false;
    try {
      await google.calendar({ version: 'v3', auth: calendarAuth }).events.delete({ calendarId: calId, eventId: evId });
      return true;
    } catch { return false; }
  }

  return { crearFecha, obtenerEventos, horariosLibres, crearEvento, eliminarEvento };
}

module.exports = crearCalendarService;
