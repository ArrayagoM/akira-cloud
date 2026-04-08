// services/akira.bot.js — Akira Bot v4.0 — Baileys edition
// Sin Chrome/Puppeteer. Usa WebSocket directo (~30MB RAM vs ~400MB antes).
'use strict';

const { EventEmitter } = require('events');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  isJidGroup,
  isJidStatusBroadcast,
} = require('@whiskeysockets/baileys');
const { useMongoAuthState } = require('./bot/mongo-auth.service');
const pino    = require('pino');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const express = require('express');

const crearPersistencia         = require('./bot/persistence.service');
const crearMongoClientesService = require('./bot/mongo-clientes.service');
const crearCalendarService      = require('./bot/calendar.service');
const crearMPService            = require('./bot/mercadopago.service');
const Config                    = require('../models/Config');
const WaitlistEntry             = require('../models/WaitlistEntry');
const crearAudioService         = require('./bot/audio.service');
const crearGroqService          = require('./bot/groq.service');
const crearWaitlistService      = require('./bot/waitlist.service');

function crearAkiraBot(config, dataDir, sessionDir, userId) {
  const emitter = new EventEmitter();

  // ── Config ─────────────────────────────────────────────────
  const GROQ_API_KEY              = config.GROQ_API_KEY || '';
  const MODELO                    = 'llama-3.3-70b-versatile';
  const MI_NOMBRE                 = config.MI_NOMBRE || 'Asistente';
  const SERVICIOS                 = config.SERVICIOS || 'turnos y reservas';
  const NEGOCIO                   = config.NEGOCIO || `el negocio de ${MI_NOMBRE}`;
  const MP_ACCESS_TOKEN           = config.MP_ACCESS_TOKEN || '';
  const PRECIO_TURNO              = parseFloat(config.PRECIO_TURNO || '1000');
  const NGROK_DOMAIN              = config.NGROK_DOMAIN || '';
  const NGROK_AUTH_TOKEN          = config.NGROK_AUTH_TOKEN || '';
  const RIME_API_KEY              = config.RIME_API_KEY || '';
  const HORAS_MINIMAS_CANCELACION = parseInt(config.HORAS_MINIMAS_CANCELACION || '24');
  const CALENDAR_ID               = config.CALENDAR_ID || 'primary';
  let   PROMPT_EXTRA              = config.PROMPT_PERSONALIZADO || '';
  const ALIAS_TRANSFERENCIA       = config.ALIAS_TRANSFERENCIA || '';
  const CBU_TRANSFERENCIA         = config.CBU_TRANSFERENCIA   || '';
  const BANCO_TRANSFERENCIA       = config.BANCO_TRANSFERENCIA || '';
  let   SERVICIOS_LIST            = (() => { try { return JSON.parse(config.SERVICIOS_LIST || '[]'); } catch { return []; } })();
  const DURACION_RESERVA_HORAS    = 1;
  const HORA_INICIO_DIA           = 9;
  const HORA_FIN_DIA              = 18;
  const ZONA_HORARIA              = 'America/Argentina/Buenos_Aires';
  let   HORARIOS_ATENCION         = (() => { try { return JSON.parse(config.HORARIOS_ATENCION || '{}'); } catch { return {}; } })();
  let   DIAS_BLOQUEADOS           = (() => { try { return JSON.parse(config.DIAS_BLOQUEADOS || '[]'); } catch { return []; } })();
  let   MODO_PAUSA                = config.MODO_PAUSA === 'true';
  let   CELULAR_NOTIFICACIONES    = config.CELULAR_NOTIFICACIONES || '';
  let   CHATS_IGNORADOS           = (() => { try { return JSON.parse(config.CHATS_IGNORADOS || '[]'); } catch { return []; } })();
  const GOOGLE_CALENDAR_TOKENS    = (() => { try { return JSON.parse(config.GOOGLE_CALENDAR_TOKENS || ''); } catch { return null; } })();
  const TIPO_NEGOCIO              = config.TIPO_NEGOCIO    || 'turnos';
  const CHECK_IN_HORA             = config.CHECK_IN_HORA   || '14:00';
  const CHECK_OUT_HORA            = config.CHECK_OUT_HORA  || '10:00';
  const MINIMA_ESTADIA            = parseInt(config.MINIMA_ESTADIA || '1');
  const UNIDADES_ALOJAMIENTO      = (() => { try { return JSON.parse(config.UNIDADES_ALOJAMIENTO || '[]'); } catch { return []; } })();
  const DIRECCION_PROPIEDAD       = config.DIRECCION_PROPIEDAD || '';
  const LINK_UBICACION            = config.LINK_UBICACION  || '';
  const CATALOGO                  = (() => { try { return JSON.parse(config.CATALOGO || '[]'); } catch { return []; } })();
  const PUERTO                    = parseInt(config.PORT || '3100');

  function getDuracionServicio(nombreServicio) {
    if (!SERVICIOS_LIST.length || !nombreServicio) return DURACION_RESERVA_HORAS * 60;
    const s = SERVICIOS_LIST.find(s => s.nombre.toLowerCase().includes(nombreServicio.toLowerCase()));
    return s ? s.duracion : DURACION_RESERVA_HORAS * 60;
  }

  const CACHE_PATH         = path.join(dataDir, '_cache.json');
  const RESERVAS_PATH      = path.join(dataDir, '_reservas.json');
  const RECORDATORIOS_PATH = path.join(dataDir, '_recordatorios.json');
  const CREDENTIALS_PATH   = path.join(dataDir, 'credentials.json');
  const RESENAS_PATH       = path.join(dataDir, '_resenas.json');
  const WAITLIST_OFRS_PATH = path.join(dataDir, '_waitlist_ofrs.json');

  function log(msg) { emitter.emit('log', msg); }

  // ── Servicios ───────────────────────────────────────────────
  // userId del dueño del bot — preferir el parámetro explícito; fallback al path
  const USER_ID  = userId ? String(userId) : path.basename(sessionDir);
  const db       = crearPersistencia(dataDir, log);
  // Memoria de clientes en MongoDB (reemplaza db.cargarMemoria/guardarMemoria)
  const clientesSvc = crearMongoClientesService(USER_ID, log);

  // Helper: crea/recrea el calendar service con la config actual
  // (se llama al iniciar y cada vez que el usuario guarda cambios en el dashboard)
  function _crearCalendar() {
    return crearCalendarService({
      userId: USER_ID,
      calendarId: CALENDAR_ID || 'principal',
      horaInicio: HORA_INICIO_DIA, horaFin: HORA_FIN_DIA,
      duracion: DURACION_RESERVA_HORAS, zonaHoraria: ZONA_HORARIA,
      horarios: HORARIOS_ATENCION, diasBloqueados: DIAS_BLOQUEADOS, log,
    });
  }
  let calendar = _crearCalendar();
  const mp      = crearMPService({ accessToken: MP_ACCESS_TOKEN, precioTurno: PRECIO_TURNO, duracion: DURACION_RESERVA_HORAS, negocio: NEGOCIO, ngrokDomain: NGROK_DOMAIN, log });
  const groqSvc     = crearGroqService({ apiKey: GROQ_API_KEY, modelo: MODELO, log, tipoNegocio: TIPO_NEGOCIO, catalogo: CATALOGO });
  const waitlistSvc = crearWaitlistService({ userId: USER_ID, calendarId: CALENDAR_ID, log });

  // ── Estado ──────────────────────────────────────────────────
  const cacheTemporal        = db.cargar(CACHE_PATH);
  const reservasPendientes   = db.cargar(RESERVAS_PATH);
  const recordatoriosActivos = db.cargar(RECORDATORIOS_PATH);
  const resenasPendientes    = db.cargar(RESENAS_PATH);
  const waitlistOfertas      = db.cargar(WAITLIST_OFRS_PATH);
  const timeoutsResenas      = {};
  const timeoutsWaitlist     = {};
  const slotsEnProceso       = new Set();
  const timeoutsRecs         = {};
  let   sock                 = null;
  let   expressServer        = null;
  let   reconectando         = false;
  let   audioSvc             = null;
  let   watchdogTimer        = null;
  let   ultimoMensajeTs      = Date.now();
  let   catalogFallos        = 0;
  let   esNegocioWA          = null; // null=desconocido, false=no es Business, true=es Business
  let   reconectarIntentos   = 0;  // contador de reconexiones sin éxito
  let   tsUltimaConexion     = 0;  // timestamp del último 'open' exitoso

  // ── Helpers ─────────────────────────────────────────────────
  function quitarEmojis(t) { return t.replace(/\p{Emoji}/gu, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim(); }
  function esNombreValido(t) {
    const l = quitarEmojis(t);
    return l.length >= 2 && !/^\d+$/.test(l) && !['hola','si','no','ok','bien','dale','buenas','hey','test'].includes(l.toLowerCase()) && /\p{L}/u.test(l);
  }
  function esEmailValido(t)   { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim()); }
  function capitalizar(t)     { return t.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' '); }
  function extraerNumero(jid) { return (jid || '').split('@')[0].replace(/[^0-9]/g, ''); }

  // Extrae el texto de un mensaje Baileys
  function getTexto(msg) {
    const m = msg.message;
    if (!m) return '';
    return m.conversation
      || m.extendedTextMessage?.text
      || m.imageMessage?.caption
      || m.videoMessage?.caption
      || '';
  }

  function limpiarRespuesta(texto) {
    if (!texto) return 'Disculpá, hubo un problema. ¿Me repetís la consulta?';
    texto = texto
      // Bloques <function=...>...</function> bien formados
      .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
      // Variantes malformadas que Llama genera sin > de cierre en el tag de apertura:
      // <function=nombre</function>  o  <function=nombre=</function>
      .replace(/<function=[^<]*<\/function>/g, '')
      // Cualquier <function...> abierto que haya quedado (con o sin >)
      .replace(/<function[^>]*>/g, '')
      // Tags </function> sueltos que hayan sobrevivido
      .replace(/<\/function>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\{[\s\S]*?"fecha"[\s\S]*?\}/g, '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$2')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/https?:\/\/(?!www\.mercadopago\.com\.ar|checkout\.mercadopago\.com\.ar|calendar\.google\.com)[^\s)>\],"]+/gi, '')
      .replace(/[ \t]+\n/g, '\n').trim();
    // Prompt injection: si el LLM filtra datos sensibles del sistema, reemplazar con respuesta genérica
    const PATRONES_SENSIBLES = [
      /ENCRYPTION_KEY/i,
      /JWT_SECRET/i,
      /MONGO_URI/i,
      /ACCESS_TOKEN/i,
      /CLIENT_SECRET/i,
      /APP_SECRET/i,
      /WORKER_SECRET/i,
      /process\.env/i,
      /\bpassword\s*[:=]/i,
    ];
    if (PATRONES_SENSIBLES.some(p => p.test(texto))) {
      log(`[Security] ⚠️ Prompt injection detectado — respuesta bloqueada`);
      return 'Lo siento, no puedo responder eso. ¿En qué más puedo ayudarte?';
    }
    return texto;
  }

  function recortarHistorial(h, max = 20) {
    if (h.length <= max) return h;
    let r = [...h];
    while (r.length > max) {
      const fi = r.findIndex(m => m.role === 'user');
      if (fi === -1) break;
      let fin = fi + 1;
      while (fin < r.length && r[fin].role !== 'user') fin++;
      r.splice(0, fin);
    }
    while (r.length > 0 && r[0].role === 'tool') r.shift();
    return r;
  }

  // ── Envío de mensajes ────────────────────────────────────────
  async function enviarMensaje(jid, texto) {
    if (!sock) return false;
    try {
      await sock.sendMessage(jid, { text: String(texto) });
      log(`✅ Enviado a ${jid}: "${String(texto).slice(0, 50)}..."`);
      return true;
    } catch (e) {
      log(`⚠️ Error enviando a ${jid}: ${e.message}`);
      return false;
    }
  }

  async function enviarAudio(jid, buffer) {
    if (!sock) return false;
    try {
      await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
      return true;
    } catch (e) {
      log(`⚠️ Error enviando audio a ${jid}: ${e.message}`);
      return false;
    }
  }

  // ── Notificación al dueño ────────────────────────────────────
  function notificarDueno(texto) {
    if (!CELULAR_NOTIFICACIONES) return;
    const cel = CELULAR_NOTIFICACIONES.replace(/\D/g, '');
    if (cel.length < 10) return;
    const jidDueno = `${cel}@s.whatsapp.net`;
    enviarMensaje(jidDueno, texto).catch(() => {});
  }

  // ── Recordatorios ────────────────────────────────────────────
  const RECS = [
    { min: 24 * 60, label: '24h',   msg: (n, h) => `¡Hola ${n}! 👋 Mañana a las *${h}* tu turno con *${NEGOCIO}*.\n¿Confirmás que vas? Respondé *SÍ* para confirmar o *CANCELAR* si no podés. ⏳ Tenés 2 horas.` },
    { min: 4  * 60, label: '4h',    msg: (n, h) => `¡Hola ${n}! ⏰ En unas horas tu turno a las *${h}*. Avisanos si no podés. 🙏` },
    { min: 30,      label: '30min', msg: (n, h) => `¡${n}! 🚗 En 30 minutos tu turno a las *${h}*. ¡Nos vemos!` },
  ];

  function programarRecs(jid, nombre, fecha, hora) {
    const [y, m, d] = fecha.split('-').map(Number);
    const [h, min]  = hora.split(':').map(Number);
    const ft        = calendar.crearFecha(y, m, d, h, min);
    const ahora     = Date.now();
    const key       = `${jid}|${fecha}|${hora}`;
    recordatoriosActivos[key] = { chatId: jid, nombre, fecha, hora };
    db.guardar(RECORDATORIOS_PATH, recordatoriosActivos);
    for (const r of RECS) {
      const delay = ft.getTime() - r.min * 60000 - ahora;
      if (delay <= 0) continue;
      const tk = `${key}|${r.label}`;
      if (timeoutsRecs[tk]) clearTimeout(timeoutsRecs[tk]);
      timeoutsRecs[tk] = setTimeout(async () => {
        delete timeoutsRecs[tk];
        try {
          await enviarMensaje(jid, r.msg(nombre, hora));
          log(`[REC] ✅ ${r.label} → ${nombre}`);
          // Si es el recordatorio de 24h, programar verificación de confirmación
          if (r.label === '24h') {
            programarVerificacionConfirmacion(jid, nombre, fecha, hora);
          }
        }
        catch (e) { log(`[REC] ❌ ${e.message}`); }
      }, delay);
    }
  }

  function reprogramarRecs() {
    let c = 0;
    for (const [, r] of Object.entries(recordatoriosActivos)) {
      const [y, m, d] = r.fecha.split('-').map(Number);
      const [h, min]  = r.hora.split(':').map(Number);
      if (calendar.crearFecha(y, m, d, h, min).getTime() < Date.now()) continue;
      programarRecs(r.chatId, r.nombre, r.fecha, r.hora); c++;
    }
    if (c > 0) log(`[REC] ${c} recordatorios reprogramados`);
    // Reprogramar reseñas pendientes
    for (const [, r] of Object.entries(resenasPendientes)) {
      if (r.jid && r.turnoId && r.fecha) {
        programarResena(r.jid, r.turnoId, r.nombre, r.fecha, r.horaFin || '18:00');
      }
    }
  }

  // Verifica si confirmó 2h después del recordatorio de 24h
  function programarVerificacionConfirmacion(jid, nombre, fecha, hora) {
    const key  = `${jid}|${fecha}|${hora}|conf`;
    const delay = 2 * 60 * 60 * 1000; // 2 horas
    waitlistOfertas[key] = { tipo: 'confirmacion', jid, nombre, fecha, hora, expiraEn: Date.now() + delay };
    db.guardar(WAITLIST_OFRS_PATH, waitlistOfertas);
    if (timeoutsWaitlist[key]) clearTimeout(timeoutsWaitlist[key]);
    timeoutsWaitlist[key] = setTimeout(async () => {
      delete timeoutsWaitlist[key];
      delete waitlistOfertas[key];
      db.guardar(WAITLIST_OFRS_PATH, waitlistOfertas);
      // Si el cliente aún no confirmó, marcar posible no-show
      const c = cacheTemporal[jid] || {};
      if (!c.turnoConfirmado?.[`${fecha}|${hora}`]) {
        log(`[AntiNoShow] ⚠️ ${nombre} no confirmó turno ${fecha} ${hora}`);
        notificarDueno(`⚠️ *Sin confirmación*: ${nombre} no confirmó su turno del ${fecha} a las ${hora}. Verificá si va a ir.`);
        // Ofrecer al waitlist
        await waitlistSvc.notificarSiguiente(fecha, hora, enviarMensaje, notificarDueno);
      }
    }, delay);
  }

  async function programarResena(jid, turnoId, nombre, fecha, horaFin) {
    try {
      const cfg = await Config.findOne({ userId: USER_ID }).lean();
      if (!cfg?.googleReviewLink || cfg.activarResenas === false) return;
      const [y, m, d] = fecha.split('-').map(Number);
      const h = parseInt((horaFin || '18:00').split(':')[0]);
      const ftFin = calendar.crearFecha(y, m, d, h);
      const delay = ftFin.getTime() + 2 * 3600000 - Date.now(); // fin del turno + 2h
      if (delay <= 0) return;
      const key = `resena|${jid}|${turnoId}`;
      resenasPendientes[key] = { jid, turnoId, nombre, fecha, horaFin, ts: Date.now() };
      db.guardar(RESENAS_PATH, resenasPendientes);
      if (timeoutsResenas[key]) clearTimeout(timeoutsResenas[key]);
      timeoutsResenas[key] = setTimeout(async () => {
        delete timeoutsResenas[key];
        delete resenasPendientes[key];
        db.guardar(RESENAS_PATH, resenasPendientes);
        try {
          const cfgFresh = await Config.findOne({ userId: USER_ID }).lean();
          if (!cfgFresh?.googleReviewLink || cfgFresh.activarResenas === false) return;
          await enviarMensaje(jid,
            `¡Hola ${nombre}! 😊 Esperamos que hayas disfrutado tu visita a *${NEGOCIO}*.\n` +
            `Si quedaste contento/a, nos ayudaría muchísimo si dejás una reseñita ⭐\n` +
            cfgFresh.googleReviewLink
          );
          log(`[Reseña] ✅ Solicitud enviada a ${nombre}`);
        } catch (e) { log(`[Reseña] ❌ ${e.message}`); }
      }, delay);
    } catch (e) { log(`[Reseña] ❌ programarResena: ${e.message}`); }
  }

  // ── Reservas ─────────────────────────────────────────────────
  function pendienteActual(jid) {
    const ahora = Date.now();
    for (const [, r] of Object.entries(reservasPendientes)) if (r.chatId === jid && r.expiresAt > ahora) return r;
    return null;
  }
  function limpiarExpiradas() {
    let cambio = false;
    for (const k of Object.keys(reservasPendientes)) if (reservasPendientes[k].expiresAt <= Date.now()) { delete reservasPendientes[k]; cambio = true; }
    if (cambio) db.guardar(RESERVAS_PATH, reservasPendientes);
  }
  setInterval(limpiarExpiradas, 5 * 60000);

  // ── Procesamiento IA ─────────────────────────────────────────
  async function procesarConIA(jid, usuario) {
    limpiarExpiradas();
    const pend  = pendienteActual(jid);
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
    const fStr  = ahora.toLocaleString('es-AR', { timeZone: ZONA_HORARIA, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fISO  = ahora.toISOString().slice(0, 10);
    const dias  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const prox  = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ahora); d.setDate(ahora.getDate() + i + 1);
      const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
      return `${dias[d.getDay()]} = ${y}-${mo}-${dd}`;
    }).join(', ');

    // Informar método de pago configurado (NUNCA inventar datos)
    const metodoPago = MP_ACCESS_TOKEN
      ? 'MercadoPago (link automático al confirmar turno)'
      : (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA)
        ? `Transferencia bancaria — Alias: ${ALIAS_TRANSFERENCIA || 'N/A'} | CBU/CVU: ${CBU_TRANSFERENCIA || 'N/A'}`
        : `Sin método de pago configurado — ${MI_NOMBRE} coordina el pago directamente`;

    // ── Armar descripción de horarios configurados ───────────────
    const DIAS_LABELS = { lunes:'Lun', martes:'Mar', miercoles:'Mié', jueves:'Jue', viernes:'Vie', sabado:'Sáb', domingo:'Dom' };
    const DIAS_ORDER  = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
    const horariosStr = Object.keys(HORARIOS_ATENCION).length > 0
      ? DIAS_ORDER.map(d => {
          const h = HORARIOS_ATENCION[d];
          if (!h) return null;
          if (!h.activo) return `${DIAS_LABELS[d]} Cerrado`;
          // Soporte para múltiples franjas (ej. 9-13 y 17-21:30)
          if (Array.isArray(h.franjas) && h.franjas.length > 0) {
            return `${DIAS_LABELS[d]} ${h.franjas.map(f => `${f.inicio}–${f.fin}`).join(' y ')}`;
          }
          return `${DIAS_LABELS[d]} ${h.inicio}–${h.fin}`;
        }).filter(Boolean).join(' | ')
      : `Lun–Vie 09:00–18:00 | Sáb 09:00–13:00 | Dom Cerrado`;

    const esAlojamiento = TIPO_NEGOCIO === 'alojamiento';
    const esServicios   = TIPO_NEGOCIO === 'servicios';

    // Armar listado del catálogo de productos (si existe)
    const catalogoStr = CATALOGO.filter(p => p.disponible).map(p =>
      `• *${p.nombre}*: $${p.precio} ${p.moneda || 'ARS'}${p.categoria ? ` [${p.categoria}]` : ''}${p.descripcion ? ` — ${p.descripcion}` : ''}${p.stock >= 0 ? ` (stock: ${p.stock})` : ''}`
    ).join('\n');

    // Armar descripción de unidades de alojamiento
    const unidadesStr = UNIDADES_ALOJAMIENTO.length > 0
      ? UNIDADES_ALOJAMIENTO.map(u =>
          `• *${u.nombre}*: cap. ${u.capacidad} pers. — $${u.precioPorNoche} ARS/noche` +
          (u.amenidades ? ` — ${u.amenidades}` : '') +
          (u.descripcion ? ` — ${u.descripcion}` : '')
        ).join('\n')
      : null;

    const sysContent = esServicios
      ? `Sos Akira, asistente de ${MI_NOMBRE} (${NEGOCIO}). Hablás con ${usuario.nombre}. Tono cálido, humano, WhatsApp.\n` +
        `Hoy: ${fStr} | ISO: ${fISO}\nPróx días: ${prox}\n` +
        `🕐 Horarios de atención: ${horariosStr}\n` +
        (DIAS_BLOQUEADOS.length > 0 ? `🚫 Días sin atención: ${DIAS_BLOQUEADOS.join(', ')}\n` : '') +
        (MODO_PAUSA ? `🔴 MODO PAUSA ACTIVO: No tomamos trabajos por el momento. Informá amablemente. NO llamés herramientas de agenda.\n` : '') +
        (SERVICIOS_LIST.length > 0
          ? `🔧 SERVICIOS DISPONIBLES:\n${SERVICIOS_LIST.map(s => `• ${s.nombre}: $${s.precio} ARS (duración aprox. ${s.duracion || 60} min)`).join('\n')}\n`
          : `🔧 Servicios: ${SERVICIOS} | Precio base: $${PRECIO_TURNO} ARS\n`) +
        `💳 Método de pago: ${metodoPago}.\n` +
        (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA
          ? `Transferencia: Alias=${ALIAS_TRANSFERENCIA}${CBU_TRANSFERENCIA ? ` / CBU=${CBU_TRANSFERENCIA}` : ''}${BANCO_TRANSFERENCIA ? ` / ${BANCO_TRANSFERENCIA}` : ''}.\n`
          : '') +
        `⚠️ PROHIBIDO: NUNCA inventes datos bancarios. Usá SOLO los de arriba.\n` +
        (pend ? `🚨 PAGO PENDIENTE: ${pend.fecha} ${pend.hora} ($${pend.totalPrecio || PRECIO_TURNO}). NO agendar otro.\n` : '') +
        (usuario.turnosConfirmados?.length ? `[INT] Servicios agendados: ${usuario.turnosConfirmados.map(t => `${t.servicio || 'Servicio'} — ${t.infoItem || ''} — ${t.fecha} ${t.hora}`).join(' | ')}\n` : '') +
        `FLUJO OBLIGATORIO: 1.Preguntar qué servicio quiere → 2.Pedir datos del ítem (patente+modelo, nombre mascota, etc.) → 3.Consultar disponibilidad → 4.Cliente elige horario → 5.Confirmar → 6.Llamar agendar_servicio. NUNCA saltear pasos.\n` +
        `Cancelar→cancelar_servicio, Cambiar→reagendar_servicio. Máx 4 líneas. Sin JSON ni código.\n` +
        (catalogoStr ? `📦 PRODUCTOS:\n${catalogoStr}\nUsá consultar_catalogo si preguntan.\n` : '') +
        (PROMPT_EXTRA ? `INSTRUCCIONES EXTRA: ${PROMPT_EXTRA}\n` : '')
      : esAlojamiento
      ? `Sos Akira, asistente de ${MI_NOMBRE} (${NEGOCIO}). Hablás con ${usuario.nombre}. Tono cálido, humano, WhatsApp.\n` +
        `Hoy: ${fStr} | ISO: ${fISO}\nPróx días: ${prox}\n` +
        (DIAS_BLOQUEADOS.length > 0 ? `🚫 Fechas sin disponibilidad: ${DIAS_BLOQUEADOS.join(', ')}\n` : '') +
        (MODO_PAUSA ? `🔴 MODO PAUSA ACTIVO: No tomamos nuevas reservas ahora. Informá amablemente y ofrecé contactar a ${MI_NOMBRE}. NO llamés herramientas de reserva.\n` : '') +
        `🏠 TIPO: ALOJAMIENTO — Check-in: ${CHECK_IN_HORA} hs | Check-out: ${CHECK_OUT_HORA} hs | Estadía mínima: ${MINIMA_ESTADIA} noche(s)\n` +
        (unidadesStr
          ? `🛏️ UNIDADES DISPONIBLES:\n${unidadesStr}\nCada unidad es INDEPENDIENTE: podés consultar disponibilidad por unidad pasando nombre_unidad.\n`
          : '') +
        (DIRECCION_PROPIEDAD ? `📍 Dirección: ${DIRECCION_PROPIEDAD}\n` : '') +
        (LINK_UBICACION ? `🗺️ Ubicación Google Maps: ${LINK_UBICACION}\n` : '') +
        `💳 Método de pago: ${metodoPago}\n` +
        (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA
          ? `Transferencia: Alias=${ALIAS_TRANSFERENCIA}${CBU_TRANSFERENCIA ? ` / CBU=${CBU_TRANSFERENCIA}` : ''}${BANCO_TRANSFERENCIA ? ` / ${BANCO_TRANSFERENCIA}` : ''}\n`
          : '') +
        `⚠️ PROHIBIDO: Nunca inventes datos bancarios. Usá SOLO los de arriba.\n` +
        (pend ? `🚨 RESERVA PENDIENTE DE PAGO: entrada ${pend.fecha} ($${pend.totalPrecio}). NO agendar otra.\n` : '') +
        (usuario.turnosConfirmados?.length ? `[INT] Reservas confirmadas: ${usuario.turnosConfirmados.map(t => `${t.unidad ? t.unidad + ' ' : ''}${t.fecha}→${t.horaFin || ''}`).join(', ')}\n` : '') +
        `FLUJO: 1.Cliente dice fechas [y nº huéspedes si hay varias unidades] → 2.Llamar consultar_disponibilidad_alojamiento (con nombre_unidad si aplica) → 3.Informar precio total y dirección → 4.Cliente confirma → 5.Llamar agendar_alojamiento. NUNCA saltear pasos.\n` +
        `Max 4 líneas. Sin JSON/código. Cancelar→cancelar_alojamiento, Cambiar fechas→reagendar_alojamiento.\n` +
        (catalogoStr ? `📦 CATÁLOGO DE PRODUCTOS:\n${catalogoStr}\nUsá consultar_catalogo si preguntan por productos.\n` : '') +
        (PROMPT_EXTRA ? `INSTRUCCIONES EXTRA: ${PROMPT_EXTRA}\n` : '')
      : `Sos Akira, asistente de ${MI_NOMBRE} (${NEGOCIO}). Hablás con ${usuario.nombre}. Tono cálido, humano, WhatsApp. ` +
        `Hoy: ${fStr} | ISO: ${fISO}\nPróx días: ${prox}\n` +
        `🕐 Horarios de atención: ${horariosStr}\n` +
        (DIAS_BLOQUEADOS.length > 0 ? `🚫 Días sin atención: ${DIAS_BLOQUEADOS.join(', ')}\n` : '') +
        (MODO_PAUSA ? `🔴 MODO PAUSA ACTIVO: No hay disponibilidad por el momento. Informá amablemente que no estamos tomando nuevas reservas y ofrecé contactar directamente a ${MI_NOMBRE}. NO llames a consultar_disponibilidad ni agendar_turno.\n` : '') +
        (SERVICIOS_LIST.length > 0
          ? `Servicios disponibles:\n${SERVICIOS_LIST.map(s => `- ${s.nombre}: $${s.precio} ARS (${s.duracion || 60} min)`).join('\n')}\n`
          : `Negocio: ${SERVICIOS} | Precio: $${PRECIO_TURNO} ARS/h\n`) +
        (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA
          ? `Transferencia bancaria: Alias=${ALIAS_TRANSFERENCIA}${CBU_TRANSFERENCIA ? ` / CBU=${CBU_TRANSFERENCIA}` : ''}${BANCO_TRANSFERENCIA ? ` / ${BANCO_TRANSFERENCIA}` : ''}. Ofrecer como alternativa a MercadoPago cuando el cliente lo pida.\n`
          : '') +
        `Cancelar/reagendar: mín ${HORAS_MINIMAS_CANCELACION}h.\n` +
        `💳 Método de pago: ${metodoPago}.\n` +
        `⚠️ PROHIBIDO: NUNCA inventes alias, CBU, CVU, nombres de banco ni ningún dato bancario. Usá SOLO los que aparecen arriba.\n` +
        (pend ? `🚨 PAGO PENDIENTE: ${pend.fecha} ${pend.hora} ($${pend.totalPrecio || PRECIO_TURNO}). NO agendar otro.\n` : '') +
        (usuario.turnosConfirmados?.length ? `[INT] Turnos confirmados: ${usuario.turnosConfirmados.map(t => `${t.fecha} ${t.hora}`).join(', ')} — nunca preguntar si pagó.\n` : '') +
        `FLUJO: 1.Consultar disponibilidad → 2.Cliente elige → 3.Confirmar → 4.Llamar agendar_turno. NUNCA saltear pasos.\n` +
        `Max 4 líneas. Sin JSON/código. Cancelar→cancelar_turno, Cambiar→reagendar_turno.\n` +
        (catalogoStr ? `📦 CATÁLOGO DE PRODUCTOS:\n${catalogoStr}\nUsá consultar_catalogo si el cliente pregunta por un producto.\n` : '') +
        (PROMPT_EXTRA ? `INSTRUCCIONES EXTRA: ${PROMPT_EXTRA}\n` : '');

    const sys = { role: 'system', content: sysContent };

    let resp = await groqSvc.llamarGroq([sys, ...usuario.historial]);
    let msg  = resp.choices[0].message;

    if (msg.tool_calls?.length > 0) {
      usuario.historial.push({ role: msg.role, content: msg.content, tool_calls: msg.tool_calls });
      for (const t of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(t.function.arguments); }
        catch (e) { log(`⚠️ Tool ${t.function.name}: arguments inválido — ${e.message}`); }
        log(`🔧 Tool: ${t.function.name}`);
        await ejecutarTool(t, args, jid, usuario);
      }

      let linkMP = null;
      for (const m of usuario.historial) {
        if (m.role === 'tool' && m.content) {
          const match = m.content.match(/Link:\s*(https:\/\/www\.mercadopago\.com\.ar[^\s.]+)/);
          if (match) { linkMP = match[1]; break; }
        }
      }

      const msgs2 = [
        { role: 'system', content: `Sos Akira de ${MI_NOMBRE}. Natural, cálido, WhatsApp con ${usuario.nombre}. Max 3 líneas.` + (linkMP ? ' El link de pago se agrega automáticamente — NO lo menciones.' : '') },
        ...usuario.historial,
      ];
      try {
        resp = await groqSvc.llamarGroq(msgs2, false);
        msg  = resp.choices[0].message;
      } catch (e) {
        if (e.isRateLimit || e.isToolUseFailed) msg = { role: 'assistant', content: '¡Listo! Revisá el mensaje anterior. ¿Te quedó alguna duda? 😊' };
        else throw e;
      }

      if (linkMP && msg.content && !msg.content.includes('mercadopago.com.ar')) {
        msg = { ...msg, content: msg.content.trim() + `\n\n💳 *Para confirmar tu turno, pagá aquí:*\n${linkMP}\n\n⏳ Tenés 30 minutos para pagar, sino se cancela.` };
      }
    }

    return limpiarRespuesta(msg.content);
  }

  // ── Ejecutor de tools ────────────────────────────────────────
  async function ejecutarTool(tool, args, jid, usuario) {
    const push = c => usuario.historial.push({ role: 'tool', tool_call_id: tool.id, name: tool.function.name, content: c });

    if (tool.function.name === 'consultar_disponibilidad') {
      log(`[Calendar] consultar_disponibilidad → fecha=${args.fecha} userId=${USER_ID}`);
      try {
        const libres = await calendar.horariosLibres(args.fecha);
        log(`[Calendar] horariosLibres → ${libres.length} slots libres: ${libres.join(', ') || 'ninguno'}`);
        const res = libres.length > 0 ? `Horarios libres para ${args.fecha}: ${libres.join(', ')}` : `No hay horarios disponibles para el ${args.fecha}.`;
        if (!cacheTemporal[jid]) cacheTemporal[jid] = {};
        cacheTemporal[jid].ultimaConsulta = { fecha: args.fecha, libres, ts: Date.now() };
        db.guardar(CACHE_PATH, cacheTemporal);
        push(res);
      } catch (e) {
        log(`❌ [Calendar] horariosLibres ERROR: ${e.message}`);
        push(`Horarios de atención: ${MI_NOMBRE} atiende de lunes a viernes. Pedile al cliente que elija una fecha y te diga qué hora le queda bien.`);
      }
      return;
    }

    if (tool.function.name === 'agendar_turno') {
      const msgs   = usuario.historial.filter(m => m.role === 'user').map(m => (m.content || '').toLowerCase());
      const ultimo = msgs[msgs.length - 1] || '';
      const confirma = ['si','sí','dale','bueno','ok','reservame','reservá','agendame','quiero','perfecto','listo','va','confirmo','poneme','anotame'].some(p => ultimo.includes(p));
      const presel   = cacheTemporal[jid]?.preseleccionado;
      const porCache = presel && presel.fecha === args.fecha && presel.hora === args.hora;
      if (!confirma && !porCache) { push(`El cliente no confirmó aún. Preguntale si quiere el turno del ${args.fecha} a las ${args.hora}.`); return; }
      if (cacheTemporal[jid]?.preseleccionado) { delete cacheTemporal[jid].preseleccionado; db.guardar(CACHE_PATH, cacheTemporal); }
      limpiarExpiradas();
      const pend = pendienteActual(jid);
      if (pend) { push(`Ya tenés reserva pendiente para el ${pend.fecha} ${pend.hora}. Pagá esa primero.`); return; }
      const hF  = args.hora_fin || null;
      const [y, m, d] = args.fecha.split('-').map(Number);
      const hI   = parseInt(args.hora.split(':')[0]);
      const hFn  = hF ? parseInt(hF.split(':')[0]) : hI + DURACION_RESERVA_HORAS;
      const cant  = Math.max(1, hFn - hI);
      const total = PRECIO_TURNO * cant;
      const sk    = `${args.fecha}|${args.hora}`;
      if (slotsEnProceso.has(sk)) { push('El slot ya está siendo procesado. Pedile que elija otro.'); return; }
      slotsEnProceso.add(sk);
      try {
        const ini        = calendar.crearFecha(y, m, d, hI);
        const fin        = calendar.crearFecha(y, m, d, hFn);
        const conflictos = await calendar.obtenerEventos(CALENDAR_ID, ini, fin);
        if (conflictos.length > 0) { push(`El horario ${args.hora}–${hFn}:00 ya está ocupado.`); return; }

        if (MP_ACCESS_TOKEN) {
          // ── Flujo MercadoPago: requiere email para el payer ──
          if (!usuario.email) {
            cacheTemporal[jid] = { esperandoEmail: true, reservaPendiente: { fecha: args.fecha, hora: args.hora, horaFin: hF } };
            db.guardar(CACHE_PATH, cacheTemporal);
            push('Para reservar necesitamos el email del cliente. Pedíselo.'); return;
          }
          const pref = await mp.crearPago(jid, usuario.nombre, args.fecha, args.hora, hF);
          const rk   = `${jid}|${args.fecha}|${args.hora}|${hF || args.hora}`;
          reservasPendientes[rk] = { chatId: jid, fecha: args.fecha, hora: args.hora, horaFin: hF, nombre: usuario.nombre, email: usuario.email, cant, total, expiresAt: Date.now() + 30 * 60000 };
          db.guardar(RESERVAS_PATH, reservasPendientes);
          push(`Link generado. Reserva: ${args.fecha} ${args.hora}–${hFn}:00 $${total} ARS. Link: ${pref.init_point}. Solo se agenda si paga. Vence en 30 min.`);
          // Notificar al dueño (reserva pendiente de pago)
          notificarDueno(`🔔 *Reserva pendiente de pago*\n👤 ${usuario.nombre}\n📅 ${args.fecha} a las ${args.hora}\n💳 Esperando pago MP ($${total})\n📱 +${usuario.numeroReal || extraerNumero(jid)}`);
        } else {
          // ── Flujo sin MercadoPago: agendar directo + transferencia ──
          const desc = `WhatsApp: +${usuario.numeroReal || extraerNumero(jid)}${usuario.email ? ' | Email: ' + usuario.email : ''}`;
          const evento = await calendar.crearEvento(CALENDAR_ID, `Turno — ${usuario.nombre}`, desc, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(jid));

          if (!evento) {
            // El evento no se creó en Calendar — no confirmar al cliente
            log(`❌ [Turno] crearEvento falló para ${usuario.nombre} ${args.fecha} ${args.hora}`);
            push(`ERROR_CALENDAR: El turno NO fue guardado en el sistema. NO confirmes el turno. Decile al cliente que hubo un problema técnico y que ${MI_NOMBRE} lo va a contactar para confirmar manualmente.`);
          } else {
            usuario.turnosConfirmados = [...(usuario.turnosConfirmados || []), { fecha: args.fecha, hora: args.hora, horaFin: `${hFn}:00` }];
            clientesSvc.guardarMemoria(jid, usuario);
            programarRecs(jid, usuario.nombre, args.fecha, args.hora);
            programarResena(jid, evento.id, usuario.nombre, args.fecha, `${hFn}:00`);

            // Notificar al dueño
            notificarDueno(`✅ *Nuevo turno confirmado*\n👤 ${usuario.nombre}\n📅 ${args.fecha} a las ${args.hora}\n💰 $${total} ARS\n📱 +${usuario.numeroReal || extraerNumero(jid)}`);

            // Armar instrucción de pago con datos REALES (nunca inventados)
            let infoPago = '';
            if (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA) {
              infoPago = `Indicale que pague $${total} ARS por transferencia al` +
                (ALIAS_TRANSFERENCIA ? ` Alias: ${ALIAS_TRANSFERENCIA}` : '') +
                (CBU_TRANSFERENCIA   ? ` / CBU/CVU: ${CBU_TRANSFERENCIA}` : '') +
                ` y que mande el comprobante para confirmar.`;
            } else {
              infoPago = `No hay método de pago configurado. Indicale que ${MI_NOMBRE} le va a confirmar cómo abonar.`;
            }
            push(`Turno confirmado y agendado: ${args.fecha} ${args.hora}–${hFn}:00 $${total} ARS. ${infoPago}`);
          }
        }
      } catch (e) { log('[Pago] ' + e.message); push(`Error al procesar la reserva: ${e.message}.`); }
      finally { slotsEnProceso.delete(sk); }
      return;
    }

    // ── Tools de ALOJAMIENTO ─────────────────────────────────────
    if (tool.function.name === 'consultar_disponibilidad_alojamiento') {
      const { fecha_entrada, fecha_salida, nombre_unidad, huespedes } = args;
      const noches = Math.round((new Date(fecha_salida) - new Date(fecha_entrada)) / 86400000);
      if (noches < MINIMA_ESTADIA) { push(`Estadía mínima: ${MINIMA_ESTADIA} noche(s). El cliente pidió ${noches}.`); return; }

      // Con múltiples unidades: consultar cada una (o solo la solicitada)
      if (UNIDADES_ALOJAMIENTO.length > 0) {
        const unidadesAConsultar = nombre_unidad
          ? UNIDADES_ALOJAMIENTO.filter(u => u.nombre.toLowerCase().includes(nombre_unidad.toLowerCase()))
          : UNIDADES_ALOJAMIENTO.filter(u => !huespedes || u.capacidad >= Number(huespedes));

        if (unidadesAConsultar.length === 0) {
          push(`No hay unidades con capacidad para ${huespedes || 'esa cantidad'} de huéspedes.`); return;
        }

        const resultados = await Promise.all(
          unidadesAConsultar.map(async u => {
            const { disponible, motivo } = await calendar.consultarRango(fecha_entrada, fecha_salida, u.nombre);
            return { unidad: u, disponible, motivo };
          })
        );

        const disponibles = resultados.filter(r => r.disponible);
        if (disponibles.length === 0) {
          const motivo = resultados[0]?.motivo;
          push(motivo || `No hay unidades disponibles del ${fecha_entrada} al ${fecha_salida}.`); return;
        }

        if (!cacheTemporal[jid]) cacheTemporal[jid] = {};
        cacheTemporal[jid].ultimaConsultaAloj = { fechaEntrada: fecha_entrada, fechaSalida: fecha_salida, noches, ts: Date.now() };
        db.guardar(CACHE_PATH, cacheTemporal);

        const infoDisponibles = disponibles.map(r =>
          `${r.unidad.nombre} (cap. ${r.unidad.capacidad} pers.) — $${r.unidad.precioPorNoche * noches} ARS (${noches} noches)`
        ).join(' | ');
        push(`Disponibles del ${fecha_entrada} al ${fecha_salida}: ${infoDisponibles}. Check-in: ${CHECK_IN_HORA} hs. Check-out: ${CHECK_OUT_HORA} hs.${DIRECCION_PROPIEDAD ? ` Dirección: ${DIRECCION_PROPIEDAD}.` : ''}`);
        return;
      }

      // Sin unidades configuradas: comportamiento simple (una sola propiedad)
      const { disponible, motivo } = await calendar.consultarRango(fecha_entrada, fecha_salida);
      if (disponible) {
        if (!cacheTemporal[jid]) cacheTemporal[jid] = {};
        cacheTemporal[jid].ultimaConsultaAloj = { fechaEntrada: fecha_entrada, fechaSalida: fecha_salida, noches, ts: Date.now() };
        db.guardar(CACHE_PATH, cacheTemporal);
        push(`Disponible del ${fecha_entrada} al ${fecha_salida}. ${noches} noche(s). Check-in: ${CHECK_IN_HORA} hs. Check-out: ${CHECK_OUT_HORA} hs.${DIRECCION_PROPIEDAD ? ` Dirección: ${DIRECCION_PROPIEDAD}.` : ''}`);
      } else {
        push(motivo || `No disponible del ${fecha_entrada} al ${fecha_salida}. Ya hay una reserva en esas fechas.`);
      }
      return;
    }

    if (tool.function.name === 'agendar_alojamiento') {
      const { fecha_entrada, fecha_salida, nombre_unidad } = args;
      const msgs   = usuario.historial.filter(m => m.role === 'user').map(m => (m.content || '').toLowerCase());
      const ultimo = msgs[msgs.length - 1] || '';
      const confirma = ['si','sí','dale','bueno','ok','reservame','reservá','quiero','perfecto','listo','va','confirmo','poneme','anotame'].some(p => ultimo.includes(p));
      const cache    = cacheTemporal[jid]?.ultimaConsultaAloj;
      const porCache = cache && cache.fechaEntrada === fecha_entrada && cache.fechaSalida === fecha_salida;
      if (!confirma && !porCache) { push(`El cliente no confirmó. Preguntale si quiere reservar del ${fecha_entrada} al ${fecha_salida}.`); return; }
      if (cacheTemporal[jid]?.ultimaConsultaAloj) { delete cacheTemporal[jid].ultimaConsultaAloj; db.guardar(CACHE_PATH, cacheTemporal); }
      limpiarExpiradas();
      if (pendienteActual(jid)) { push('Ya hay una reserva pendiente de pago. El cliente debe pagarla primero.'); return; }

      // Resolver unidad y precio
      const unidad = nombre_unidad
        ? UNIDADES_ALOJAMIENTO.find(u => u.nombre.toLowerCase().includes(nombre_unidad.toLowerCase()))
        : UNIDADES_ALOJAMIENTO[0] || null;
      const precioPorNoche = unidad ? unidad.precioPorNoche : PRECIO_TURNO;
      const nombreEvento   = unidad ? `Reserva ${unidad.nombre} — ${usuario.nombre}` : `Reserva — ${usuario.nombre}`;

      const noches = Math.round((new Date(fecha_salida) - new Date(fecha_entrada)) / 86400000);
      const total  = precioPorNoche * noches;
      const [ye, me, de] = fecha_entrada.split('-').map(Number);
      const [ys, ms, ds] = fecha_salida.split('-').map(Number);
      const hCI = parseInt(CHECK_IN_HORA.split(':')[0]);
      const hCO = parseInt(CHECK_OUT_HORA.split(':')[0]);
      const ini = calendar.crearFecha(ye, me, de, hCI);
      const fin = calendar.crearFecha(ys, ms, ds, hCO);
      const sk  = `${fecha_entrada}|${fecha_salida}|${unidad?.nombre || ''}`;
      if (slotsEnProceso.has(sk)) { push('Reserva en proceso. Pedile que espere.'); return; }
      slotsEnProceso.add(sk);

      // Info de ubicación para incluir al confirmar
      const infoUbicacion = [
        DIRECCION_PROPIEDAD ? `📍 ${DIRECCION_PROPIEDAD}` : '',
        LINK_UBICACION      ? `🗺️ ${LINK_UBICACION}`      : '',
      ].filter(Boolean).join('\n');

      try {
        // Verificar conflictos solo para esta unidad (si se especificó)
        const eventos = await calendar.obtenerEventos(CALENDAR_ID, ini, fin);
        const conflictos = unidad
          ? eventos.filter(e => (e.summary || '').toLowerCase().includes(unidad.nombre.toLowerCase()))
          : eventos;
        if (conflictos.length > 0) { push(`Las fechas ${fecha_entrada}–${fecha_salida}${unidad ? ` para ${unidad.nombre}` : ''} ya están ocupadas.`); return; }

        if (MP_ACCESS_TOKEN) {
          if (!usuario.email) {
            cacheTemporal[jid] = { ...cacheTemporal[jid], esperandoEmail: true, reservaAlojPendiente: { fecha_entrada, fecha_salida, nombre_unidad } };
            db.guardar(CACHE_PATH, cacheTemporal);
            push('Necesitamos el email del cliente para el pago. Pedíselo.'); return;
          }
          const pref = await mp.crearPago(jid, usuario.nombre, fecha_entrada, CHECK_IN_HORA, CHECK_OUT_HORA);
          const rk   = `${jid}|${fecha_entrada}|${CHECK_IN_HORA}|${fecha_salida}|${unidad?.nombre || ''}`;
          reservasPendientes[rk] = { chatId: jid, fecha: fecha_entrada, hora: CHECK_IN_HORA, horaFin: fecha_salida, unidad: unidad?.nombre || '', nombre: usuario.nombre, email: usuario.email, cant: noches, totalPrecio: total, expiresAt: Date.now() + 30 * 60000 };
          db.guardar(RESERVAS_PATH, reservasPendientes);
          push(`Link de pago generado. ${unidad ? unidad.nombre + ' — ' : ''}${fecha_entrada} al ${fecha_salida} — ${noches} noches — $${total} ARS. Link: ${pref.init_point}. Vence en 30 min.`);
          notificarDueno(`🔔 *Reserva pendiente de pago*\n👤 ${usuario.nombre}${unidad ? '\n🏠 ' + unidad.nombre : ''}\n📅 ${fecha_entrada} → ${fecha_salida} (${noches} noches)\n💳 Esperando pago MP ($${total} ARS)\n📱 +${usuario.numeroReal || extraerNumero(jid)}`);
        } else {
          const desc = `Check-in: ${CHECK_IN_HORA} | Check-out: ${CHECK_OUT_HORA} | WhatsApp: +${usuario.numeroReal || extraerNumero(jid)}${unidad ? ' | Unidad: ' + unidad.nombre : ''}`;
          await calendar.crearEvento(CALENDAR_ID, nombreEvento, desc, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(jid));
          usuario.turnosConfirmados = [...(usuario.turnosConfirmados || []), { fecha: fecha_entrada, hora: CHECK_IN_HORA, horaFin: fecha_salida, unidad: unidad?.nombre || '' }];
          clientesSvc.guardarMemoria(jid, usuario);
          let infoPago = '';
          if (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA) {
            infoPago = `Indicale que transfiera $${total} ARS al Alias: ${ALIAS_TRANSFERENCIA}${CBU_TRANSFERENCIA ? ` / CBU: ${CBU_TRANSFERENCIA}` : ''} y mande comprobante.`;
          } else {
            infoPago = `${MI_NOMBRE} le va a indicar cómo abonar.`;
          }
          const infoLocacion = infoUbicacion ? ` Al confirmar el pago enviá la ubicación: ${infoUbicacion}.` : '';
          push(`Reserva confirmada: ${unidad ? unidad.nombre + ' — ' : ''}${fecha_entrada} al ${fecha_salida} — ${noches} noches — $${total} ARS. Check-in ${CHECK_IN_HORA}, Check-out ${CHECK_OUT_HORA}. ${infoPago}${infoLocacion}`);
          notificarDueno(`✅ *Nueva reserva confirmada*\n👤 ${usuario.nombre}${unidad ? '\n🏠 ' + unidad.nombre : ''}\n📅 ${fecha_entrada} → ${fecha_salida} (${noches} noches)\n💰 $${total} ARS\n📱 +${usuario.numeroReal || extraerNumero(jid)}`);
        }
      } catch (e) { log('[Aloj] ' + e.message); push(`Error al procesar la reserva: ${e.message}.`); }
      finally { slotsEnProceso.delete(sk); }
      return;
    }

    if (tool.function.name === 'cancelar_alojamiento') {
      const { fecha_entrada, nombre_unidad: nu } = args;
      const t = (usuario.turnosConfirmados || []).find(t =>
        t.fecha === fecha_entrada && (!nu || !t.unidad || t.unidad.toLowerCase().includes(nu.toLowerCase()))
      );
      if (!t) { push(`No encontré reserva con entrada el ${fecha_entrada}.`); return; }
      const [ye, me, de] = fecha_entrada.split('-').map(Number);
      const hCI = parseInt(CHECK_IN_HORA.split(':')[0]);
      const hs  = (calendar.crearFecha(ye, me, de, hCI).getTime() - Date.now()) / 3600000;
      if (hs < HORAS_MINIMAS_CANCELACION) { push(`No se puede cancelar: el check-in es en ${Math.round(hs)} hs.`); return; }
      const fechaSalida = t.horaFin;
      if (fechaSalida) {
        const [ys, ms, ds] = fechaSalida.split('-').map(Number);
        const hCO = parseInt(CHECK_OUT_HORA.split(':')[0]);
        const evs = await calendar.obtenerEventos(CALENDAR_ID, calendar.crearFecha(ye, me, de, hCI), calendar.crearFecha(ys, ms, ds, hCO));
        const ev  = evs.find(e => {
          const s = (e.summary || '').toLowerCase();
          return s.includes(usuario.nombre.toLowerCase()) && (!t.unidad || s.includes(t.unidad.toLowerCase()));
        });
        if (ev) await calendar.eliminarEvento(CALENDAR_ID, ev.id);
      }
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).filter(tc => !(tc.fecha === fecha_entrada && (!nu || !tc.unidad || tc.unidad.toLowerCase().includes(nu.toLowerCase()))));
      clientesSvc.guardarMemoria(jid, usuario);
      push(`Reserva${t.unidad ? ' de ' + t.unidad : ''} del ${fecha_entrada} cancelada.`); return;
    }

    if (tool.function.name === 'reagendar_alojamiento') {
      const { fecha_entrada_actual, fecha_entrada_nueva, fecha_salida_nueva, nombre_unidad: nu } = args;
      const t = (usuario.turnosConfirmados || []).find(t =>
        t.fecha === fecha_entrada_actual && (!nu || !t.unidad || t.unidad.toLowerCase().includes(nu.toLowerCase()))
      );
      if (!t) { push(`No encontré reserva con entrada el ${fecha_entrada_actual}.`); return; }
      const [ye, me, de] = fecha_entrada_actual.split('-').map(Number);
      const hCI = parseInt(CHECK_IN_HORA.split(':')[0]);
      const hs  = (calendar.crearFecha(ye, me, de, hCI).getTime() - Date.now()) / 3600000;
      if (hs < HORAS_MINIMAS_CANCELACION) { push(`No se puede reagendar: el check-in es en ${Math.round(hs)} hs.`); return; }
      const { disponible } = await calendar.consultarRango(fecha_entrada_nueva, fecha_salida_nueva, t.unidad || null);
      if (!disponible) { push(`Las nuevas fechas ${fecha_entrada_nueva}–${fecha_salida_nueva}${t.unidad ? ' para ' + t.unidad : ''} ya están ocupadas.`); return; }
      // Eliminar evento viejo
      const fechaSalidaActual = t.horaFin;
      if (fechaSalidaActual) {
        const [ys, ms, ds] = fechaSalidaActual.split('-').map(Number);
        const hCO = parseInt(CHECK_OUT_HORA.split(':')[0]);
        const evs = await calendar.obtenerEventos(CALENDAR_ID, calendar.crearFecha(ye, me, de, hCI), calendar.crearFecha(ys, ms, ds, hCO));
        const ev  = evs.find(e => {
          const s = (e.summary || '').toLowerCase();
          return s.includes(usuario.nombre.toLowerCase()) && (!t.unidad || s.includes(t.unidad.toLowerCase()));
        });
        if (ev) await calendar.eliminarEvento(CALENDAR_ID, ev.id);
      }
      // Crear evento nuevo
      const [yn, mn, dn] = fecha_entrada_nueva.split('-').map(Number);
      const [ys2, ms2, ds2] = fecha_salida_nueva.split('-').map(Number);
      const hCO = parseInt(CHECK_OUT_HORA.split(':')[0]);
      const inN = calendar.crearFecha(yn, mn, dn, hCI);
      const fiN = calendar.crearFecha(ys2, ms2, ds2, hCO);
      const noches = Math.round((new Date(fecha_salida_nueva) - new Date(fecha_entrada_nueva)) / 86400000);
      const nomEvNuevo = t.unidad ? `Reserva ${t.unidad} — ${usuario.nombre}` : `Reserva — ${usuario.nombre}`;
      await calendar.crearEvento(CALENDAR_ID, nomEvNuevo, `Reagendado. WhatsApp: +${usuario.numeroReal || extraerNumero(jid)}`, inN, fiN, usuario.email, usuario.numeroReal || extraerNumero(jid));
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).map(tc =>
        tc.fecha === fecha_entrada_actual && (!nu || !tc.unidad || tc.unidad.toLowerCase().includes(nu.toLowerCase()))
          ? { ...tc, fecha: fecha_entrada_nueva, horaFin: fecha_salida_nueva }
          : tc
      );
      clientesSvc.guardarMemoria(jid, usuario);
      push(`Reserva${t.unidad ? ' de ' + t.unidad : ''} reagendada: ${fecha_entrada_nueva} al ${fecha_salida_nueva} (${noches} noches). Sin costo extra.`); return;
    }

    // ── Tools de SERVICIOS (lavaderos, mecánicos, veterinarias) ──
    if (tool.function.name === 'agendar_servicio') {
      const msgs   = usuario.historial.filter(m => m.role === 'user').map(m => (m.content || '').toLowerCase());
      const ultimo = msgs[msgs.length - 1] || '';
      const confirma = ['si','sí','dale','bueno','ok','reservame','agendame','quiero','perfecto','listo','va','confirmo','poneme','anotame'].some(p => ultimo.includes(p));
      if (!confirma) { push(`El cliente no confirmó aún. Preguntale si quiere agendar el ${args.servicio} para el ${args.fecha} a las ${args.hora}.`); return; }

      limpiarExpiradas();
      const pend = pendienteActual(jid);
      if (pend) { push(`Ya hay un servicio pendiente de pago para el ${pend.fecha} ${pend.hora}. Que pague ese primero.`); return; }

      const sk = `${args.fecha}|${args.hora}`;
      if (slotsEnProceso.has(sk)) { push('Ese horario ya está siendo procesado. Pedile que elija otro.'); return; }
      slotsEnProceso.add(sk);
      try {
        // Calcular precio y duración
        const servicioConf = SERVICIOS_LIST.find(s => s.nombre.toLowerCase().includes((args.servicio || '').toLowerCase()));
        const durMin  = servicioConf?.duracion || 60;
        const total   = servicioConf?.precio   || PRECIO_TURNO;
        const [y, m, d] = args.fecha.split('-').map(Number);
        const hI = parseInt(args.hora.split(':')[0]);
        const hFn = args.hora_fin ? parseInt(args.hora_fin.split(':')[0]) : hI + Math.ceil(durMin / 60);
        const hFnStr = `${String(hFn).padStart(2,'0')}:00`;
        const ini = calendar.crearFecha(y, m, d, hI);
        const fin = calendar.crearFecha(y, m, d, hFn);

        const tituloEvento = `${args.servicio} — ${args.info_item} — ${usuario.nombre}`;
        const descEvento   = `WhatsApp: +${usuario.numeroReal || extraerNumero(jid)} | Ítem: ${args.info_item}${usuario.email ? ' | Email: ' + usuario.email : ''}`;

        if (MP_ACCESS_TOKEN) {
          const pref = await mp.crearPreferencia(usuario.nombre, args.fecha, args.hora, total, jid);
          if (pref?.init_point) {
            const rk = `${jid}|${args.fecha}|${args.hora}|${hFnStr}`;
            reservasPendientes[rk] = { chatId: jid, fecha: args.fecha, hora: args.hora, horaFin: hFnStr, nombre: usuario.nombre, email: usuario.email, cant: 1, total, servicio: args.servicio, infoItem: args.info_item, expiresAt: Date.now() + 30 * 60000 };
            db.guardar(RESERVAS_PATH, reservasPendientes);
            push(`Link generado. ${args.servicio} — ${args.info_item} — ${args.fecha} ${args.hora}. $${total} ARS. Link: ${pref.init_point}. Vence en 30 min.`);
            notificarDueno(`🔔 *Servicio pendiente de pago*\n🔧 ${args.servicio}\n🚗 ${args.info_item}\n👤 ${usuario.nombre}\n📅 ${args.fecha} ${args.hora}\n💳 Esperando pago MP ($${total})\n📱 +${usuario.numeroReal || extraerNumero(jid)}`);
          } else { push('Error generando link de pago. Intentá de nuevo.'); }
        } else {
          const evento = await calendar.crearEvento(CALENDAR_ID, tituloEvento, descEvento, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(jid));
          if (!evento) { push('ERROR_CALENDAR: El servicio NO fue guardado. Avisale al cliente que hubo un problema técnico.'); return; }
          usuario.turnosConfirmados = [...(usuario.turnosConfirmados || []), { fecha: args.fecha, hora: args.hora, horaFin: hFnStr, servicio: args.servicio, infoItem: args.info_item }];
          clientesSvc.guardarMemoria(jid, usuario);
          programarRecs(jid, usuario.nombre, args.fecha, args.hora);
          let infoPago = '';
          if (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA) {
            infoPago = ` Aboná $${total} ARS al Alias: ${ALIAS_TRANSFERENCIA}${CBU_TRANSFERENCIA ? ` / CBU: ${CBU_TRANSFERENCIA}` : ''} y mandá el comprobante.`;
          }
          push(`Servicio confirmado: ${args.servicio} — ${args.info_item} — ${args.fecha} ${args.hora}–${hFnStr}. $${total} ARS.${infoPago}`);
          notificarDueno(`✅ *Nuevo servicio confirmado*\n🔧 ${args.servicio}\n🚗 ${args.info_item}\n👤 ${usuario.nombre}\n📅 ${args.fecha} ${args.hora}–${hFnStr}\n💰 $${total} ARS\n📱 +${usuario.numeroReal || extraerNumero(jid)}`);
        }
      } catch (e) { log('[Servicios] ' + e.message); push('Error al procesar el servicio: ' + e.message); }
      finally { slotsEnProceso.delete(sk); }
      return;
    }

    if (tool.function.name === 'cancelar_servicio') {
      const t = (usuario.turnosConfirmados || []).find(t => t.fecha === args.fecha && t.hora === args.hora);
      if (!t) { push(`No encontré servicio para ${args.fecha} ${args.hora}.`); return; }
      const [y, m, d] = args.fecha.split('-').map(Number);
      const hI = parseInt(args.hora.split(':')[0]);
      const hF = t.horaFin ? parseInt(t.horaFin.split(':')[0]) : hI + 1;
      const evs = await calendar.obtenerEventos(CALENDAR_ID, calendar.crearFecha(y, m, d, hI), calendar.crearFecha(y, m, d, hF));
      const ev  = evs.find(e => e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase()));
      if (ev) await calendar.eliminarEvento(CALENDAR_ID, ev.id);
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).filter(tc => !(tc.fecha === args.fecha && tc.hora === args.hora));
      clientesSvc.guardarMemoria(jid, usuario);
      push(`Servicio ${t.servicio ? '(' + t.servicio + ')' : ''} del ${args.fecha} ${args.hora} cancelado.`);
      notificarDueno(`❌ *Servicio cancelado*\n🔧 ${t.servicio || 'Servicio'}\n🚗 ${t.infoItem || ''}\n👤 ${usuario.nombre}\n📅 ${args.fecha} ${args.hora}`);
      return;
    }

    if (tool.function.name === 'reagendar_servicio') {
      const t = (usuario.turnosConfirmados || []).find(tc => tc.fecha === args.fecha_actual && tc.hora === args.hora_actual);
      if (!t) { push(`No encontré servicio para ${args.fecha_actual} ${args.hora_actual}.`); return; }
      const [ya, ma, da] = args.fecha_actual.split('-').map(Number);
      const haI = parseInt(args.hora_actual.split(':')[0]);
      const haF = t.horaFin ? parseInt(t.horaFin.split(':')[0]) : haI + 1;
      const evs = await calendar.obtenerEventos(CALENDAR_ID, calendar.crearFecha(ya, ma, da, haI), calendar.crearFecha(ya, ma, da, haF));
      const ev  = evs.find(e => e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase()));
      if (ev) await calendar.eliminarEvento(CALENDAR_ID, ev.id);
      const [yn, mn, dn] = args.fecha_nueva.split('-').map(Number);
      const hnI = parseInt(args.hora_nueva.split(':')[0]);
      const durMin = (() => { const s = SERVICIOS_LIST.find(s => s.nombre.toLowerCase().includes((t.servicio || '').toLowerCase())); return s?.duracion || 60; })();
      const hnF = hnI + Math.ceil(durMin / 60);
      const hnFStr = `${String(hnF).padStart(2,'0')}:00`;
      const tituloEvento = `${t.servicio || 'Servicio'} — ${t.infoItem || ''} — ${usuario.nombre}`;
      await calendar.crearEvento(CALENDAR_ID, tituloEvento, `Reagendado. WhatsApp: +${usuario.numeroReal || extraerNumero(jid)}`, calendar.crearFecha(yn, mn, dn, hnI), calendar.crearFecha(yn, mn, dn, hnF), usuario.email, usuario.numeroReal || extraerNumero(jid));
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).map(tc =>
        tc.fecha === args.fecha_actual && tc.hora === args.hora_actual
          ? { ...tc, fecha: args.fecha_nueva, hora: args.hora_nueva, horaFin: hnFStr }
          : tc
      );
      clientesSvc.guardarMemoria(jid, usuario);
      push(`Servicio ${t.servicio ? '(' + t.servicio + ')' : ''} reagendado: ${args.fecha_nueva} ${args.hora_nueva}–${hnFStr}. Sin costo extra.`);
      return;
    }

    if (tool.function.name === 'cancelar_turno') {
      const t = (usuario.turnosConfirmados || []).find(t => t.fecha === args.fecha && t.hora === args.hora);
      if (!t) { push(`No encontré turno para ${args.fecha} ${args.hora}.`); return; }
      const [y, m, d] = args.fecha.split('-').map(Number);
      const h  = parseInt(args.hora.split(':')[0]);
      const hs = (calendar.crearFecha(y, m, d, h, 0).getTime() - Date.now()) / 3600000;
      if (hs < HORAS_MINIMAS_CANCELACION) { push(`No se puede cancelar: faltan solo ${Math.round(hs)}hs.`); return; }
      const hF  = t.horaFin ? parseInt(t.horaFin.split(':')[0]) : h + 1;
      const evs = await calendar.obtenerEventos(CALENDAR_ID, calendar.crearFecha(y, m, d, h), calendar.crearFecha(y, m, d, hF));
      const ev  = evs.find(e => e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase()));
      if (ev) await calendar.eliminarEvento(CALENDAR_ID, ev.id);
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).filter(t => !(t.fecha === args.fecha && t.hora === args.hora));
      clientesSvc.guardarMemoria(jid, usuario);
      // Notificar al siguiente en la lista de espera
      await waitlistSvc.notificarSiguiente(args.fecha, args.hora, enviarMensaje, notificarDueno);
      // Cancelar recordatorios programados para este turno
      const recKey = `${jid}|${args.fecha}|${args.hora}`;
      delete recordatoriosActivos[recKey];
      db.guardar(RECORDATORIOS_PATH, recordatoriosActivos);
      for (const label of ['24h', '4h', '30min']) {
        const tk = `${recKey}|${label}`;
        if (timeoutsRecs[tk]) { clearTimeout(timeoutsRecs[tk]); delete timeoutsRecs[tk]; }
      }
      push(`Turno ${args.fecha} ${args.hora} cancelado.`); return;
    }

    if (tool.function.name === 'anotarse_en_waitlist') {
      const tel = usuario.numeroReal || extraerNumero(jid);
      const res = await waitlistSvc.agregarALista(jid, usuario.nombre, tel, args.fecha, args.hora || null);
      if (res.ok) {
        push(`Cliente ${usuario.nombre} anotado en lista de espera para ${args.fecha}${args.hora ? ' ' + args.hora : ''}. Confirmale que lo vamos a contactar cuando se libere un turno.`);
      } else {
        push(res.msg || 'No se pudo anotar en la lista de espera.');
      }
      return;
    }

    if (tool.function.name === 'reagendar_turno') {
      const t = (usuario.turnosConfirmados || []).find(t => t.fecha === args.fecha_actual && t.hora === args.hora_actual);
      if (!t) { push(`No encontré turno para ${args.fecha_actual} ${args.hora_actual}.`); return; }
      const [ya, ma, da] = args.fecha_actual.split('-').map(Number);
      const ha  = parseInt(args.hora_actual.split(':')[0]);
      const hs  = (calendar.crearFecha(ya, ma, da, ha).getTime() - Date.now()) / 3600000;
      if (hs < HORAS_MINIMAS_CANCELACION) { push(`No se puede reagendar: faltan solo ${Math.round(hs)}hs.`); return; }
      const hfa  = t.horaFin ? parseInt(t.horaFin.split(':')[0]) : ha + 1;
      const dur  = Math.max(1, hfa - ha);
      const [yn, mn, dn] = args.fecha_nueva.split('-').map(Number);
      const hn   = parseInt(args.hora_nueva.split(':')[0]);
      const hfn  = Math.min(hn + dur, HORA_FIN_DIA);
      const hfnStr = `${String(hfn).padStart(2, '0')}:00`;
      const ini  = calendar.crearFecha(yn, mn, dn, hn);
      const fin  = calendar.crearFecha(yn, mn, dn, hfn);
      const conf = await calendar.obtenerEventos(CALENDAR_ID, ini, fin);
      const confR = conf.filter(e => !(e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase()) && args.fecha_nueva === args.fecha_actual));
      if (confR.length > 0) { push(`El horario ${args.fecha_nueva} ${args.hora_nueva}–${hfnStr} ya está ocupado.`); return; }
      const evs = await calendar.obtenerEventos(CALENDAR_ID, calendar.crearFecha(ya, ma, da, ha), calendar.crearFecha(ya, ma, da, hfa));
      const ev  = evs.find(e => e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase()));
      if (ev) await calendar.eliminarEvento(CALENDAR_ID, ev.id);
      const nuevo = await calendar.crearEvento(CALENDAR_ID, `Turno — ${usuario.nombre}`, `WhatsApp: +${usuario.numeroReal || extraerNumero(jid)} | Reagendado desde ${args.fecha_actual} ${args.hora_actual}`, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(jid));
      if (!nuevo) { push('Error creando nuevo evento.'); return; }
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).map(tc => tc.fecha === args.fecha_actual && tc.hora === args.hora_actual ? { ...tc, fecha: args.fecha_nueva, hora: args.hora_nueva, horaFin: hfnStr } : tc);
      clientesSvc.guardarMemoria(jid, usuario);
      programarRecs(jid, usuario.nombre, args.fecha_nueva, args.hora_nueva);
      push(`Reagendado: ${args.fecha_nueva} ${args.hora_nueva}–${hfnStr}. Sin costo extra.`);
    }

    // ── Tool: buscar en catálogo de productos ───────────────────
    if (tool.function.name === 'consultar_catalogo') {
      const { query = '', categoria = '' } = args;
      const q   = query.toLowerCase();
      const cat = categoria.toLowerCase();
      const resultados = CATALOGO.filter(p => {
        if (!p.disponible) return false;
        if (cat && !(p.categoria || '').toLowerCase().includes(cat)) return false;
        if (q && !p.nombre.toLowerCase().includes(q) && !(p.descripcion || '').toLowerCase().includes(q)) return false;
        return true;
      });
      if (resultados.length === 0) {
        push('No encontré productos que coincidan con la búsqueda. Chequeá con el negocio directamente.');
        return;
      }
      push(resultados.map(p =>
        `*${p.nombre}* — $${p.precio.toLocaleString('es-AR')} ${p.moneda || 'ARS'}` +
        (p.descripcion ? `\n${p.descripcion}` : '') +
        (p.categoria   ? ` [${p.categoria}]`  : '') +
        (p.stock >= 0  ? `\nStock disponible: ${p.stock}` : '')
      ).join('\n\n'));
      return;
    }
  }

  // ── Pago post-email ──────────────────────────────────────────
  async function generarPago(jid, usuario, fecha, hora, horaFin = null) {
    try {
      limpiarExpiradas();
      const pend = pendienteActual(jid);
      if (pend) { await enviarMensaje(jid, `Ojo, ${usuario.nombre}! Ya tenés un turno pendiente para el *${pend.fecha}* a las *${pend.hora}*. Pagá ese primero. 💳`); return; }
      const hI   = parseInt(hora.split(':')[0]);
      const hF   = horaFin ? parseInt(horaFin.split(':')[0]) : hI + 1;
      const cant  = Math.max(1, hF - hI);
      const total = PRECIO_TURNO * cant;

      // Sin MercadoPago: usar transferencia bancaria (flujo post-email)
      if (!MP_ACCESS_TOKEN) {
        const [y, m, d] = fecha.split('-').map(Number);
        const ini = calendar.crearFecha(y, m, d, hI);
        const fin = calendar.crearFecha(y, m, d, hF);
        const desc = `WhatsApp: +${usuario.numeroReal || extraerNumero(jid)}${usuario.email ? ' | Email: ' + usuario.email : ''}`;
        await calendar.crearEvento(CALENDAR_ID, `Turno — ${usuario.nombre}`, desc, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(jid));
        usuario.turnosConfirmados = [...(usuario.turnosConfirmados || []), { fecha, hora, horaFin: horaFin || null }];
        clientesSvc.guardarMemoria(jid, usuario);
        programarRecs(jid, usuario.nombre, fecha, hora);
        const r = horaFin ? `de *${hora}* a *${horaFin}*` : `a las *${hora}*`;
        let msg = `¡Perfecto, ${usuario.nombre}! 🎉 Tu turno del *${fecha}* ${r} está confirmado.\n\n💰 *Total: $${total} ARS*\n\n`;
        if (ALIAS_TRANSFERENCIA || CBU_TRANSFERENCIA) {
          msg += `📲 *Pagá por transferencia:*\n`;
          if (ALIAS_TRANSFERENCIA) msg += `• Alias: *${ALIAS_TRANSFERENCIA}*\n`;
          if (CBU_TRANSFERENCIA)   msg += `• CBU/CVU: *${CBU_TRANSFERENCIA}*\n`;
          msg += `\n📸 Mandanos el *comprobante* para confirmar. ✅`;
        } else {
          msg += `${MI_NOMBRE} te va a indicar cómo abonar. ✅`;
        }
        await enviarMensaje(jid, msg); return;
      }

      const pref  = await mp.crearPago(jid, usuario.nombre, fecha, hora, horaFin);
      const rk    = `${jid}|${fecha}|${hora}|${horaFin || hora}`;
      reservasPendientes[rk] = { chatId: jid, fecha, hora, horaFin, nombre: usuario.nombre, email: usuario.email, cant, total, expiresAt: Date.now() + 30 * 60000 };
      db.guardar(RESERVAS_PATH, reservasPendientes);
      const r = horaFin ? `de *${hora}* a *${horaFin}*` : `a las *${hora}*`;
      await enviarMensaje(jid, `¡Perfecto! 🎉 Para confirmar tu turno del *${fecha}* ${r}:\n\n💳 *Pagá aquí:*\n${pref.init_point}\n\n💰 *$${total} ARS*${cant > 1 ? ` (${cant} × $${PRECIO_TURNO})` : ''}\n⏳ Vence en 30 min. ✅`);
    } catch (e) { log('[MP] Error pago: ' + e.message); await enviarMensaje(jid, '¡Ups! Error generando el link de pago. Intentá en unos minutos. 🙏'); }
  }

  // ── Registro de nombre ───────────────────────────────────────
  async function registrarNombre(jid, texto, tel, pushName = '') {
    if (!cacheTemporal[jid]) {
      // Si WhatsApp nos da el nombre del contacto y es válido, usarlo directamente
      if (pushName && esNombreValido(pushName)) {
        const nombre = capitalizar(quitarEmojis(pushName.trim()));
        const u = { nombre, telefono: jid, numeroReal: tel, email: null, historial: [{ role: 'assistant', content: '¡Hola!' }, { role: 'user', content: nombre }], silenciado: false };
        clientesSvc.guardarMemoria(jid, u);
        const s = `¡Hola, ${nombre}! ✨ Soy Akira, asistente de *${MI_NOMBRE}* — ${NEGOCIO}.\n\n¿En qué te puedo ayudar? 😊`;
        u.historial.push({ role: 'assistant', content: s }); clientesSvc.guardarMemoria(jid, u);
        await enviarMensaje(jid, s); return true;
      }
      cacheTemporal[jid] = { esperandoNombre: true };
      db.guardar(CACHE_PATH, cacheTemporal);
      await enviarMensaje(jid, `¡Hola! ✨ Soy Akira, asistente de *${MI_NOMBRE}* — ${NEGOCIO}.\n\n¿Cuál es tu nombre? 😊`);
      return true;
    }
    if (cacheTemporal[jid]?.esperandoNombre) {
      if (!esNombreValido(texto.trim())) { await enviarMensaje(jid, '¿Me decís tu nombre real? (solo letras) 😊'); return true; }
      const nombre = capitalizar(quitarEmojis(texto.trim()));
      const u = { nombre, telefono: jid, numeroReal: tel, email: null, historial: [{ role: 'assistant', content: '¡Hola! ¿Cómo es tu nombre?' }, { role: 'user', content: nombre }], silenciado: false };
      delete cacheTemporal[jid]; db.guardar(CACHE_PATH, cacheTemporal); clientesSvc.guardarMemoria(jid, u);
      const s = `¡Genial, ${nombre}! Un gusto. 🤝\n\n¿En qué te puedo ayudar hoy?`;
      u.historial.push({ role: 'assistant', content: s }); clientesSvc.guardarMemoria(jid, u);
      await enviarMensaje(jid, s); return true;
    }
    return false;
  }

  async function capturaEmail(jid, texto, usuario) {
    if (!esEmailValido(texto.trim())) { await enviarMensaje(jid, '¡Ese email no parece válido! ¿Lo escribís de nuevo? (ej: nombre@gmail.com)'); return; }
    usuario.email = texto.trim().toLowerCase(); clientesSvc.guardarMemoria(jid, usuario);
    const { fecha, hora, horaFin } = cacheTemporal[jid].reservaPendiente;
    delete cacheTemporal[jid]; db.guardar(CACHE_PATH, cacheTemporal);
    await generarPago(jid, usuario, fecha, hora, horaFin || null);
  }

  function quiereConDueno(t) {
    return [`hablar con ${MI_NOMBRE.toLowerCase()}`, 'pasame con', 'quiero hablar con', 'necesito hablar con'].some(f => t.includes(f));
  }

  // ── Comandos del dueño ───────────────────────────────────────
  async function manejarComando(bodyLower, jid, usuario) {
    if (bodyLower.includes('akira stop'))       { if (usuario) { usuario.silenciado = true;  clientesSvc.guardarMemoria(jid, usuario); } await enviarMensaje(jid, '*(Akira apagada)*');    return; }
    if (bodyLower.includes('akira reactivate')) { if (usuario) { usuario.silenciado = false; clientesSvc.guardarMemoria(jid, usuario); } await enviarMensaje(jid, '*(Akira reactivada)*'); return; }
    if (bodyLower.includes('akira status')) {
      const clientes = clientesSvc.listarClientes();
      const lineas   = clientes.map(c => `${c.nombre || '?'}: ${c.silenciado ? 'SILENCIADO' : 'activo'}`);
      await enviarMensaje(jid, `*Clientes (${clientes.length}):*\n${lineas.join('\n') || 'Sin clientes aún.'}`);
    }

    // ── akira listo [info] — avisar al cliente que su trabajo está listo ──
    if (bodyLower.startsWith('akira listo')) {
      const info = bodyLower.replace(/^akira listo\s*/i, '').trim();
      if (!info) { await enviarMensaje(jid, '*(Uso: akira listo [patente / nombre del ítem])*'); return; }
      const clientes = clientesSvc.listarClientes();
      const encontrado = clientes.find(c =>
        (c.turnosConfirmados || []).some(t => t.infoItem && t.infoItem.toLowerCase().includes(info))
      );
      if (!encontrado) {
        await enviarMensaje(jid, `*(No encontré ningún cliente con "${info}" en servicios activos)*`);
        return;
      }
      const turno = (encontrado.turnosConfirmados || []).find(t => t.infoItem && t.infoItem.toLowerCase().includes(info));
      const msgCliente = `¡Hola ${encontrado.nombre}! 🎉 Tu *${turno?.servicio || 'trabajo'}* ya está listo. Podés venir a buscarlo cuando quieras. ¡Gracias por elegirnos! 😊`;
      await enviarMensaje(encontrado.jid, msgCliente);
      await enviarMensaje(jid, `*(✅ Notificación enviada a ${encontrado.nombre})*`);
      return;
    }
  }

  // ── Sincronizar catálogo desde WA Business ───────────────────
  async function sincronizarCatalogoWA() {
    try {
      if (!sock) return;

      // Si ya detectamos que no es cuenta Business, no reintentar nunca más en esta sesión
      if (esNegocioWA === false) return;

      // Si hay catálogo manual configurado y no es Business, no molestar
      if (catalogFallos >= 3) return;

      // Verificar que getCatalog exista (solo en cuentas Business)
      if (typeof sock.getCatalog !== 'function') {
        if (esNegocioWA === null) {
          esNegocioWA = false;
          log('[Catálogo] ℹ️ Esta cuenta no es WhatsApp Business — sync de catálogo WA desactivado. Podés cargar productos manualmente desde el dashboard.');
        }
        return;
      }

      log(`[Catálogo] 🔄 Obteniendo catálogo WA Business...`);

      // Timeout de 12s — getCatalog puede colgar sin respuesta en cuentas no-Business
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('CATALOG_TIMEOUT')), 12_000)
      );
      const result = await Promise.race([sock.getCatalog({ limit: 100 }), timeoutPromise]);

      const products = result?.products;

      if (!products?.length) {
        // Respuesta válida pero sin productos — es Business pero catálogo vacío
        esNegocioWA = true;
        catalogFallos = 0;
        log('[Catálogo] ℹ️ Catálogo WA Business vacío — publicá productos desde la app de WA Business.');
        emitter.emit('catalog:update', []);
        return;
      }

      const catalogo = products.map(p => ({
        waProductId:  String(p.id || ''),
        nombre:       p.name        || 'Sin nombre',
        descripcion:  p.description || '',
        precio:       parseFloat(p.price) || 0,
        moneda:       p.currency    || 'ARS',
        categoria:    p.category    || '',
        stock:        -1,
        imagen:       Object.values(p.imageUrls || {})[0] || '',
        disponible:   p.isHidden !== true,
        fuente:       'wa_catalog',
      }));

      esNegocioWA = true;
      catalogFallos = 0;
      log(`[Catálogo] ✅ ${catalogo.length} producto(s) sincronizados desde WA Business`);
      emitter.emit('catalog:update', catalogo);
    } catch (e) {
      if (e.message === 'CATALOG_TIMEOUT' || e.message?.toLowerCase().includes('timeout') || e.message?.toLowerCase().includes('timed')) {
        // Timeout = no es Business o la cuenta no tiene catálogo habilitado
        // No reintentar, no mostrar error, solo info la primera vez
        if (esNegocioWA === null) {
          esNegocioWA = false;
          log('[Catálogo] ℹ️ Cuenta WA personal (no Business) — sync de catálogo desactivado. El bot funciona normalmente.');
        }
        return;
      }
      // Otro error — contar fallo pero sin alarmar
      catalogFallos++;
      if (catalogFallos < 3) {
        log(`[Catálogo] ⚠️ Error obteniendo catálogo WA (intento ${catalogFallos}/3): ${e.message}`);
      } else {
        log('[Catálogo] ⏸ Sync de catálogo WA pausado. El bot sigue funcionando normalmente.');
      }
    }
  }

  // ── Analizar estado (status) del dueño para detectar productos ─
  async function procesarStatusDueno(msg) {
    try {
      const caption =
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.extendedTextMessage?.text || '';
      if (!caption || caption.length < 5) return;

      const rsp = await groqSvc.llamarGroq([
        { role: 'system', content: 'Sos un parser de productos. Si el texto describe un producto en venta (con precio), respondé SOLO con JSON válido: {"esProducto":true,"nombre":"...","precio":0,"descripcion":"...","categoria":""}. Si no es un producto respondé: {"esProducto":false}' },
        { role: 'user', content: caption },
      ], false);
      const content = rsp?.choices?.[0]?.message?.content || '';
      // Extraer JSON del texto (puede venir con texto adicional)
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return;
      const data = JSON.parse(match[0]);
      if (!data.esProducto) return;
      const producto = {
        nombre:      String(data.nombre      || '').trim(),
        precio:      parseFloat(data.precio) || 0,
        descripcion: String(data.descripcion || caption).trim(),
        categoria:   String(data.categoria   || '').trim(),
      };
      if (!producto.nombre) return;
      emitter.emit('catalog:candidate', producto);
      log(`[Catálogo] 📸 Producto detectado en estado: "${producto.nombre}" — $${producto.precio}`);
    } catch {}
  }

  // ── Handler principal de mensajes ────────────────────────────
  async function handleBaileysMessage(msg) {
    if (!msg.message) return;
    const jid = msg.key.remoteJid;
    if (!jid) return;
    if (isJidGroup(jid)) return;

    // Chats ignorados — el dueño los bloqueó desde el dashboard
    if (CHATS_IGNORADOS.length > 0) {
      const num = extraerNumero(jid);
      if (CHATS_IGNORADOS.includes(num)) return;
    }

    // Estados (stories) del dueño → detectar productos
    if (isJidStatusBroadcast(jid)) {
      if (msg.key.fromMe) await procesarStatusDueno(msg);
      return;
    }

    // Pedido de catálogo WA Business (cliente hace un order desde el catálogo)
    if (msg.message?.orderMessage) {
      const order  = msg.message.orderMessage;
      const items  = order.itemCount   || '?';
      const total  = order.totalAmount1000 ? (order.totalAmount1000 / 1000).toLocaleString('es-AR') : '?';
      const moneda = order.totalCurrencyCode || 'ARS';
      notificarDueno(
        `🛒 *Nuevo pedido de catálogo WA*\n` +
        `👤 ${extraerNumero(jid)}\n` +
        `📦 ${items} ${items === 1 ? 'artículo' : 'artículos'}\n` +
        `💰 $${total} ${moneda}\n` +
        `🆔 Pedido: ${order.orderId || '—'}`
      );
      await enviarMensaje(jid, `¡Gracias por tu pedido! 🛒\n*${MI_NOMBRE}* lo va a revisar y te contacta a la brevedad para coordinar entrega y pago.`);
      return;
    }

    // Mensajes propios (comandos del dueño)
    if (msg.key.fromMe) {
      const texto = getTexto(msg).toLowerCase().trim();
      if (texto.startsWith('akira ')) await manejarComando(texto, jid, clientesSvc.cargarMemoria(jid));
      return;
    }

    const msgType = Object.keys(msg.message)[0];
    const esAudio = msgType === 'audioMessage';

    if (!esAudio && !getTexto(msg)) return;

    let texto   = getTexto(msg);
    let fueAudio = false;

    if (esAudio) {
      if (!audioSvc) { await enviarMensaje(jid, '¡Ups! El servicio de audio aún no está listo. ¿Me lo escribís? 🙏'); return; }
      const buffer   = await downloadMediaMessage(msg, 'buffer', {});
      const mimetype = msg.message.audioMessage?.mimetype || 'audio/ogg; codecs=opus';
      const tr = await audioSvc.transcribirAudioBuffer(buffer, mimetype);
      if (!tr) { await enviarMensaje(jid, '¡Ups! No pude entender el audio. ¿Me lo escribís? 🙏'); return; }
      texto = tr; fueAudio = true;
    }

    const bodyLower = texto.toLowerCase().trim();
    log(`${fueAudio ? '🎤' : '📩'} [${jid}]: ${texto.slice(0, 80)}`);

    let usuario = clientesSvc.cargarMemoria(jid);
    if (usuario?.silenciado && !bodyLower.includes('akira')) return;

    try {
      const pushName = msg.pushName || '';
      const tel      = extraerNumero(jid);

      if (!usuario) { const r = await registrarNombre(jid, texto, tel, pushName); if (r) return; }
      if (cacheTemporal[jid]?.esperandoEmail) { await capturaEmail(jid, texto, clientesSvc.cargarMemoria(jid)); return; }

      // ── Interceptor: confirmación anti no-show ───────────────
      const turnoConfirmKey = Object.keys(cacheTemporal[jid] || {}).find(k => k.startsWith('esperandoConf_'));
      if (turnoConfirmKey) {
        const { fecha, hora } = cacheTemporal[jid][turnoConfirmKey];
        if (bodyLower.match(/\bsi\b|sí|confirmo|dale|voy|ahi estoy/)) {
          if (!cacheTemporal[jid].turnoConfirmado) cacheTemporal[jid].turnoConfirmado = {};
          cacheTemporal[jid].turnoConfirmado[`${fecha}|${hora}`] = true;
          delete cacheTemporal[jid][turnoConfirmKey];
          db.guardar(CACHE_PATH, cacheTemporal);
          await enviarMensaje(jid, `¡Perfecto! ✅ Te esperamos mañana a las *${hora}*. ¡Hasta pronto!`);
          return;
        }
        if (bodyLower.match(/\bno\b|cancelar|no puedo|no voy/)) {
          delete cacheTemporal[jid][turnoConfirmKey];
          db.guardar(CACHE_PATH, cacheTemporal);
          // Cancelar el turno en DB
          const Turno = require('../models/Turno');
          await Turno.findOneAndUpdate(
            { userId: USER_ID, clienteTelefono: usuario?.numeroReal || extraerNumero(jid), fechaInicio: { $gte: new Date() } },
            { $set: { estado: 'cancelado' } }
          ).catch(() => {});
          await waitlistSvc.notificarSiguiente(fecha, hora, enviarMensaje, notificarDueno);
          await enviarMensaje(jid, `Entendido, cancelamos tu turno del ${fecha} a las ${hora}. Si querés reagendar, avisame. 👍`);
          notificarDueno(`❌ *Turno cancelado por cliente*: ${usuario?.nombre || extraerNumero(jid)} canceló su turno del ${fecha} a las ${hora}.`);
          return;
        }
      }

      if (quiereConDueno(bodyLower)) {
        const u = clientesSvc.cargarMemoria(jid);
        if (u) { u.silenciado = true; clientesSvc.guardarMemoria(jid, u); }
        await enviarMensaje(jid, `¡Dale, ${u?.nombre || ''}! Le aviso a ${MI_NOMBRE} para que te contacte. 🙌`);
        return;
      }

      // Preselección de hora
      if (cacheTemporal[jid]?.ultimaConsulta) {
        const uc = cacheTemporal[jid].ultimaConsulta;
        if ((Date.now() - uc.ts) / 60000 < 30) {
          const hm = (uc.libres || []).filter(s => {
            const n = s.split(':')[0];
            return bodyLower.includes(`${n}:00`) || bodyLower.includes(`las ${n}`) || bodyLower.includes(`a las ${n}`) || bodyLower.includes(`${n} hs`);
          });
          if (hm.length === 1) { if (!cacheTemporal[jid]) cacheTemporal[jid] = {}; cacheTemporal[jid].preseleccionado = { fecha: uc.fecha, hora: hm[0].split(' ')[0] }; db.guardar(CACHE_PATH, cacheTemporal); }
        }
      }

      // Indicador de escritura
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});

      const u = clientesSvc.cargarMemoria(jid);
      // Seguridad: si por algún motivo el usuario no está registrado aún, lo registramos ahora
      if (!u) { await registrarNombre(jid, texto, tel, pushName); return; }
      u.historial.push({ role: 'user', content: fueAudio ? `[voz] ${texto}` : texto });
      u.historial = recortarHistorial(u.historial, 20);

      const respuesta = await procesarConIA(jid, u);
      u.historial.push({ role: 'assistant', content: respuesta });
      clientesSvc.guardarMemoria(jid, u);

      await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      log(`🤖 AKIRA → ${jid}: "${respuesta.slice(0, 60)}..."`);

      const debeAudio = fueAudio && audioSvc && audioSvc.debeResponderEnAudio(respuesta);
      if (debeAudio) {
        const ok = await audioSvc.enviarComoAudio(jid, respuesta, enviarAudio);
        if (!ok) await enviarMensaje(jid, respuesta);
      } else {
        await enviarMensaje(jid, respuesta);
      }
    } catch (err) {
      log('❌ handleMessage error: ' + err.message);
      let msgError = '¡Ups! Tuve un problema. ¿Me repetís la consulta? 🙏';
      if (err.isRateLimit)  msgError = 'Estoy con mucha demanda en este momento. ¡Te respondo en unos segundos! 🙏';
      if (err.isTimeout)    msgError = 'Tardé demasiado en pensar 😅 ¿Me repetís la pregunta?';
      if (err.isAuthError)  msgError = 'Tengo un problema de configuración. El dueño del negocio ya fue notificado. 🙏';
      await enviarMensaje(jid, msgError).catch(() => {});
      if (err.isAuthError)  notificarDueno(`⚠️ *Error de configuración*: La API Key de Groq es inválida. Actualizala en el dashboard de Akira.`);
    }
  }

  // ── Webhook MercadoPago ──────────────────────────────────────
  function iniciarServidor() {
    const app = express();
    app.use(express.json());
    app.post('/webhook-bot', async (req, res) => {
      res.sendStatus(200);
      const p = req.body;
      if (p.type !== 'payment' || !p.data?.id) return;
      try {
        const pago = await mp.verificarPago(p.data.id);
        if (pago.status !== 'approved') return;
        const rk   = pago.external_reference;
        const res2 = reservasPendientes[rk];
        if (!res2) return;
        if (Date.now() > res2.expiresAt) {
          await enviarMensaje(res2.chatId, `Hola ${res2.nombre}! Tu pago fue recibido ✅ pero la reserva expiró. ${MI_NOMBRE} te contacta para reagendar. 🙏`);
          delete reservasPendientes[rk]; db.guardar(RESERVAS_PATH, reservasPendientes); return;
        }
        const [y, m, d] = res2.fecha.split('-').map(Number);
        const hI  = parseInt(res2.hora.split(':')[0]);
        const hF  = res2.horaFin ? parseInt(res2.horaFin.split(':')[0]) : hI + DURACION_RESERVA_HORAS;
        const ini = calendar.crearFecha(y, m, d, hI);
        const fin = calendar.crearFecha(y, m, d, hF);
        const conf = await calendar.obtenerEventos(CALENDAR_ID, ini, fin);
        if (conf.length > 0) {
          await enviarMensaje(res2.chatId, `Hola ${res2.nombre}! Tu pago fue recibido ✅ pero el horario quedó ocupado. ${MI_NOMBRE} te contacta para reagendar. 🙏`);
          delete reservasPendientes[rk]; db.guardar(RESERVAS_PATH, reservasPendientes); return;
        }
        const um  = clientesSvc.cargarMemoria(res2.chatId);
        const tel = um?.numeroReal || extraerNumero(res2.chatId);
        const ev  = await calendar.crearEvento(CALENDAR_ID, `Turno — ${res2.nombre}`, `WhatsApp: +${tel} | Pago MP ID: ${pago.id} | $${res2.total || PRECIO_TURNO}`, ini, fin, res2.email || null, tel);
        delete reservasPendientes[rk]; db.guardar(RESERVAS_PATH, reservasPendientes);
        if (ev) {
          if (um) {
            if (!um.turnosConfirmados) um.turnosConfirmados = [];
            um.turnosConfirmados.push({ fecha: res2.fecha, hora: res2.hora, horaFin: res2.horaFin || null, pagoId: pago.id, confirmadoEn: new Date().toISOString() });
            um.historial.push({ role: 'assistant', content: `[SISTEMA] Pago MP confirmado (ID:${pago.id}). Turno ${res2.fecha} ${res2.hora}. YA PAGÓ.` });
            clientesSvc.guardarMemoria(res2.chatId, um);
          }
          const hFwh = res2.horaFin ? parseInt(res2.horaFin.split(':')[0]) : hF;
          programarRecs(res2.chatId, res2.nombre, res2.fecha, res2.hora);
          programarResena(res2.chatId, ev.id, res2.nombre, res2.fecha, res2.horaFin || `${hFwh}:00`);
          await enviarMensaje(res2.chatId, `¡Listo, ${res2.nombre}! 🎉\n✅ *Pago: $${res2.total || PRECIO_TURNO} ARS*\n📅 *Turno:* ${res2.fecha} de *${res2.hora}${res2.horaFin ? '–' + res2.horaFin : ''}*\n${ev.htmlLink ? `📆 ${ev.htmlLink}\n` : ''}\n⏰ Te recordamos 24hs, 4hs y 30min antes. ¡Te esperamos! 🙌`);
        } else {
          await enviarMensaje(res2.chatId, `Hola ${res2.nombre}! Pago recibido ✅ pero error en el calendario. ${MI_NOMBRE} confirma manualmente. 🙏`);
        }
      } catch (e) { log('[Webhook] ' + e.message); }
    });
    app.get('/health', (_, r) => r.json({ ok: true, bot: MI_NOMBRE }));
    expressServer = app.listen(PUERTO, () => log(`🚀 Webhook bot en puerto ${PUERTO}`));
    expressServer.on('error', (e) => log(`⚠️ Puerto ${PUERTO}: ${e.message}`));
  }

  async function iniciarNgrok() {
    if (!NGROK_AUTH_TOKEN) return;
    try {
      const ng = require('@ngrok/ngrok');
      const l  = await ng.forward({ addr: PUERTO, authtoken: NGROK_AUTH_TOKEN, domain: NGROK_DOMAIN || undefined });
      log(`✅ Ngrok: ${l.url()}/webhook-bot`);
    } catch (e) { log('❌ Ngrok: ' + e.message); }
  }

  // ── Conexión Baileys ─────────────────────────────────────────
  async function conectar() {
    // Cerrar socket anterior antes de crear uno nuevo.
    // Sin esto, el socket viejo queda vivo y WhatsApp envía código 440
    // (connectionReplaced) causando un loop infinito de reconexiones.
    if (sock) {
      const prevSock = sock;
      sock = null; // null primero: evita que el handler del socket viejo programe otro reconect
      try { prevSock.end(); } catch {}
    }

    const { state, saveCreds, clearAuth } = await useMongoAuthState(USER_ID);
    const { version } = await fetchLatestBaileysVersion();
    log(`[Baileys] Versión WA: ${version.join('.')}`);

    sock = makeWASocket({
      version,
      auth:                  state,
      logger:                pino({ level: 'silent' }),
      printQRInTerminal:     false,
      browser:               ['Akira Cloud', 'Chrome', '1.0.0'],
      connectTimeoutMs:      60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs:   30000,
    });

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        log('📱 QR generado — escaneá con WhatsApp');
        emitter.emit('qr', qr);
      }
      if (connection === 'close') {
        const code      = lastDisconnect?.error?.output?.statusCode;
        const loggedOut  = code === DisconnectReason.loggedOut;
        const replaced   = code === DisconnectReason.connectionReplaced; // 440
        log(`⚠️ Desconectado (código: ${code ?? 'undefined'})${loggedOut ? ' — sesión cerrada' : replaced ? ' — reemplazado' : ''}`);

        if (loggedOut || replaced) {
          // Sesión inválida — limpiar y detener para que el usuario escanee QR nuevo
          emitter.emit('disconnected', `código: ${code ?? 'undefined'}`);
          await clearAuth().catch(() => {});
          log('🗑️ Sesión eliminada — iniciá el bot de nuevo para escanear un QR nuevo.');
          await detener('session-cleared');
          return;
        }

        // código: undefined → WhatsApp cerró la conexión sin código de error.
        // Esto pasa cuando la sesión está corrupta o expirada.
        // Si ocurre 3 veces seguidas en menos de 2 minutos → sesión muerta, limpiar y detener.
        reconectarIntentos++;
        const tiempoDesdeConexion = Date.now() - tsUltimaConexion;
        const esCicloRapido = tiempoDesdeConexion < 120_000; // < 2 minutos

        if (code === undefined && esCicloRapido && reconectarIntentos >= 3) {
          log(`🗑️ Sesión inválida detectada (${reconectarIntentos} desconexiones rápidas) — limpiando sesión y pidiendo QR nuevo`);
          emitter.emit('disconnected', `sesión inválida — QR requerido`);
          await clearAuth().catch(() => {});
          reconectarIntentos = 0;
          await detener('session-cleared');
          return;
        }

        if (reconectarIntentos >= 15) {
          // Demasiados intentos fallidos — sesión probablemente muerta
          log(`❌ 15 intentos de reconexión fallidos — limpiando sesión y pidiendo QR nuevo`);
          emitter.emit('disconnected', `demasiados intentos — QR requerido`);
          await clearAuth().catch(() => {});
          reconectarIntentos = 0;
          await detener('session-cleared');
          return;
        }

        // Desconexión transitoria — reconectar automáticamente.
        // Resetear reconectando SIN importar quién lo seteó (watchdog, otro origen),
        // para que el reconect siempre se programe si el socket sigue referenciado.
        reconectando = false;
        if (sock !== null) {
          reconectando = true;
          const delay = Math.min(5000 * reconectarIntentos, 30_000); // backoff: 5s, 10s, 15s... max 30s
          log(`🔄 Reconectando en ${delay / 1000}s... (intento ${reconectarIntentos})`);
          setTimeout(() => {
            reconectando = false;
            if (sock !== null) conectar().catch(e => {
              log(`❌ Error al reconectar: ${e.message}`);
              reconectando = false;
            });
          }, delay);
        }
      }
      if (connection === 'open') {
        reconectarIntentos = 0; // reset — conexión exitosa
        tsUltimaConexion   = Date.now();
        log('✅ WhatsApp conectado y listo');
        emitter.emit('ready');
        reprogramarRecs();
        ultimoMensajeTs = Date.now();
        iniciarWatchdog();
        // Sincronizar catálogo WA Business (si tiene productos)
        setTimeout(() => sincronizarCatalogoWA().catch(() => {}), 5000);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Mensajes en paralelo — cada uno con timeout propio para que uno colgado
    // no bloquee los siguientes
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      ultimoMensajeTs = Date.now();
      for (const msg of messages) {
        const limit = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MSG_TIMEOUT')), 40_000)
        );
        // Envuelto en función async auto-invocada con catch garantizado
        // para que un error en un mensaje nunca corte el handler del siguiente
        (async () => {
          try {
            await Promise.race([handleBaileysMessage(msg), limit]);
          } catch (e) {
            log(`❌ Error handleMessage: ${e.message}`);
          }
        })();
      }
    });
  }

  // ── Watchdog: detecta conexión zombie y reconecta ────────────
  function iniciarWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    // Cada 3 minutos verifica si el socket sigue vivo
    watchdogTimer = setInterval(() => {
      // Top-level try/catch — si el watchdog falla no debe matar el intervalo
      try {
        if (!sock) return;
        const ZOMBIE_MS = 10 * 60 * 1000; // 10 min sin mensajes ni actividad
        const silencio  = Date.now() - ultimoMensajeTs;
        try {
          if (sock.ws && typeof sock.ws.ping === 'function') sock.ws.ping();
        } catch (pingErr) {
          log(`⚠️ [Watchdog] Ping falló (${pingErr.message}) — forzando reconexión`);
          detenerWatchdog();
          if (!reconectando) {
            try { sock.end(new Error('watchdog_ping_fail')); } catch {}
          }
          return;
        }
        if (silencio > ZOMBIE_MS) {
          log(`⚠️ [Watchdog] Sin actividad por ${Math.round(silencio/60000)}min — reconectando`);
          ultimoMensajeTs = Date.now();
          detenerWatchdog();
          if (!reconectando) {
            try { sock.end(new Error('watchdog_zombie')); } catch {}
          }
        }
      } catch (e) {
        log(`❌ [Watchdog] Error interno: ${e.message}`);
      }
    }, 3 * 60 * 1000);
  }

  function detenerWatchdog() {
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  }

  // ── Ciclo de vida ────────────────────────────────────────────
  async function iniciar() {
    // Cargar clientes existentes desde MongoDB (antes de procesar mensajes)
    await clientesSvc.inicializar();
    audioSvc = crearAudioService({ groqApiKey: GROQ_API_KEY, rimeApiKey: RIME_API_KEY, dataDir, log });
    iniciarServidor();
    if (NGROK_AUTH_TOKEN) await iniciarNgrok();
    // Escuchar solicitudes externas de sync de catálogo (desde bot.manager)
    emitter.on('catalog:sync', () => {
      log('[Catálogo] 🔄 Sync solicitado manualmente...');
      catalogFallos = 0;   // el usuario forzó el sync — resetear contador
      esNegocioWA   = null; // permitir redetección por si migró a Business
      sincronizarCatalogoWA().catch(() => {});
    });

    // Recargar tokens de Google Calendar en caliente (el usuario conectó OAuth)
    emitter.on('calendar:reload', async () => {
      try {
        const cfg = await Config.findOne({ userId: USER_ID });
        if (!cfg) return;
        const raw = cfg.getKey('googleCalendarTokens');
        if (!raw) return;
        const tokens = JSON.parse(raw);
        calendar.recargarTokens(tokens);
        log('🗓️ Google Calendar tokens recargados sin reiniciar el bot');
      } catch (e) {
        log('⚠️ calendar:reload error: ' + e.message);
      }
    });

    // Recargar configuración en caliente — se dispara cuando el usuario
    // guarda cambios desde el dashboard sin necesidad de reiniciar el bot
    emitter.on('config:reload', async () => {
      try {
        const cfg = await Config.findOne({ userId: USER_ID });
        if (!cfg) return;
        HORARIOS_ATENCION      = cfg.horariosAtencion    || {};
        DIAS_BLOQUEADOS        = cfg.diasBloqueados       || [];
        MODO_PAUSA             = cfg.modoPausa            || false;
        CELULAR_NOTIFICACIONES = cfg.celularNotificaciones || '';
        PROMPT_EXTRA           = cfg.promptPersonalizado  || '';
        SERVICIOS_LIST         = (() => { try { return cfg.serviciosList || []; } catch { return []; } })();
        CHATS_IGNORADOS        = cfg.chatsIgnorados       || [];
        // Recrear el calendar service con los nuevos horarios/días bloqueados
        calendar = _crearCalendar();
        log('⚙️ Configuración recargada en caliente — sin reiniciar el bot');
      } catch (e) {
        log('⚠️ config:reload error: ' + e.message);
      }
    });

    log('🔄 Iniciando conexión WhatsApp (Baileys — sin Chrome)...');
    await conectar();
  }

  async function detener(motivo = null) {
    const sockRef = sock;
    sock = null; // null primero para cortar reconexión automática
    reconectando = false;
    detenerWatchdog();
    for (const k of Object.keys(timeoutsRecs)) clearTimeout(timeoutsRecs[k]);
    if (sockRef) { try { sockRef.end(); } catch (e) { log('sock.end: ' + e.message); } }
    if (expressServer) { try { expressServer.close(); } catch {} expressServer = null; }
    log('🛑 Bot detenido.');
    emitter.emit('stopped', { sessionCleared: motivo === 'session-cleared' });
  }

  emitter.iniciar = iniciar;
  emitter.detener = detener;
  return emitter;
}

module.exports = crearAkiraBot;
