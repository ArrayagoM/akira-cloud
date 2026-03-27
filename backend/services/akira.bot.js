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
const crearAudioService         = require('./bot/audio.service');
const crearGroqService          = require('./bot/groq.service');

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
  const CALENDAR_ID               = config.CALENDAR_ID || '';
  const PROMPT_EXTRA              = config.PROMPT_PERSONALIZADO || '';
  const ALIAS_TRANSFERENCIA       = config.ALIAS_TRANSFERENCIA || '';
  const CBU_TRANSFERENCIA         = config.CBU_TRANSFERENCIA   || '';
  const BANCO_TRANSFERENCIA       = config.BANCO_TRANSFERENCIA || '';
  const SERVICIOS_LIST            = (() => { try { return JSON.parse(config.SERVICIOS_LIST || '[]'); } catch { return []; } })();
  const DURACION_RESERVA_HORAS    = 1;
  const HORA_INICIO_DIA           = 9;
  const HORA_FIN_DIA              = 18;
  const ZONA_HORARIA              = 'America/Argentina/Buenos_Aires';
  const HORARIOS_ATENCION         = (() => { try { return JSON.parse(config.HORARIOS_ATENCION || '{}'); } catch { return {}; } })();
  const DIAS_BLOQUEADOS           = (() => { try { return JSON.parse(config.DIAS_BLOQUEADOS || '[]'); } catch { return []; } })();
  const MODO_PAUSA                = config.MODO_PAUSA === 'true';
  const CELULAR_NOTIFICACIONES    = config.CELULAR_NOTIFICACIONES || '';
  const GOOGLE_CALENDAR_TOKENS    = (() => { try { return JSON.parse(config.GOOGLE_CALENDAR_TOKENS || ''); } catch { return null; } })();
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

  function log(msg) { emitter.emit('log', msg); }

  // ── Servicios ───────────────────────────────────────────────
  // userId del dueño del bot — preferir el parámetro explícito; fallback al path
  const USER_ID  = userId ? String(userId) : path.basename(sessionDir);
  const db       = crearPersistencia(dataDir, log);
  // Memoria de clientes en MongoDB (reemplaza db.cargarMemoria/guardarMemoria)
  const clientesSvc = crearMongoClientesService(USER_ID, log);
  const calendar = crearCalendarService({
    calendarId: CALENDAR_ID,
    credentialsPath: CREDENTIALS_PATH,
    oauthTokens: GOOGLE_CALENDAR_TOKENS,   // prioridad sobre service account
    horaInicio: HORA_INICIO_DIA, horaFin: HORA_FIN_DIA,
    duracion: DURACION_RESERVA_HORAS, zonaHoraria: ZONA_HORARIA,
    horarios: HORARIOS_ATENCION, diasBloqueados: DIAS_BLOQUEADOS, log,
  });
  const mp      = crearMPService({ accessToken: MP_ACCESS_TOKEN, precioTurno: PRECIO_TURNO, duracion: DURACION_RESERVA_HORAS, negocio: NEGOCIO, ngrokDomain: NGROK_DOMAIN, log });
  const groqSvc = crearGroqService({ apiKey: GROQ_API_KEY, modelo: MODELO, log });

  // ── Estado ──────────────────────────────────────────────────
  const cacheTemporal        = db.cargar(CACHE_PATH);
  const reservasPendientes   = db.cargar(RESERVAS_PATH);
  const recordatoriosActivos = db.cargar(RECORDATORIOS_PATH);
  const slotsEnProceso       = new Set();
  const timeoutsRecs         = {};
  let   sock                 = null;
  let   expressServer        = null;
  let   reconectando         = false;
  let   audioSvc             = null;

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
    { min: 24 * 60, label: '24h',   msg: (n, h) => `¡Hola ${n}! 👋 Recordatorio: *mañana* a las *${h}* con ${NEGOCIO}. ¡Te esperamos!` },
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
        try { await enviarMensaje(jid, r.msg(nombre, hora)); log(`[REC] ✅ ${r.label} → ${nombre}`); }
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
          return h.activo ? `${DIAS_LABELS[d]} ${h.inicio}–${h.fin}` : `${DIAS_LABELS[d]} Cerrado`;
        }).filter(Boolean).join(' | ')
      : `Lun–Vie 09:00–18:00 | Sáb 09:00–13:00 | Dom Cerrado`;

    const sys = { role: 'system', content:
      `Sos Akira, asistente de ${MI_NOMBRE} (${NEGOCIO}). Hablás con ${usuario.nombre}. Tono cálido, humano, WhatsApp. ` +
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
      (PROMPT_EXTRA ? `INSTRUCCIONES EXTRA: ${PROMPT_EXTRA}\n` : '')
    };

    let resp = await groqSvc.llamarGroq([sys, ...usuario.historial]);
    let msg  = resp.choices[0].message;

    if (msg.tool_calls?.length > 0) {
      usuario.historial.push({ role: msg.role, content: msg.content, tool_calls: msg.tool_calls });
      for (const t of msg.tool_calls) {
        const args = JSON.parse(t.function.arguments);
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
      const libres = await calendar.horariosLibres(args.fecha);
      const res    = libres.length > 0 ? `Horarios libres para ${args.fecha}: ${libres.join(', ')}` : `No hay horarios disponibles para el ${args.fecha}.`;
      if (!cacheTemporal[jid]) cacheTemporal[jid] = {};
      cacheTemporal[jid].ultimaConsulta = { fecha: args.fecha, libres, ts: Date.now() };
      db.guardar(CACHE_PATH, cacheTemporal);
      push(res); return;
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
          await calendar.crearEvento(CALENDAR_ID, `Turno — ${usuario.nombre}`, desc, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(jid));
          usuario.turnosConfirmados = [...(usuario.turnosConfirmados || []), { fecha: args.fecha, hora: args.hora, horaFin: `${hFn}:00` }];
          clientesSvc.guardarMemoria(jid, usuario);
          programarRecs(jid, usuario.nombre, args.fecha, args.hora);

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
      } catch (e) { log('[Pago] ' + e.message); push(`Error al procesar la reserva: ${e.message}.`); }
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
      clientesSvc.guardarMemoria(jid, usuario);
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
      const nuevo = await calendar.crearEvento(CALENDAR_ID, `Turno — ${usuario.nombre}`, `WhatsApp: +${usuario.numeroReal || extraerNumero(jid)} | Reagendado desde ${args.fecha_actual} ${args.hora_actual}`, ini, fin, usuario.email, usuario.numeroReal || extraerNumero(jid));
      if (!nuevo) { push('Error creando nuevo evento.'); return; }
      usuario.turnosConfirmados = (usuario.turnosConfirmados || []).map(tc => tc.fecha === args.fecha_actual && tc.hora === args.hora_actual ? { ...tc, fecha: args.fecha_nueva, hora: args.hora_nueva, horaFin: hfnStr } : tc);
      clientesSvc.guardarMemoria(jid, usuario);
      programarRecs(jid, usuario.nombre, args.fecha_nueva, args.hora_nueva);
      push(`Reagendado: ${args.fecha_nueva} ${args.hora_nueva}–${hfnStr}. Sin costo extra.`);
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
  }

  // ── Handler principal de mensajes ────────────────────────────
  async function handleBaileysMessage(msg) {
    if (!msg.message) return;
    const jid = msg.key.remoteJid;
    if (!jid) return;
    if (isJidGroup(jid)) return;
    if (jid === 'status@broadcast') return;

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
      await enviarMensaje(jid, '¡Ups! Tuve un problema. ¿Me repetís la consulta? 🙏').catch(() => {});
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
          programarRecs(res2.chatId, res2.nombre, res2.fecha, res2.hora);
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
        log(`⚠️ Desconectado (código: ${code})${loggedOut ? ' — sesión cerrada' : replaced ? ' — reemplazado' : ''}`);
        emitter.emit('disconnected', `código: ${code}`);

        if (loggedOut) {
          // Limpiar sesión de MongoDB para que el próximo inicio pida QR nuevo
          await clearAuth().catch(() => {});
          log('🗑️ Sesión eliminada de MongoDB — próximo inicio pedirá QR');
        } else if (replaced) {
          // 440: sesión rechazada por WhatsApp (credenciales corruptas o duplicadas).
          // Limpiar la sesión de MongoDB para que el próximo inicio genere un QR nuevo.
          await clearAuth().catch(() => {});
          log('🔄 Sesión inválida (440) — sesión limpiada. Detené y volvé a iniciar el bot para escanear el QR.');
        } else if (!reconectando && sock !== null) {
          reconectando = true;
          log('🔄 Reconectando en 5s...');
          setTimeout(async () => { reconectando = false; if (sock !== null) await conectar(); }, 5000);
        }
      }
      if (connection === 'open') {
        log('✅ WhatsApp conectado y listo');
        emitter.emit('ready');
        reprogramarRecs();
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try { await handleBaileysMessage(msg); }
        catch (e) { log('❌ Error handleMessage: ' + e.message); }
      }
    });
  }

  // ── Ciclo de vida ────────────────────────────────────────────
  async function iniciar() {
    // Cargar clientes existentes desde MongoDB (antes de procesar mensajes)
    await clientesSvc.inicializar();
    audioSvc = crearAudioService({ groqApiKey: GROQ_API_KEY, rimeApiKey: RIME_API_KEY, dataDir, log });
    iniciarServidor();
    if (NGROK_AUTH_TOKEN) await iniciarNgrok();
    log('🔄 Iniciando conexión WhatsApp (Baileys — sin Chrome)...');
    await conectar();
  }

  async function detener() {
    const sockRef = sock;
    sock = null; // null primero para cortar reconexión automática
    reconectando = false;
    for (const k of Object.keys(timeoutsRecs)) clearTimeout(timeoutsRecs[k]);
    if (sockRef) { try { sockRef.end(); } catch (e) { log('sock.end: ' + e.message); } }
    if (expressServer) { try { expressServer.close(); } catch {} expressServer = null; }
    log('🛑 Bot detenido.');
    emitter.emit('stopped');
  }

  emitter.iniciar = iniciar;
  emitter.detener = detener;
  return emitter;
}

module.exports = crearAkiraBot;
