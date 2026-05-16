// services/bot/google.calendar.service.js
// Wrapper sobre la API de Google Calendar con verificaciones completas.
//
// Responsabilidades:
//   - Gestionar OAuth2 (auto-refresh de tokens)
//   - Crear eventos con attendees (cliente recibe invitación en su Gmail)
//   - Verificar mediante GET que el evento realmente fue creado
//   - Detectar conflictos en Google Calendar antes de crear
//   - Eliminar / agregar attendees a eventos existentes
//   - Notificar al caller cuando los tokens se refrescan (para persistir en DB)
'use strict';

const { google } = require('googleapis');

const TZ_ARG = 'America/Argentina/Buenos_Aires';
// Reintentos para operaciones de escritura (crea/elimina)
const MAX_WRITE_RETRIES = 2;
const RETRY_DELAY_MS    = 1500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * @param {object} opts
 * @param {object}   opts.tokens          – tokens OAuth2 {access_token,refresh_token,...}
 * @param {string}   opts.calendarId      – ID del calendario ('primary' o el específico del user)
 * @param {function} opts.log
 * @param {function} [opts.onTokenRefresh] – (newTokens) => void — para persistir tokens
 */
function crearGoogleCalendarService({ tokens, calendarId = 'primary', log, onTokenRefresh }) {

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    log('[GCal] ⚠️ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados — servicio desactivado');
    return null;
  }
  if (!tokens?.access_token) {
    log('[GCal] ⚠️ Sin access_token — servicio desactivado');
    return null;
  }

  // ── OAuth2 client ────────────────────────────────────────────
  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BACKEND_URL}/api/config/google/callback`
  );
  oAuth2.setCredentials(tokens);

  // Cuando Google renueva el access_token automáticamente, persistirlo
  oAuth2.on('tokens', (newTokens) => {
    log('[GCal] Tokens renovados automáticamente');
    if (onTokenRefresh) {
      const merged = { ...tokens, ...newTokens };
      onTokenRefresh(merged);
    }
  });

  const gcal = google.calendar({ version: 'v3', auth: oAuth2 });

  // ── Helpers ──────────────────────────────────────────────────

  function _formatErr(e) {
    const status = e?.response?.status || e?.code || '';
    const msg    = e?.response?.data?.error?.message || e?.message || String(e);
    return status ? `[${status}] ${msg}` : msg;
  }

  async function _withRetry(fn, label) {
    let lastErr;
    for (let i = 0; i <= MAX_WRITE_RETRIES; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const status = e?.response?.status;
        // No reintentar errores de permisos / not found
        if (status === 401 || status === 403 || status === 404) break;
        if (i < MAX_WRITE_RETRIES) {
          log(`[GCal] ${label} — intento ${i + 1} falló (${_formatErr(e)}), reintentando...`);
          await sleep(RETRY_DELAY_MS * (i + 1));
        }
      }
    }
    throw lastErr;
  }

  // ── API pública ──────────────────────────────────────────────

  /**
   * Verifica que la conexión OAuth esté activa haciendo una llamada real a la API.
   * @returns {{ ok: boolean, email?: string, error?: string }}
   */
  async function verificarConexion() {
    try {
      const res = await gcal.calendarList.get({ calendarId });
      log(`[GCal] ✅ Conexión OK — calendario: "${res.data.summary || calendarId}"`);
      return { ok: true, calendarSummary: res.data.summary };
    } catch (e) {
      const err = _formatErr(e);
      log(`[GCal] ❌ verificarConexion: ${err}`);
      return { ok: false, error: err };
    }
  }

  /**
   * Lista eventos en Google Calendar en un rango [ini, fin).
   * @param {Date} ini
   * @param {Date} fin
   * @returns {Array} – array de eventos de la API de Google
   */
  async function obtenerEventos(ini, fin) {
    try {
      const res = await gcal.events.list({
        calendarId,
        timeMin:       ini.toISOString(),
        timeMax:       fin.toISOString(),
        singleEvents:  true,
        orderBy:       'startTime',
        maxResults:    500,
        showDeleted:   false,
      });
      const items = res.data.items || [];
      log(`[GCal] obtenerEventos: ${items.length} evento(s) en rango`);
      return items;
    } catch (e) {
      log(`[GCal] obtenerEventos error: ${_formatErr(e)}`);
      return [];
    }
  }

  /**
   * Detecta si hay conflicto en Google Calendar para el rango [ini, fin).
   * Filtra eventos cancelados.
   * @returns {{ conflicto: boolean, evento?: object }}
   */
  async function detectarConflicto(ini, fin) {
    const eventos = await obtenerEventos(ini, fin);
    const activos = eventos.filter(e => e.status !== 'cancelled');
    if (activos.length > 0) {
      log(`[GCal] ⚠️ Conflicto detectado: "${activos[0].summary}" ya ocupa ese horario`);
      return { conflicto: true, evento: activos[0] };
    }
    return { conflicto: false };
  }

  /**
   * Verifica que un evento con el ID dado existe y no está cancelado.
   * @param {string} eventId
   * @returns {{ ok: boolean, event?: object, error?: string }}
   */
  async function verificarEvento(eventId) {
    try {
      const res = await gcal.events.get({ calendarId, eventId });
      if (res.data.status === 'cancelled') {
        log(`[GCal] ⚠️ verificarEvento: evento ${eventId} está cancelado`);
        return { ok: false, error: 'event_cancelled' };
      }
      log(`[GCal] ✅ verificarEvento OK: ${eventId} | "${res.data.summary}"`);
      return { ok: true, event: res.data };
    } catch (e) {
      const err = _formatErr(e);
      log(`[GCal] verificarEvento error: ${err}`);
      return { ok: false, error: err };
    }
  }

  /**
   * Crea un evento en Google Calendar con verificación post-creación.
   *
   * Flujo:
   *   1. Detectar conflicto previo (si hay → retornar conflicto)
   *   2. Insertar evento (con reintentos)
   *   3. Verificar via GET que el evento existe
   *   4. Si el clienteEmail tiene '@gmail.com' o dominio Gmail, agregarlo como attendee
   *      (recibe invitación de Calendar en su cuenta de Google)
   *
   * @param {object} opts
   * @param {string}  opts.summary        – Título (ej: "Turno — Juan")
   * @param {string}  [opts.description]  – Descripción
   * @param {Date}    opts.ini
   * @param {Date}    opts.fin
   * @param {string}  [opts.clienteEmail] – Email del cliente (opcional; recibe invite)
   * @param {boolean} [opts.verificarConflicto=true]
   * @returns {{ ok: boolean, eventId?: string, link?: string, conflicto?: boolean, error?: string }}
   */
  async function crearEvento({ summary, description, ini, fin, clienteEmail, verificarConflictoFlag = true }) {

    // ── 1. Verificar conflicto en Google Calendar ──
    if (verificarConflictoFlag) {
      const { conflicto, evento } = await detectarConflicto(ini, fin);
      if (conflicto) {
        return {
          ok: false,
          conflicto: true,
          error: `Conflicto en Google Calendar: "${evento.summary}"`,
        };
      }
    }

    // ── 2. Construir recurso del evento ──
    const attendees = [];
    const emailLower = (clienteEmail || '').toLowerCase().trim();
    // Agregar como attendee si tiene email válido (recibe invitación en su Google Calendar)
    if (emailLower && emailLower.includes('@')) {
      attendees.push({ email: emailLower });
    }

    const resource = {
      summary,
      description: description || '',
      start: { dateTime: ini.toISOString(), timeZone: TZ_ARG },
      end:   { dateTime: fin.toISOString(), timeZone: TZ_ARG },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email',  minutes: 24 * 60 }, // 24h antes
          { method: 'popup',  minutes: 60 },       // 1h antes
        ],
      },
      // No mostrar a los guests otros guests
      guestsCanSeeOtherGuests: false,
      guestsCanModify: false,
    };

    if (attendees.length > 0) {
      resource.attendees   = attendees;
      resource.sendUpdates = 'all'; // Manda email de invitación al cliente
    }

    log(`[GCal] Creando evento: "${summary}" | ${ini.toISOString()} → ${fin.toISOString()}${attendees.length ? ` | invitado: ${emailLower}` : ''}`);

    // ── 3. Insertar con reintentos ──
    let insertRes;
    try {
      insertRes = await _withRetry(
        () => gcal.events.insert({ calendarId, resource, sendUpdates: resource.sendUpdates || 'none' }),
        'events.insert'
      );
    } catch (e) {
      const err = _formatErr(e);
      log(`[GCal] ❌ crearEvento insert falló: ${err}`);
      return { ok: false, error: err };
    }

    const eventId = insertRes?.data?.id;
    if (!eventId) {
      log('[GCal] ❌ crearEvento: respuesta sin ID');
      return { ok: false, error: 'no_event_id' };
    }

    // ── 4. Verificar que el evento realmente existe (GET) ──
    log(`[GCal] Verificando evento post-creación: ${eventId}`);
    // Pequeño delay para que Google propague el evento
    await sleep(800);
    const verificacion = await verificarEvento(eventId);
    if (!verificacion.ok) {
      log(`[GCal] ⚠️ Evento creado (${eventId}) pero verificación falló: ${verificacion.error}`);
      // El evento pudo haberse creado igual; retornamos ok:false pero con el eventId
      return { ok: false, eventId, error: `post_verify_failed: ${verificacion.error}` };
    }

    log(`[GCal] ✅ Evento creado y verificado: ${eventId}`);
    return {
      ok:      true,
      eventId,
      link:    insertRes.data.htmlLink || null,
      summary: insertRes.data.summary,
    };
  }

  /**
   * Elimina un evento de Google Calendar (soft: lo mueve a la papelera).
   * @param {string} eventId
   * @returns {{ ok: boolean, error?: string }}
   */
  async function eliminarEvento(eventId) {
    if (!eventId) return { ok: false, error: 'no_event_id' };
    try {
      await _withRetry(
        () => gcal.events.delete({ calendarId, eventId, sendUpdates: 'all' }),
        'events.delete'
      );
      log(`[GCal] ✅ Evento eliminado: ${eventId}`);
      return { ok: true };
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404 || status === 410) {
        // Ya no existe — considerar exitoso
        log(`[GCal] eliminarEvento: ${eventId} ya no existe (${status}) — OK`);
        return { ok: true };
      }
      const err = _formatErr(e);
      log(`[GCal] ❌ eliminarEvento ${eventId}: ${err}`);
      return { ok: false, error: err };
    }
  }

  /**
   * Agrega el email del cliente como attendee a un evento ya creado.
   * Útil cuando se captura el email DESPUÉS de crear el evento.
   * @param {string} eventId
   * @param {string} email
   * @returns {{ ok: boolean, error?: string }}
   */
  async function agregarAttendee(eventId, email) {
    if (!eventId || !email) return { ok: false, error: 'params_missing' };
    const emailLower = email.toLowerCase().trim();
    try {
      // Obtener evento actual
      const getRes = await gcal.events.get({ calendarId, eventId });
      const existing = getRes.data.attendees || [];
      if (existing.find(a => a.email === emailLower)) {
        log(`[GCal] agregarAttendee: ${emailLower} ya es attendee de ${eventId}`);
        return { ok: true };
      }
      existing.push({ email: emailLower });
      await _withRetry(
        () => gcal.events.patch({
          calendarId,
          eventId,
          resource:    { attendees: existing },
          sendUpdates: 'all',
        }),
        'events.patch(attendee)'
      );
      log(`[GCal] ✅ Attendee agregado: ${emailLower} → evento ${eventId}`);
      return { ok: true };
    } catch (e) {
      const err = _formatErr(e);
      log(`[GCal] ❌ agregarAttendee ${eventId}: ${err}`);
      return { ok: false, error: err };
    }
  }

  return {
    verificarConexion,
    obtenerEventos,
    detectarConflicto,
    verificarEvento,
    crearEvento,
    eliminarEvento,
    agregarAttendee,
    calendarId,
  };
}

module.exports = { crearGoogleCalendarService };
