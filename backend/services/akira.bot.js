// services/akira.bot.js — Akira Bot v3.1 Cloud Edition
// Orquestador principal. La lógica específica vive en services/bot/*.
'use strict';

const { EventEmitter }   = require('events');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const Log     = require('../models/Log');

const crearPersistencia  = require('./bot/persistence.service');
const crearCalendarService = require('./bot/calendar.service');
const crearMPService     = require('./bot/mercadopago.service');
const crearAudioService  = require('./bot/audio.service');
const crearGroqService   = require('./bot/groq.service');

function crearAkiraBot(config, dataDir, sessionDir) {
  const emitter = new EventEmitter();

  // ── Config ────────────────────────────────────────────────────
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
  const CALENDAR_ID               = config.CALENDAR_ID || '';
  const PROMPT_EXTRA              = config.PROMPT_PERSONALIZADO || '';
  const DURACION_RESERVA_HORAS    = 1;
  const HORA_INICIO_DIA           = 9;
  const HORA_FIN_DIA              = 18;
  const ZONA_HORARIA              = 'America/Argentina/Buenos_Aires';
  const PUERTO                    = parseInt(config.PORT || '3100');

  const CACHE_PATH          = path.join(dataDir, '_cache.json');
  const RESERVAS_PATH       = path.join(dataDir, '_reservas.json');
  const RECORDATORIOS_PATH  = path.join(dataDir, '_recordatorios.json');
  const CREDENTIALS_PATH    = path.join(dataDir, 'credentials.json');

  function log(msg) { emitter.emit('log', msg); }

  // ── Servicios ─────────────────────────────────────────────────
  const db       = crearPersistencia(dataDir, log);
  const calendar = crearCalendarService({
    calendarId: CALENDAR_ID, credentialsPath: CREDENTIALS_PATH,
    horaInicio: HORA_INICIO_DIA, horaFin: HORA_FIN_DIA,
    duracion: DURACION_RESERVA_HORAS, zonaHoraria: ZONA_HORARIA, log,
  });
  const mp    = crearMPService({ accessToken: MP_ACCESS_TOKEN, precioTurno: PRECIO_TURNO, duracion: DURACION_RESERVA_HORAS, negocio: NEGOCIO, ngrokDomain: NGROK_DOMAIN, log });
  const groqSvc = crearGroqService({ apiKey: GROQ_API_KEY, modelo: MODELO, log });

  // ── Estado compartido ─────────────────────────────────────────
  const cacheTemporal        = db.cargar(CACHE_PATH);
  const reservasPendientes   = db.cargar(RESERVAS_PATH);
  const recordatoriosActivos = db.cargar(RECORDATORIOS_PATH);
  const slotsEnProceso       = new Set();
  const timeoutsRecs         = {};
  let   client               = null;
  let   expressServer        = null;

  // Servicio de audio necesita enviarMensaje, se inyecta después
  let audioSvc = null;

  // ── Helpers ───────────────────────────────────────────────────
  function quitarEmojis(t) { return t.replace(/\p{Emoji}/gu, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim(); }
  function esNombreValido(t) {
    const l = quitarEmojis(t);
    return l.length >= 2 && !/^\d+$/.test(l) && !['hola', 'si', 'no', 'ok', 'bien', 'dale', 'buenas', 'hey', 'test'].includes(l.toLowerCase()) && /\p{L}/u.test(l);
  }
  function esEmailValido(t)  { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim()); }
  function capitalizar(t)    { return t.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' '); }
  function extraerNumero(id) { return id.replace(/[^0-9]/g, ''); }

  function limpiarRespuesta(texto) {
    if (!texto) return 'Disculpá, hubo un problema. ¿Me repetís la consulta?';
    return texto
      .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\{[\s\S]*?"fecha"[\s\S]*?\}/g, '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$2')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/https?:\/\/(?!www\.mercadopago\.com\.ar|checkout\.mercadopago\.com\.ar|calendar\.google\.com)[^\s)>\],"]+/gi, '')
      .replace(/[ \t]+\n/g, '\n').trim();
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

  // ── enviarMensaje con reintentos ──────────────────────────────
  async function enviarMensaje(chatIdDestino, texto, opciones = {}) {
    const intentos = [
      chatIdDestino,
      chatIdDestino.includes('@c.us') ? chatIdDestino : extraerNumero(chatIdDestino) + '@c.us',
    ];
    for (const destino of intentos) {
      try {
        await client.sendMessage(destino, texto, opciones);
        log(`✅ Enviado a ${destino}: "${String(texto).slice(0, 50)}..."`);
        return true;
      } catch (e) {
        log(`⚠️ Fallo enviando a ${destino}: ${e.message}`);
      }
    }
    log(`❌ No se pudo enviar mensaje a ${chatIdDestino}`);
    return false;
  }

  // ── Recordatorios ─────────────────────────────────────────────
  const RECS = [
    { min: 24 * 60, label: '24h',   msg: (n, h) => `¡Hola ${n}! 👋 Recordatorio: *mañana* a las *${h}* con ${NEGOCIO}. ¡Te esperamos!` },
    { min: 4  * 60, label: '4h',    msg: (n, h) => `¡Hola ${n}! ⏰ En unas horas tu turno a las *${h}*. Avisanos si no podés. 🙏` },
    { min: 30,      label: '30min', msg: (n, h) => `¡${n}! 🚗 En 30 minutos tu turno a las *${h}*. ¡Nos vemos!` },
  ];

  function programarRecs(chatId, nombre, fecha, hora) {
    const [y, m, d] = fecha.split('-').map(Number);
    const [h, min]  = hora.split(':').map(Number);
    const ft        = calendar.crearFecha(y, m, d, h, min);
    const ahora     = Date.now();
    const key       = `${chatId}|${fecha}|${hora}`;
    recordatoriosActivos[key] = { chatId, nombre, fecha, hora };
    db.guardar(RECORDATORIOS_PATH, recordatoriosActivos);
    for (const r of RECS) {
      const delay = ft.getTime() - r.min * 60000 - ahora;
      if (delay <= 0) continue;
      const tk = `${key}|${r.label}`;
      if (timeoutsRecs[tk]) clearTimeout(timeoutsRecs[tk]);
      timeoutsRecs[tk] = setTimeout(async () => {
        try { await enviarMensaje(chatId, r.msg(nombre, hora)); log(`[REC] ✅ ${r.label} → ${nombre}`); }
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
  }

  // ── Reservas ──────────────────────────────────────────────────
  function pendienteActual(chatId) {
    const ahora = Date.now();
    for (const [, r] of Object.entries(reservasPendientes)) if (r.chatId === chatId && r.expiresAt > ahora) return r;
    return null;
  }
  function limpiarExpiradas() {
    let cambio = false;
    for (const k of Object.keys(reservasPendientes)) if (reservasPendientes[k].expiresAt <= Date.now()) { delete reservasPendientes[k]; cambio = true; }
    if (cambio) db.guardar(RESERVAS_PATH, reservasPendientes);
  }
  setInterval(limpiarExpiradas, 5 * 60000);

  // ── Procesamiento IA ──────────────────────────────────────────
  async function procesarConIA(chatId, usuario) {
    limpiarExpiradas();
    const pend  = pendienteActual(chatId);
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
    const fStr  = ahora.toLocaleString('es-AR', { timeZone: ZONA_HORARIA, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fISO  = ahora.toISOString().slice(0, 10);
    const dias  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const prox  = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ahora); d.setDate(ahora.getDate() + i + 1);
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
      return `${dias[d.getDay()]} = ${y}-${m}-${dd}`;
    }).join(', ');

    const sys = { role: 'system', content:
      `Sos Akira, asistente de ${MI_NOMBRE} (${NEGOCIO}). Hablás con ${usuario.nombre}. Tono cálido, humano, WhatsApp. ` +
      `Hoy: ${fStr} | ISO: ${fISO}\nPróx días: ${prox}\n` +
      `Negocio: ${SERVICIOS} | Precio: $${PRECIO_TURNO} ARS/h | Cancelar/reagendar: mín ${HORAS_MINIMAS_CANCELACION}h.\n` +
      (pend ? `🚨 PAGO PENDIENTE: ${pend.fecha} ${pend.hora} ($${pend.totalPrecio || PRECIO_TURNO}). NO agendar otro.\n` : '') +
      (usuario.turnosConfirmados?.length ? `[INT] Turnos pagados: ${usuario.turnosConfirmados.map(t => `${t.fecha} ${t.hora}`).join(', ')} — nunca preguntar si pagó.\n` : '') +
      `FLUJO: 1.Consultar disponibilidad → 2.Cliente elige → 3.Confirmar → 4.Llamar agendar_turno. NUNCA saltear pasos.\n` +
      `Max 4 líneas. Sin JSON/código. Cancelar→cancelar_turno, Cambiar→reagendar_turno.\n` +
      (PROMPT_EXTRA ? `INSTRUCCIONES EXTRA: ${PROMPT_EXTRA}\n` : '')
    };

    let resp = await groqSvc.llamarGroq([sys, ...usuario.historial]);
    let msg  = resp.choices[0].message;

    if (msg.tool_calls?.length > 0) {
      usuario.historial.push({ role: msg.role, content: msg.content, tool_calls: msg.tool_calls });
      for (const t of msg.tool_calls) {
        const args = JSON.parse(t.function.arguments);
        log(`🔧 Tool: ${t.function.name}`);
        await ejecutarTool(t, args, chatId, usuario);
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

  // ── Ejecutor de tools ─────────────────────────────────────────
  async function ejecutarTool(tool, args, chatId, usuario) {
    const push = c => usuario.historial.push({ role: 'tool', tool_call_id: tool.id, name: tool.function.name, content: c });

    if (tool.function.name === 'consultar_disponibilidad') {
      const libres = await calendar.horariosLibres(args.fecha);
      const res    = libres.length > 0 ? `Horarios libres para ${args.fecha}: ${libres.join(', ')}` : `No hay horarios disponibles para el ${args.fecha}.`;
      if (!cacheTemporal[chatId]) cacheTemporal[chatId] = {};
      cacheTemporal[chatId].ultimaConsulta = { fecha: args.fecha, libres, ts: Date.now() };
      db.guardar(CACHE_PATH, cacheTemporal);
      push(res); return;
    }

    if (tool.function.name === 'agendar_turno') {
      const msgs  = usuario.historial.filter(m => m.role === 'user').map(m => (m.content || '').toLowerCase());
      const ultimo = msgs[msgs.length - 1] || '';
      const confirma = ['si', 'sí', 'dale', 'bueno', 'ok', 'reservame', 'reservá', 'agendame', 'quiero', 'perfecto', 'listo', 'va', 'confirmo', 'poneme', 'anotame'].some(p => ultimo.includes(p));
      const presel  = cacheTemporal[chatId]?.preseleccionado;
      const porCache = presel && presel.fecha === args.fecha && presel.hora === args.hora;
      if (!confirma && !porCache) { push(`El cliente no confirmó aún. Preguntale si quiere el turno del ${args.fecha} a las ${args.hora}.`); return; }
      if (cacheTemporal[chatId]?.preseleccionado) { delete cacheTemporal[chatId].preseleccionado; db.guardar(CACHE_PATH, cacheTemporal); }
      limpiarExpiradas();
      const pend = pendienteActual(chatId);
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
        const ini       = calendar.crearFecha(y, m, d, hI);
        const fin       = calendar.crearFecha(y, m, d, hFn);
        const conflictos = await calendar.obtenerEventos(CALENDAR_ID, ini, fin);
        if (conflictos.length > 0) { push(`El horario ${args.hora}–${hFn}:00 ya está ocupado.`); return; }
        if (!usuario.email) {
          cacheTemporal[chatId] = { esperandoEmail: true, reservaPendiente: { fecha: args.fecha, hora: args.hora, horaFin: hF } };
          db.guardar(CACHE_PATH, cacheTemporal);
          push('Para reservar necesitamos el email del cliente. Pedíselo.'); return;
        }
        const pref = await mp.crearPago(chatId, usuario.nombre, args.fecha, args.hora, hF);
        const rk   = `${chatId}|${args.fecha}|${args.hora}|${hF || args.hora}`;
        reservasPendientes[rk] = { chatId, fecha: args.fecha, hora: args.hora, horaFin: hF, nombre: usuario.nombre, email: usuario.email, cant, total, expiresAt: Date.now() + 30 * 60000 };
        db.guardar(RESERVAS_PATH, reservasPendientes);
        push(`Link generado. Reserva: ${args.fecha} ${args.hora}–${hFn}:00 $${total} ARS. Link: ${pref.init_point}. Solo se agenda si paga. Vence en 30 min.`);
      } catch (e) { log('[MP] ' + e.message); push(`Error generando link: ${e.message}.`); }
      finally { slotsEnProceso.delete(sk); }
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
      db.guardarMemoria(chatId, usuario);
      push(`Turno ${args.fecha} ${args.hora} cancelado.`); return;
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
      const nuevo = await calendar.crearEvento(CALENDAR_ID, `Turno — ${usuario.nombre}`, `WhatsApp: +${usuario.numeroReal || extraerNumero(chatId)} | Reagendado desde ${args.fecha_actual} ${args.hora_actual}`, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(chatId));
      if (!nuevo) { push('Error creando nuevo evento.'); return; }
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).map(tc => tc.fecha === args.fecha_actual && tc.hora === args.hora_actual ? { ...tc, fecha: args.fecha_nueva, hora: args.hora_nueva, horaFin: hfnStr } : tc);
      db.guardarMemoria(chatId, usuario);
      programarRecs(chatId, usuario.nombre, args.fecha_nueva, args.hora_nueva);
      push(`Reagendado: ${args.fecha_nueva} ${args.hora_nueva}–${hfnStr}. Sin costo extra.`);
    }
  }

  // ── Generar pago post-email ───────────────────────────────────
  async function generarPago(chatId, usuario, fecha, hora, horaFin = null) {
    try {
      limpiarExpiradas();
      const pend = pendienteActual(chatId);
      if (pend) { await enviarMensaje(chatId, `Ojo, ${usuario.nombre}! Ya tenés un turno pendiente para el *${pend.fecha}* a las *${pend.hora}*. Pagá ese primero. 💳`); return; }
      const hI   = parseInt(hora.split(':')[0]);
      const hF   = horaFin ? parseInt(horaFin.split(':')[0]) : hI + 1;
      const cant  = Math.max(1, hF - hI);
      const total = PRECIO_TURNO * cant;
      const pref  = await mp.crearPago(chatId, usuario.nombre, fecha, hora, horaFin);
      const rk    = `${chatId}|${fecha}|${hora}|${horaFin || hora}`;
      reservasPendientes[rk] = { chatId, fecha, hora, horaFin, nombre: usuario.nombre, email: usuario.email, cant, total, expiresAt: Date.now() + 30 * 60000 };
      db.guardar(RESERVAS_PATH, reservasPendientes);
      const r = horaFin ? `de *${hora}* a *${horaFin}*` : `a las *${hora}*`;
      await enviarMensaje(chatId, `¡Perfecto! 🎉 Para confirmar tu turno del *${fecha}* ${r}:\n\n💳 *Pagá aquí:*\n${pref.init_point}\n\n💰 *$${total} ARS*${cant > 1 ? ` (${cant} × $${PRECIO_TURNO})` : ''}\n⏳ Vence en 30 min. ✅`);
    } catch (e) { log('[MP] Error pago: ' + e.message); await enviarMensaje(chatId, '¡Ups! Error generando el link de pago. Intentá en unos minutos. 🙏'); }
  }

  // ── Handler de mensajes ───────────────────────────────────────
  async function handleMessage(msg) {
    if (msg.isGroup || msg.from.includes('broadcast')) return;
    const esAudio = msg.type === 'ptt' || msg.type === 'audio';
    if (!esAudio && (!msg.body || !msg.body.trim())) return;

    const chatId   = msg.from;
    let texto      = msg.body || '';
    let fueAudio   = false;

    if (esAudio) {
      const tr = await audioSvc.transcribirAudio(msg);
      if (!tr) { await enviarMensaje(chatId, '¡Ups! No pude entender el audio. ¿Me lo escribís? 🙏'); return; }
      texto = tr; fueAudio = true;
    }

    const bodyLower = texto.toLowerCase().trim();
    log(`${fueAudio ? '🎤' : '📩'} [${chatId}]: ${texto.slice(0, 80)}`);

    if (msg.fromMe) {
      if (bodyLower.startsWith('akira ')) await manejarComando(bodyLower, chatId, db.cargarMemoria(chatId));
      return;
    }

    let usuario = db.cargarMemoria(chatId);
    if (usuario?.silenciado && !bodyLower.includes('akira')) return;

    try {
      const chat    = await msg.getChat();
      const contact = await msg.getContact();
      const tel     = contact.number || extraerNumero(chatId);

      if (!usuario) { const r = await registrarNombre(chatId, texto, tel); if (r) return; }
      if (cacheTemporal[chatId]?.esperandoEmail) { await capturaEmail(chatId, texto, db.cargarMemoria(chatId)); return; }

      if (quiereConDueno(bodyLower)) {
        const u = db.cargarMemoria(chatId);
        if (u) { u.silenciado = true; db.guardarMemoria(chatId, u); }
        await enviarMensaje(chatId, `¡Dale, ${u?.nombre || ''}! Le aviso a ${MI_NOMBRE} para que te contacte. 🙌`);
        return;
      }

      if (cacheTemporal[chatId]?.ultimaConsulta) {
        const uc = cacheTemporal[chatId].ultimaConsulta;
        if ((Date.now() - uc.ts) / 60000 < 30) {
          const hm = (uc.libres || []).filter(s => {
            const n = s.split(':')[0];
            return bodyLower.includes(`${n}:00`) || bodyLower.includes(`las ${n}`) || bodyLower.includes(`a las ${n}`) || bodyLower.includes(`${n} hs`);
          });
          if (hm.length === 1) { if (!cacheTemporal[chatId]) cacheTemporal[chatId] = {}; cacheTemporal[chatId].preseleccionado = { fecha: uc.fecha, hora: hm[0].split(' ')[0] }; db.guardar(CACHE_PATH, cacheTemporal); }
        }
      }

      await chat.sendStateTyping().catch(() => {});
      const u = db.cargarMemoria(chatId);
      u.historial.push({ role: 'user', content: fueAudio ? `[voz] ${texto}` : texto });
      u.historial = recortarHistorial(u.historial, 20);

      const respuesta = await procesarConIA(chatId, u, chat);
      u.historial.push({ role: 'assistant', content: respuesta });
      db.guardarMemoria(chatId, u);

      log(`🤖 AKIRA → ${chatId}: "${respuesta.slice(0, 60)}..."`);

      const audio = fueAudio && audioSvc.debeResponderEnAudio(respuesta);
      if (audio) {
        const ok = await audioSvc.enviarComoAudio(chatId, respuesta, enviarMensaje);
        if (!ok) await enviarMensaje(chatId, respuesta);
      } else {
        await enviarMensaje(chatId, respuesta);
      }

      await chat.clearState().catch(() => {});
    } catch (err) {
      log('❌ handleMessage error: ' + err.message);
      try { await enviarMensaje(chatId, '¡Ups! Tuve un problema. ¿Me repetís la consulta? 🙏'); } catch {}
    }
  }

  // ── Comandos maestros ─────────────────────────────────────────
  async function manejarComando(bodyLower, chatId, usuario) {
    if (bodyLower.includes('akira stop'))       { if (usuario) { usuario.silenciado = true;  db.guardarMemoria(chatId, usuario); } await enviarMensaje(chatId, '*(Akira apagada)*');    return; }
    if (bodyLower.includes('akira reactivate')) { if (usuario) { usuario.silenciado = false; db.guardarMemoria(chatId, usuario); } await enviarMensaje(chatId, '*(Akira reactivada)*'); return; }
    if (bodyLower.includes('akira status')) {
      const arch  = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
      const lineas = arch.map(f => {
        try { const d = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); return `${d.nombre || '?'}: ${d.silenciado ? 'SILENCIADO' : 'activo'}`; }
        catch { return f + ': error'; }
      });
      await enviarMensaje(chatId, `*Usuarios (${arch.length}):*\n${lineas.join('\n')}`);
    }
  }

  // ── Registro nombre ───────────────────────────────────────────
  async function registrarNombre(chatId, texto, tel) {
    if (!cacheTemporal[chatId]) {
      cacheTemporal[chatId] = { esperandoNombre: true };
      db.guardar(CACHE_PATH, cacheTemporal);
      await enviarMensaje(chatId, `¡Hola! ✨ Soy Akira, asistente de *${MI_NOMBRE}* — ${NEGOCIO}.\n\n¿Cuál es tu nombre? 😊`);
      return true;
    }
    if (cacheTemporal[chatId]?.esperandoNombre) {
      if (!esNombreValido(texto.trim())) { await enviarMensaje(chatId, '¿Me decís tu nombre real? (solo letras) 😊'); return true; }
      const nombre = capitalizar(quitarEmojis(texto.trim()));
      const u = { nombre, telefono: chatId, numeroReal: tel, email: null, historial: [{ role: 'assistant', content: '¡Hola! ¿Cómo es tu nombre?' }, { role: 'user', content: nombre }], silenciado: false };
      delete cacheTemporal[chatId]; db.guardar(CACHE_PATH, cacheTemporal); db.guardarMemoria(chatId, u);
      const s = `¡Genial, ${nombre}! Un gusto. 🤝\n\n¿En qué te puedo ayudar hoy?`;
      u.historial.push({ role: 'assistant', content: s }); db.guardarMemoria(chatId, u);
      await enviarMensaje(chatId, s); return true;
    }
    return false;
  }

  async function capturaEmail(chatId, texto, usuario) {
    if (!esEmailValido(texto.trim())) { await enviarMensaje(chatId, '¡Ese email no parece válido! ¿Lo escribís de nuevo? (ej: nombre@gmail.com)'); return; }
    usuario.email = texto.trim().toLowerCase(); db.guardarMemoria(chatId, usuario);
    const { fecha, hora, horaFin } = cacheTemporal[chatId].reservaPendiente;
    delete cacheTemporal[chatId]; db.guardar(CACHE_PATH, cacheTemporal);
    await generarPago(chatId, usuario, fecha, hora, horaFin || null);
  }

  function quiereConDueno(t) {
    return [`hablar con ${MI_NOMBRE.toLowerCase()}`, 'pasame con', 'quiero hablar con', 'necesito hablar con'].some(f => t.includes(f));
  }

  // ── Webhook bot MP ────────────────────────────────────────────
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
        const um  = db.cargarMemoria(res2.chatId);
        const tel = um?.numeroReal || extraerNumero(res2.chatId);
        const ev  = await calendar.crearEvento(CALENDAR_ID, `Turno — ${res2.nombre}`, `WhatsApp: +${tel} | Pago MP ID: ${pago.id} | $${res2.total || PRECIO_TURNO}`, ini, fin, res2.email || null, tel);
        delete reservasPendientes[rk]; db.guardar(RESERVAS_PATH, reservasPendientes);
        if (ev) {
          if (um) {
            if (!um.turnosConfirmados) um.turnosConfirmados = [];
            um.turnosConfirmados.push({ fecha: res2.fecha, hora: res2.hora, horaFin: res2.horaFin || null, pagoId: pago.id, confirmadoEn: new Date().toISOString() });
            um.historial.push({ role: 'assistant', content: `[SISTEMA] Pago MP confirmado (ID:${pago.id}). Turno ${res2.fecha} ${res2.hora}. YA PAGÓ.` });
            db.guardarMemoria(res2.chatId, um);
          }
          programarRecs(res2.chatId, res2.nombre, res2.fecha, res2.hora);
          await enviarMensaje(res2.chatId, `¡Listo, ${res2.nombre}! 🎉\n✅ *Pago: $${res2.total || PRECIO_TURNO} ARS*\n📅 *Turno:* ${res2.fecha} de *${res2.hora}${res2.horaFin ? '–' + res2.horaFin : ''}*\n${ev.htmlLink ? `📆 ${ev.htmlLink}\n` : ''}\n⏰ Te recordamos 24hs, 4hs y 30min antes. ¡Te esperamos! 🙌`);
        } else {
          await enviarMensaje(res2.chatId, `Hola ${res2.nombre}! Pago recibido ✅ pero error en el calendario. ${MI_NOMBRE} confirma manualmente. 🙏`);
        }
      } catch (e) { log('[Webhook] ' + e.message); }
    });
    app.get('/health', (_, r) => r.json({ ok: true, bot: MI_NOMBRE }));
    expressServer = app.listen(PUERTO, () => log(`🚀 Webhook bot en puerto ${PUERTO}`));
    expressServer.on('error', (e) => log(`⚠️ Puerto ${PUERTO} en uso: ${e.message}`));
  }

  // ── Ngrok ─────────────────────────────────────────────────────
  async function iniciarNgrok() {
    if (!NGROK_AUTH_TOKEN) return;
    try {
      const ng = require('@ngrok/ngrok');
      const l  = await ng.forward({ addr: PUERTO, authtoken: NGROK_AUTH_TOKEN, domain: NGROK_DOMAIN || undefined });
      log(`✅ Ngrok: ${l.url()}/webhook-bot`);
    } catch (e) { log('❌ Ngrok: ' + e.message); }
  }

  // ── Inicialización WhatsApp ───────────────────────────────────
  async function iniciar() {
    // Inicializar audioSvc aquí para que tenga acceso a enviarMensaje
    audioSvc = crearAudioService({ groqApiKey: GROQ_API_KEY, rimeApiKey: RIME_API_KEY, dataDir, log });

    iniciarServidor();
    if (NGROK_AUTH_TOKEN) await iniciarNgrok();

    const userId    = path.basename(sessionDir);
    const waAuthPath = path.join(sessionDir, 'wa_auth');
    if (!fs.existsSync(waAuthPath)) fs.mkdirSync(waAuthPath, { recursive: true });

    const getChromiumExec = () => {
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
          log(`[Chromium] Usando PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
          return process.env.PUPPETEER_EXECUTABLE_PATH;
        }
        log(`[Chromium] ⚠️ PUPPETEER_EXECUTABLE_PATH no existe: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      }
      try {
        const pup  = require('puppeteer');
        const exec = typeof pup.executablePath === 'function' ? pup.executablePath() : null;
        if (exec) { log(`[Chromium] Usando puppeteer bundled: ${exec}`); return exec; }
      } catch (e) { log(`[Chromium] puppeteer bundled no disponible: ${e.message}`); }
      for (const r of ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome']) {
        if (fs.existsSync(r)) { log(`[Chromium] Usando sistema: ${r}`); return r; }
      }
      log('[Chromium] ⚠️ No encontrado — Puppeteer usará el suyo propio');
      return undefined;
    };
    const chromiumExec = getChromiumExec();
    log(`[Bot] Iniciando con Chromium: ${chromiumExec || '(auto)'}`);

    // ── Limpiar locks de Chrome de sesiones anteriores ────────
    // Cuando Chrome crashea o el proceso se reinicia bruscamente, deja archivos
    // de lock que impiden reutilizar el mismo perfil (error "userDataDir already in use").
    const profileDir = path.join(waAuthPath, `akira_${userId}`);
    const chromeLocks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const lockFile of chromeLocks) {
      const lockPath = path.join(profileDir, lockFile);
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); log(`[Bot] Lock eliminado: ${lockFile}`); }
        catch (e) { log(`[Bot] No se pudo eliminar lock ${lockFile}: ${e.message}`); }
      }
    }

    client = new Client({
      authStrategy: new LocalAuth({ clientId: `akira_${userId}`, dataPath: waAuthPath }),
      puppeteer: {
        headless: true,
        executablePath: chromiumExec,
        timeout: 120000,
        protocolTimeout: 120000,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas', '--disable-gpu', '--no-first-run', '--no-zygote',
          '--single-process', '--disable-extensions', '--disable-background-networking',
          '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
          '--disable-breakpad', '--disable-client-side-phishing-detection', '--disable-component-update',
          '--disable-default-apps', '--disable-domain-reliability', '--disable-features=AudioServiceOutOfProcess',
          '--disable-hang-monitor', '--disable-ipc-flooding-protection', '--disable-popup-blocking',
          '--disable-prompt-on-repost', '--disable-renderer-backgrounding', '--disable-sync',
          '--force-color-profile=srgb', '--metrics-recording-only', '--no-default-browser-check',
          '--safebrowsing-disable-auto-update', '--password-store=basic', '--use-mock-keychain',
          '--mute-audio', '--window-size=1280,720',
        ],
      },
    });

    client.on('qr',           (qr) => { log('📱 QR generado — escaneá con WhatsApp'); emitter.emit('qr', qr); });
    client.on('ready',        ()   => { log('✅ WhatsApp conectado y listo'); emitter.emit('ready'); reprogramarRecs(); });
    client.on('message',      async msg => { try { await handleMessage(msg); } catch (e) { log('❌ Error handleMessage: ' + e.message); } });
    client.on('disconnected', r   => { log('⚠️ Desconectado: ' + r); emitter.emit('disconnected', r); });
    client.on('auth_failure', m   => { log('❌ Auth failure: ' + m); emitter.emit('error', new Error('Auth failure: ' + m)); });
    client.on('loading_screen', (pct, msg) => { log(`⏳ Cargando WhatsApp: ${pct}% — ${msg}`); });

    log('🔄 Iniciando cliente WhatsApp...');
    try {
      await client.initialize();
    } catch (e) {
      // "Target closed" y "userDataDir already in use" son errores de Chrome lock.
      // El bot ya limpió los locks, pero si igual falla, reportarlo claramente.
      if (e.message?.includes('Target closed') || e.message?.includes('userDataDir')) {
        log('❌ Chrome no pudo iniciar — si el error persiste, detené el bot, esperá 10 segundos e inicialo de nuevo.');
      }
      throw e;
    }
  }

  async function detener() {
    for (const k of Object.keys(timeoutsRecs)) clearTimeout(timeoutsRecs[k]);
    if (client)        { try { await client.destroy(); } catch (e) { log('destroy: ' + e.message); } client = null; }
    if (expressServer) { try { expressServer.close(); } catch {} expressServer = null; }
    log('🛑 Bot detenido.');
    emitter.emit('stopped');
  }

  emitter.iniciar = iniciar;
  emitter.detener = detener;
  return emitter;
}

module.exports = crearAkiraBot;
