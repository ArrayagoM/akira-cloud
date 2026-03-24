// services/akira.bot.js — Akira Bot v3.0 Cloud Edition
// FIXES: envío de mensajes, sesiones aisladas, puertos únicos
'use strict';

const { EventEmitter }                = require('events');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const Groq    = require('groq-sdk');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { google } = require('googleapis');
const express = require('express');
const https   = require('https');
const http    = require('http');
const Log     = require('../models/Log');

function crearAkiraBot(config, dataDir, sessionDir) {
  const emitter = new EventEmitter();

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

  const CACHE_PATH               = path.join(dataDir, '_cache.json');
  const RESERVAS_PATH            = path.join(dataDir, '_reservas.json');
  const RECORDATORIOS_PATH       = path.join(dataDir, '_recordatorios.json');
  const CREDENTIALS_PATH         = path.join(dataDir, 'credentials.json');

  const groq                  = new Groq({ apiKey: GROQ_API_KEY });
  const cacheTemporal         = cargar(CACHE_PATH);
  const reservasPendientes    = cargar(RESERVAS_PATH);
  const recordatoriosActivos  = cargar(RECORDATORIOS_PATH);
  const slotsEnProceso        = new Set();
  const timeoutsRecs          = {};
  let   groqBloqueadoHasta    = 0;
  let   client                = null;
  let   expressServer         = null;

  // ── Google Calendar ─────────────────────────────────────────
  let calendarAuth = null;
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try {
      calendarAuth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
      log('✅ Google Calendar configurado');
    } catch (e) { log('⚠️ Calendar: ' + e.message); }
  }

  function log(msg) { emitter.emit('log', msg); }

  // ── Persistencia ─────────────────────────────────────────────
  function cargar(ruta) {
    if (!fs.existsSync(ruta)) return {};
    try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return {}; }
  }
  function guardar(ruta, data) {
    try { fs.writeFileSync(ruta, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { log('⚠️ guardar: ' + e.message); }
  }

  // ── Helpers ──────────────────────────────────────────────────
  function quitarEmojis(t) { return t.replace(/\p{Emoji}/gu,'').replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim(); }
  function esNombreValido(t) {
    const l=quitarEmojis(t);
    return l.length>=2 && !/^\d+$/.test(l) && !['hola','si','no','ok','bien','dale','buenas','hey','test'].includes(l.toLowerCase()) && /\p{L}/u.test(l);
  }
  function esEmailValido(t) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim()); }
  function capitalizar(t) { return t.split(' ').map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(' '); }
  function extraerNumero(id) { return id.replace(/[^0-9]/g,''); }

  function limpiarRespuesta(texto) {
    if (!texto) return 'Disculpá, hubo un problema. ¿Me repetís la consulta?';
    return texto
      .replace(/<function=[^>]*>[\s\S]*?<\/function>/g,'')
      .replace(/```[\s\S]*?```/g,'')
      .replace(/\{[\s\S]*?"fecha"[\s\S]*?\}/g,'')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,'$2')
      .replace(/\*\*([^*]+)\*\*/g,'*$1*')
      .replace(/https?:\/\/(?!www\.mercadopago\.com\.ar|checkout\.mercadopago\.com\.ar|calendar\.google\.com)[^\s)>\],"]+/gi,'')
      .replace(/[ \t]+\n/g,'\n').trim();
  }

  // ── FIX CRÍTICO: función para enviar mensaje con reintentos ──
  async function enviarMensaje(chatIdDestino, texto, opciones = {}) {
    const intentos = [
      chatIdDestino,
      // Si falla con el ID original, probar formatos alternativos
      chatIdDestino.includes('@c.us') ? chatIdDestino : chatIdDestino.replace(/[^0-9]/g,'') + '@c.us',
    ];

    for (const destino of intentos) {
      try {
        await client.sendMessage(destino, texto, opciones);
        log(`✅ Enviado a ${destino}: "${String(texto).slice(0,50)}..."`);
        return true;
      } catch (e) {
        log(`⚠️ Fallo enviando a ${destino}: ${e.message}`);
      }
    }
    log(`❌ No se pudo enviar mensaje a ${chatIdDestino}`);
    return false;
  }

  // ── Audio STT ────────────────────────────────────────────────
  async function transcribirAudio(msg) {
    let tmp = null;
    try {
      const media = await msg.downloadMedia();
      if (!media?.data) return null;
      const ext = (media.mimetype||'').includes('mp4')?'mp4':'ogg';
      tmp = path.join(dataDir, `_audio_${Date.now()}.${ext}`);
      fs.writeFileSync(tmp, Buffer.from(media.data,'base64'));
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', fs.createReadStream(tmp), { filename:`audio.${ext}`, contentType:media.mimetype });
      form.append('model','whisper-large-v3');
      form.append('language','es');
      form.append('response_format','text');
      return await new Promise((res,rej)=>{
        const req=https.request({hostname:'api.groq.com',path:'/openai/v1/audio/transcriptions',method:'POST',headers:{...form.getHeaders(),Authorization:`Bearer ${GROQ_API_KEY}`}},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d.trim()||null));});
        req.on('error',rej);form.pipe(req);
      });
    } catch(e){log('[STT] Error: '+e.message);return null;}
    finally{if(tmp&&fs.existsSync(tmp)){try{fs.unlinkSync(tmp);}catch{}}}
  }

  // ── Audio TTS ────────────────────────────────────────────────
  function debeResponderEnAudio(t){
    if(!RIME_API_KEY)return false;
    return ![/https?:\/\//i,/mercadopago/i,/calendar\.google/i,/@[^\s]+\.[a-z]{2,}/i].some(p=>p.test(t));
  }
  function prepararTextoAudio(t){
    return t.replace(/[\u{1F300}-\u{1FFFF}]/gu,'').replace(/[\u2600-\u27FF]/gu,'')
      .replace(/\*([^*]+)\*/g,'$1').replace(/\$(\d+)/g,'$1 pesos')
      .replace(/https?:\/\/\S+/g,'el link que te mandé').replace(/\n+/g,'. ').replace(/\s+/g,' ').trim();
  }
  async function enviarComoAudio(chatId, texto) {
    const tl=prepararTextoAudio(texto);
    if(!tl)return false;
    for(const voz of ['valentina','isabella','camila','luna']){
      try{
        const body=JSON.stringify({speaker:voz,text:tl,modelId:'arcana-v2',lang:'es',speedAlpha:0.9});
        const buf=await new Promise((res,rej)=>{
          const req=https.request({hostname:'users.rime.ai',path:'/v1/rime-tts',method:'POST',headers:{Accept:'audio/mp3','Content-Type':'application/json',Authorization:`Bearer ${RIME_API_KEY}`}},(r)=>{
            const c=[];r.on('data',d=>c.push(d));
            r.on('end',()=>{const b=Buffer.concat(c);if((r.headers['content-type']||'').includes('json')||r.statusCode>=400)rej(new Error('TTS error'));else res(b);});
          });
          req.on('error',rej);req.write(body);req.end();
        });
        const media=new MessageMedia('audio/mpeg',buf.toString('base64'),'voz.mp3');
        await enviarMensaje(chatId, media, {sendAudioAsVoice:true});
        return true;
      }catch{}
    }
    return false;
  }

  // ── Historial ────────────────────────────────────────────────
  function recortarHistorial(h,max=20){
    if(h.length<=max)return h;
    let r=[...h];
    while(r.length>max){const fi=r.findIndex(m=>m.role==='user');if(fi===-1)break;let fin=fi+1;while(fin<r.length&&r[fin].role!=='user')fin++;r.splice(0,fin);}
    while(r.length>0&&r[0].role==='tool')r.shift();
    return r;
  }

  // ── Google Calendar ──────────────────────────────────────────
  function crearFecha(y,m,d,h=0,min=0){return new Date(Date.UTC(y,m-1,d,h+3,min,0,0));}
  async function obtenerEventos(calId,ini,fin){
    if(!calendarAuth)return[];
    try{const cal=google.calendar({version:'v3',auth:calendarAuth});const r=await cal.events.list({calendarId:calId,timeMin:ini.toISOString(),timeMax:fin.toISOString(),singleEvents:true,orderBy:'startTime'});return r.data.items||[];}
    catch(e){log('❌ Calendar: '+e.message);return[];}
  }
  async function horariosLibres(fecha){
    const[y,m,d]=fecha.split('-').map(Number);
    const ev=await obtenerEventos(CALENDAR_ID,crearFecha(y,m,d,HORA_INICIO_DIA),crearFecha(y,m,d,HORA_FIN_DIA));
    const libres=[];
    for(let h=HORA_INICIO_DIA;h<HORA_FIN_DIA;h++){
      const si=crearFecha(y,m,d,h),sf=crearFecha(y,m,d,h+DURACION_RESERVA_HORAS);
      const ocu=ev.some(e=>{const ei=new Date(e.start.dateTime||e.start.date),ef=new Date(e.end.dateTime||e.end.date);return si<ef&&sf>ei;});
      if(!ocu)libres.push(`${h}:00 - ${h+1}:00`);
    }
    return libres;
  }
  async function crearEvento(calId,resumen,desc,ini,fin,email,tel){
    if(!calendarAuth)return null;
    try{
      const cal=google.calendar({version:'v3',auth:calendarAuth});
      const r=await cal.events.insert({calendarId:calId,resource:{summary:resumen,description:desc+(tel?`\nTel: +${tel}`:'')+( email?`\nEmail: ${email}`:''),start:{dateTime:ini.toISOString(),timeZone:ZONA_HORARIA},end:{dateTime:fin.toISOString(),timeZone:ZONA_HORARIA},reminders:{useDefault:false,overrides:[{method:'email',minutes:24*60},{method:'popup',minutes:30}]}},sendUpdates:'none'});
      return r.data;
    }catch(e){log('❌ Evento: '+e.message);return null;}
  }
  async function eliminarEvento(calId,evId){if(!calendarAuth)return false;try{await google.calendar({version:'v3',auth:calendarAuth}).events.delete({calendarId:calId,eventId:evId});return true;}catch{return false;}}

  // ── MercadoPago ──────────────────────────────────────────────
  async function crearPago(chatId,nombre,fecha,hora,horaFin){
    return new Promise((res,rej)=>{
      if(!MP_ACCESS_TOKEN)return rej(new Error('MP_ACCESS_TOKEN no configurado'));
      const webhookUrl=NGROK_DOMAIN?`https://${NGROK_DOMAIN}/webhook-bot`:'';
      const hI=parseInt(hora.split(':')[0]),hF=horaFin?parseInt(horaFin.split(':')[0]):hI+DURACION_RESERVA_HORAS;
      const cant=Math.max(1,hF-hI),total=PRECIO_TURNO*cant;
      const body=JSON.stringify({items:[{title:`Turno ${fecha} ${hora} — ${NEGOCIO}`,quantity:cant,unit_price:PRECIO_TURNO,currency_id:'ARS'}],payer:{name:nombre},external_reference:`${chatId}|${fecha}|${hora}|${horaFin||hora}`,notification_url:webhookUrl,expires:true,expiration_date_from:new Date().toISOString(),expiration_date_to:new Date(Date.now()+30*60000).toISOString()});
      const req=https.request({hostname:'api.mercadopago.com',path:'/checkout/preferences',method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${MP_ACCESS_TOKEN}`}},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const p=JSON.parse(d);if(p.init_point)res(p);else rej(new Error('MP sin init_point: '+d.slice(0,100)));}catch(e){rej(e);}});});
      req.on('error',rej);req.write(body);req.end();
    });
  }
  async function verificarPago(paymentId){
    return new Promise((res,rej)=>{const req=https.request({hostname:'api.mercadopago.com',path:`/v1/payments/${paymentId}`,method:'GET',headers:{Authorization:`Bearer ${MP_ACCESS_TOKEN}`}},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(e);}});});req.on('error',rej);req.end();});
  }

  // ── Memoria ──────────────────────────────────────────────────
  function cargarMemoria(chatId){
    const id=extraerNumero(chatId),ruta=path.join(dataDir,`${id}.json`);
    if(!fs.existsSync(ruta))return null;
    try{
      const d=JSON.parse(fs.readFileSync(ruta,'utf8'));
      if(!d.historial)d.historial=[];
      d.historial=d.historial.map(m=>{if(m.tool_calls)m.tool_calls=m.tool_calls.map(tc=>{if(!tc.type)tc.type='function';if(tc.function&&typeof tc.function.arguments==='object')tc.function.arguments=JSON.stringify(tc.function.arguments);return tc;});return m;});
      return d;
    }catch{return null;}
  }
  function guardarMemoria(chatId,datos){
    try{fs.writeFileSync(path.join(dataDir,`${extraerNumero(chatId)}.json`),JSON.stringify(datos,null,2),'utf8');}
    catch(e){log('⚠️ guardarMemoria: '+e.message);}
  }

  // ── Recordatorios ────────────────────────────────────────────
  const RECS=[
    {min:24*60,label:'24h',msg:(n,h)=>`¡Hola ${n}! 👋 Recordatorio: *mañana* a las *${h}* con ${NEGOCIO}. ¡Te esperamos!`},
    {min:4*60,label:'4h',msg:(n,h)=>`¡Hola ${n}! ⏰ En unas horas tu turno a las *${h}*. Avisanos si no podés. 🙏`},
    {min:30,label:'30min',msg:(n,h)=>`¡${n}! 🚗 En 30 minutos tu turno a las *${h}*. ¡Nos vemos!`},
  ];
  function programarRecs(chatId,nombre,fecha,hora){
    const[y,m,d]=fecha.split('-').map(Number),[h,min]=hora.split(':').map(Number);
    const ft=crearFecha(y,m,d,h,min),ahora=Date.now();
    const key=`${chatId}|${fecha}|${hora}`;
    recordatoriosActivos[key]={chatId,nombre,fecha,hora};
    guardar(RECORDATORIOS_PATH,recordatoriosActivos);
    for(const r of RECS){
      const delay=ft.getTime()-r.min*60000-ahora;
      if(delay<=0)continue;
      const tk=`${key}|${r.label}`;
      if(timeoutsRecs[tk])clearTimeout(timeoutsRecs[tk]);
      timeoutsRecs[tk]=setTimeout(async()=>{
        try{await enviarMensaje(chatId,r.msg(nombre,hora));log(`[REC] ✅ ${r.label} → ${nombre}`);}
        catch(e){log(`[REC] ❌ ${e.message}`);}
      },delay);
    }
  }
  function reprogramarRecs(){
    let c=0;
    for(const[,r]of Object.entries(recordatoriosActivos)){
      const[y,m,d]=r.fecha.split('-').map(Number),[h,min]=r.hora.split(':').map(Number);
      if(crearFecha(y,m,d,h,min).getTime()<Date.now())continue;
      programarRecs(r.chatId,r.nombre,r.fecha,r.hora);c++;
    }
    if(c>0)log(`[REC] ${c} recordatorios reprogramados`);
  }

  // ── Reservas ─────────────────────────────────────────────────
  function pendienteActual(chatId){const ahora=Date.now();for(const[,r]of Object.entries(reservasPendientes))if(r.chatId===chatId&&r.expiresAt>ahora)return r;return null;}
  function limpiarExpiradas(){let cambio=false;for(const k of Object.keys(reservasPendientes))if(reservasPendientes[k].expiresAt<=Date.now()){delete reservasPendientes[k];cambio=true;}if(cambio)guardar(RESERVAS_PATH,reservasPendientes);}
  setInterval(limpiarExpiradas,5*60000);

  // ── Groq ─────────────────────────────────────────────────────
  function herramientas(){
    return[
      {type:'function',function:{name:'consultar_disponibilidad',description:'Busca horarios libres. Úsala SIEMPRE ante preguntas de disponibilidad.',parameters:{type:'object',properties:{fecha:{type:'string',description:'YYYY-MM-DD'}},required:['fecha']}}},
      {type:'function',function:{name:'agendar_turno',description:'SOLO llamar si: (1) se consultó disponibilidad, (2) cliente eligió día Y hora, (3) cliente confirmó con sí/dale/reservame.',parameters:{type:'object',properties:{fecha:{type:'string'},hora:{type:'string'},hora_fin:{type:'string'}},required:['fecha','hora']}}},
      {type:'function',function:{name:'cancelar_turno',description:'Cancela turno YA PAGADO.',parameters:{type:'object',properties:{fecha:{type:'string'},hora:{type:'string'}},required:['fecha','hora']}}},
      {type:'function',function:{name:'reagendar_turno',description:'Mueve turno pagado sin cobrar de nuevo.',parameters:{type:'object',properties:{fecha_actual:{type:'string'},hora_actual:{type:'string'},hora_fin_actual:{type:'string'},fecha_nueva:{type:'string'},hora_nueva:{type:'string'}},required:['fecha_actual','hora_actual','fecha_nueva','hora_nueva']}}},
    ];
  }
  async function llamarGroq(msgs,conTools=true){
    if(Date.now()<groqBloqueadoHasta){const e=new Error('RATE_LIMIT');e.isRateLimit=true;throw e;}
    const opts={model:MODELO,messages:msgs,max_tokens:512};
    if(conTools){opts.tools=herramientas();opts.tool_choice='auto';}
    try{return await groq.chat.completions.create(opts);}
    catch(err){
      if(err.status===429){const m=err.message.match(/try again in (\d+)m([\d.]+)s/i);groqBloqueadoHasta=Date.now()+(m?(parseInt(m[1])*60+Math.ceil(parseFloat(m[2])))*1000+5000:5*60000);const e=new Error('RATE_LIMIT');e.isRateLimit=true;throw e;}
      if(err.status===400&&err.message.includes('tool_use_failed')){try{return await groq.chat.completions.create(opts);}catch(e2){const er=new Error('TOOL_USE_FAILED');er.isToolUseFailed=true;throw er;}}
      throw err;
    }
  }

  // ── Handler de mensajes ──────────────────────────────────────
  async function handleMessage(msg){
    if(msg.isGroup||msg.from.includes('broadcast'))return;
    const esAudio=msg.type==='ptt'||msg.type==='audio';
    if(!esAudio&&(!msg.body||!msg.body.trim()))return;

    // FIX: usar siempre msg.from para responder (nunca msg.to)
    const chatId = msg.from;
    let texto=msg.body||'', fueAudio=false;

    if(esAudio){
      const tr=await transcribirAudio(msg);
      if(!tr){await enviarMensaje(chatId,'¡Ups! No pude entender el audio. ¿Me lo escribís? 🙏');return;}
      texto=tr;fueAudio=true;
    }

    const bodyLower=texto.toLowerCase().trim();
    log(`${fueAudio?'🎤':'📩'} [${chatId}]: ${texto.slice(0,80)}`);

    // Ignorar mensajes propios (fromMe) excepto comandos akira
    if(msg.fromMe){
      if(bodyLower.startsWith('akira '))await manejarComando(bodyLower,chatId,cargarMemoria(chatId));
      return;
    }

    let usuario=cargarMemoria(chatId);
    if(usuario?.silenciado&&!bodyLower.includes('akira'))return;

    try{
      const chat=await msg.getChat();
      const contact=await msg.getContact();
      const tel=contact.number||extraerNumero(chatId);

      if(!usuario){const r=await registrarNombre(chatId,texto,tel);if(r)return;}
      if(cacheTemporal[chatId]?.esperandoEmail){await capturaEmail(chatId,texto,cargarMemoria(chatId));return;}
      if(quiereConDueno(bodyLower)){
        const u=cargarMemoria(chatId);
        if(u){u.silenciado=true;guardarMemoria(chatId,u);}
        await enviarMensaje(chatId,`¡Dale, ${u?.nombre||''}! Le aviso a ${MI_NOMBRE} para que te contacte. 🙌`);
        return;
      }

      // Detección preselección de hora
      if(cacheTemporal[chatId]?.ultimaConsulta){
        const uc=cacheTemporal[chatId].ultimaConsulta;
        if((Date.now()-uc.ts)/60000<30){
          const hm=(uc.libres||[]).filter(s=>{const n=s.split(':')[0];return bodyLower.includes(`${n}:00`)||bodyLower.includes(`las ${n}`)||bodyLower.includes(`a las ${n}`)||bodyLower.includes(`${n} hs`);});
          if(hm.length===1){if(!cacheTemporal[chatId])cacheTemporal[chatId]={};cacheTemporal[chatId].preseleccionado={fecha:uc.fecha,hora:hm[0].split(' ')[0]};guardar(CACHE_PATH,cacheTemporal);}
        }
      }

      await chat.sendStateTyping().catch(()=>{});
      const u=cargarMemoria(chatId);
      u.historial.push({role:'user',content:fueAudio?`[voz] ${texto}`:texto});
      u.historial=recortarHistorial(u.historial,20);

      const respuesta=await procesarConIA(chatId,u,chat);
      u.historial.push({role:'assistant',content:respuesta});
      guardarMemoria(chatId,u);

      log(`🤖 AKIRA → ${chatId}: "${respuesta.slice(0,60)}..."`);

      // FIX CRÍTICO: enviar con función robusta
      const audio=fueAudio&&debeResponderEnAudio(respuesta);
      if(audio){
        const ok=await enviarComoAudio(chatId,respuesta);
        if(!ok)await enviarMensaje(chatId,respuesta);
      }else{
        await enviarMensaje(chatId,respuesta);
      }

      await chat.clearState().catch(()=>{});
    }catch(err){
      log('❌ handleMessage error: '+err.message);
      try{await enviarMensaje(chatId,`¡Ups! Tuve un problema. ¿Me repetís la consulta? 🙏`);}catch{}
    }
  }

  // ── Comandos maestros ────────────────────────────────────────
  async function manejarComando(bodyLower,chatId,usuario){
    if(bodyLower.includes('akira stop')){if(usuario){usuario.silenciado=true;guardarMemoria(chatId,usuario);}await enviarMensaje(chatId,'*(Akira apagada)*');return;}
    if(bodyLower.includes('akira reactivate')){if(usuario){usuario.silenciado=false;guardarMemoria(chatId,usuario);}await enviarMensaje(chatId,'*(Akira reactivada)*');return;}
    if(bodyLower.includes('akira status')){
      const arch=fs.readdirSync(dataDir).filter(f=>f.endsWith('.json')&&!f.startsWith('_'));
      const lineas=arch.map(f=>{try{const d=JSON.parse(fs.readFileSync(path.join(dataDir,f),'utf8'));return `${d.nombre||'?'}: ${d.silenciado?'SILENCIADO':'activo'}`;}catch{return f+': error';}});
      await enviarMensaje(chatId,`*Usuarios (${arch.length}):*\n${lineas.join('\n')}`);
    }
  }

  // ── Registro nombre ──────────────────────────────────────────
  async function registrarNombre(chatId,texto,tel){
    if(!cacheTemporal[chatId]){
      cacheTemporal[chatId]={esperandoNombre:true};guardar(CACHE_PATH,cacheTemporal);
      await enviarMensaje(chatId,`¡Hola! ✨ Soy Akira, asistente de *${MI_NOMBRE}* — ${NEGOCIO}.\n\n¿Cuál es tu nombre? 😊`);
      return true;
    }
    if(cacheTemporal[chatId]?.esperandoNombre){
      if(!esNombreValido(texto.trim())){await enviarMensaje(chatId,'¿Me decís tu nombre real? (solo letras) 😊');return true;}
      const nombre=capitalizar(quitarEmojis(texto.trim()));
      const u={nombre,telefono:chatId,numeroReal:tel,email:null,historial:[{role:'assistant',content:'¡Hola! ¿Cómo es tu nombre?'},{role:'user',content:nombre}],silenciado:false};
      delete cacheTemporal[chatId];guardar(CACHE_PATH,cacheTemporal);guardarMemoria(chatId,u);
      const s=`¡Genial, ${nombre}! Un gusto. 🤝\n\n¿En qué te puedo ayudar hoy?`;
      u.historial.push({role:'assistant',content:s});guardarMemoria(chatId,u);
      await enviarMensaje(chatId,s);return true;
    }
    return false;
  }

  async function capturaEmail(chatId,texto,usuario){
    if(!esEmailValido(texto.trim())){await enviarMensaje(chatId,'¡Ese email no parece válido! ¿Lo escribís de nuevo? (ej: nombre@gmail.com)');return;}
    usuario.email=texto.trim().toLowerCase();guardarMemoria(chatId,usuario);
    const{fecha,hora,horaFin}=cacheTemporal[chatId].reservaPendiente;
    delete cacheTemporal[chatId];guardar(CACHE_PATH,cacheTemporal);
    await generarPago(chatId,usuario,fecha,hora,horaFin||null);
  }

  function quiereConDueno(t){return[`hablar con ${MI_NOMBRE.toLowerCase()}`,'pasame con','quiero hablar con','necesito hablar con'].some(f=>t.includes(f));}

  // ── Procesamiento IA ─────────────────────────────────────────
  async function procesarConIA(chatId,usuario){
    limpiarExpiradas();
    const pend=pendienteActual(chatId);
    const ahora=new Date(new Date().toLocaleString('en-US',{timeZone:ZONA_HORARIA}));
    const fStr=ahora.toLocaleString('es-AR',{timeZone:ZONA_HORARIA,weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const fISO=ahora.toISOString().slice(0,10);
    const dias=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const prox=Array.from({length:7},(_,i)=>{const d=new Date(ahora);d.setDate(ahora.getDate()+i+1);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${dias[d.getDay()]} = ${y}-${m}-${dd}`;}).join(', ');

    const sys={role:'system',content:
      `Sos Akira, asistente de ${MI_NOMBRE} (${NEGOCIO}). Hablás con ${usuario.nombre}. Tono cálido, humano, WhatsApp. `+
      `Hoy: ${fStr} | ISO: ${fISO}\nPróx días: ${prox}\n`+
      `Negocio: ${SERVICIOS} | Precio: $${PRECIO_TURNO} ARS/h | Cancelar/reagendar: mín ${HORAS_MINIMAS_CANCELACION}h.\n`+
      (pend?`🚨 PAGO PENDIENTE: ${pend.fecha} ${pend.hora} ($${pend.totalPrecio||PRECIO_TURNO}). NO agendar otro.\n`:'')+
      (usuario.turnosConfirmados?.length?`[INT] Turnos pagados: ${usuario.turnosConfirmados.map(t=>`${t.fecha} ${t.hora}`).join(', ')} — nunca preguntar si pagó.\n`:'')+
      `FLUJO: 1.Consultar disponibilidad → 2.Cliente elige → 3.Confirmar → 4.Llamar agendar_turno. NUNCA saltear pasos.\n`+
      `Max 4 líneas. Sin JSON/código. Cancelar→cancelar_turno, Cambiar→reagendar_turno.\n`+
      (PROMPT_EXTRA?`INSTRUCCIONES EXTRA: ${PROMPT_EXTRA}\n`:'')
    };

    let resp=await llamarGroq([sys,...usuario.historial]);
    let msg=resp.choices[0].message;

    if(msg.tool_calls?.length>0){
      usuario.historial.push({role:msg.role,content:msg.content,tool_calls:msg.tool_calls});
      for(const t of msg.tool_calls){const args=JSON.parse(t.function.arguments);log(`🔧 Tool: ${t.function.name}`);await ejecutarTool(t,args,chatId,usuario);}

      let linkMP=null;
      for(const m of usuario.historial)if(m.role==='tool'&&m.content){const match=m.content.match(/Link:\s*(https:\/\/www\.mercadopago\.com\.ar[^\s.]+)/);if(match){linkMP=match[1];break;}}

      const msgs2=[{role:'system',content:`Sos Akira de ${MI_NOMBRE}. Natural, cálido, WhatsApp con ${usuario.nombre}. Max 3 líneas.`+(linkMP?' El link de pago se agrega automáticamente — NO lo menciones.':'')}, ...usuario.historial];
      try{resp=await llamarGroq(msgs2,false);msg=resp.choices[0].message;}
      catch(e){if(e.isRateLimit||e.isToolUseFailed)msg={role:'assistant',content:'¡Listo! Revisá el mensaje anterior. ¿Te quedó alguna duda? 😊'};else throw e;}

      if(linkMP&&msg.content&&!msg.content.includes('mercadopago.com.ar')){
        msg={...msg,content:msg.content.trim()+`\n\n💳 *Para confirmar tu turno, pagá aquí:*\n${linkMP}\n\n⏳ Tenés 30 minutos para pagar, sino se cancela.`};
      }
    }

    return limpiarRespuesta(msg.content);
  }

  // ── Ejecutor de tools ────────────────────────────────────────
  async function ejecutarTool(tool,args,chatId,usuario){
    const push=c=>usuario.historial.push({role:'tool',tool_call_id:tool.id,name:tool.function.name,content:c});

    if(tool.function.name==='consultar_disponibilidad'){
      const libres=await horariosLibres(args.fecha);
      const res=libres.length>0?`Horarios libres para ${args.fecha}: ${libres.join(', ')}`:`No hay horarios disponibles para el ${args.fecha}.`;
      if(!cacheTemporal[chatId])cacheTemporal[chatId]={};
      cacheTemporal[chatId].ultimaConsulta={fecha:args.fecha,libres,ts:Date.now()};
      guardar(CACHE_PATH,cacheTemporal);push(res);return;
    }

    if(tool.function.name==='agendar_turno'){
      const msgs=usuario.historial.filter(m=>m.role==='user').map(m=>(m.content||'').toLowerCase());
      const ultimo=msgs[msgs.length-1]||'';
      const confirma=['si','sí','dale','bueno','ok','reservame','reservá','agendame','quiero','perfecto','listo','va','confirmo','poneme','anotame'].some(p=>ultimo.includes(p));
      const presel=cacheTemporal[chatId]?.preseleccionado;
      const porCache=presel&&presel.fecha===args.fecha&&presel.hora===args.hora;
      if(!confirma&&!porCache){push(`El cliente no confirmó aún. Preguntale si quiere el turno del ${args.fecha} a las ${args.hora}.`);return;}
      if(cacheTemporal[chatId]?.preseleccionado){delete cacheTemporal[chatId].preseleccionado;guardar(CACHE_PATH,cacheTemporal);}
      limpiarExpiradas();
      const pend=pendienteActual(chatId);
      if(pend){push(`Ya tenés reserva pendiente para el ${pend.fecha} ${pend.hora}. Pagá esa primero.`);return;}
      const hF=args.hora_fin||null;
      const[y,m,d]=args.fecha.split('-').map(Number);
      const hI=parseInt(args.hora.split(':')[0]),hFn=hF?parseInt(hF.split(':')[0]):hI+DURACION_RESERVA_HORAS;
      const cant=Math.max(1,hFn-hI),total=PRECIO_TURNO*cant;
      const sk=`${args.fecha}|${args.hora}`;
      if(slotsEnProceso.has(sk)){push(`El slot ya está siendo procesado. Pedile que elija otro.`);return;}
      slotsEnProceso.add(sk);
      try{
        const ini=crearFecha(y,m,d,hI),fin=crearFecha(y,m,d,hFn);
        const conflictos=await obtenerEventos(CALENDAR_ID,ini,fin);
        if(conflictos.length>0){push(`El horario ${args.hora}–${hFn}:00 ya está ocupado.`);return;}
        if(!usuario.email){
          cacheTemporal[chatId]={esperandoEmail:true,reservaPendiente:{fecha:args.fecha,hora:args.hora,horaFin:hF}};
          guardar(CACHE_PATH,cacheTemporal);
          push(`Para reservar necesitamos el email del cliente. Pedíselo.`);return;
        }
        const pref=await crearPago(chatId,usuario.nombre,args.fecha,args.hora,hF);
        const rk=`${chatId}|${args.fecha}|${args.hora}|${hF||args.hora}`;
        reservasPendientes[rk]={chatId,fecha:args.fecha,hora:args.hora,horaFin:hF,nombre:usuario.nombre,email:usuario.email,cant,total,expiresAt:Date.now()+30*60000};
        guardar(RESERVAS_PATH,reservasPendientes);
        push(`Link generado. Reserva: ${args.fecha} ${args.hora}–${hFn}:00 $${total} ARS. Link: ${pref.init_point}. Solo se agenda si paga. Vence en 30 min.`);
      }catch(e){log('[MP] '+e.message);push(`Error generando link: ${e.message}.`);}
      finally{slotsEnProceso.delete(sk);}
      return;
    }

    if(tool.function.name==='cancelar_turno'){
      const t=(usuario.turnosConfirmados||[]).find(t=>t.fecha===args.fecha&&t.hora===args.hora);
      if(!t){push(`No encontré turno para ${args.fecha} ${args.hora}.`);return;}
      const[y,m,d]=args.fecha.split('-').map(Number),h=parseInt(args.hora.split(':')[0]);
      const hs=(crearFecha(y,m,d,h,0).getTime()-Date.now())/3600000;
      if(hs<HORAS_MINIMAS_CANCELACION){push(`No se puede cancelar: faltan solo ${Math.round(hs)}hs.`);return;}
      const hF=t.horaFin?parseInt(t.horaFin.split(':')[0]):h+1;
      const evs=await obtenerEventos(CALENDAR_ID,crearFecha(y,m,d,h),crearFecha(y,m,d,hF));
      const ev=evs.find(e=>e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase()));
      if(ev)await eliminarEvento(CALENDAR_ID,ev.id);
      usuario.turnosConfirmados=(usuario.turnosConfirmados||[]).filter(t=>!(t.fecha===args.fecha&&t.hora===args.hora));
      guardarMemoria(chatId,usuario);
      push(`Turno ${args.fecha} ${args.hora} cancelado.`);return;
    }

    if(tool.function.name==='reagendar_turno'){
      const t=(usuario.turnosConfirmados||[]).find(t=>t.fecha===args.fecha_actual&&t.hora===args.hora_actual);
      if(!t){push(`No encontré turno para ${args.fecha_actual} ${args.hora_actual}.`);return;}
      const[ya,ma,da]=args.fecha_actual.split('-').map(Number),ha=parseInt(args.hora_actual.split(':')[0]);
      const hs=(crearFecha(ya,ma,da,ha).getTime()-Date.now())/3600000;
      if(hs<HORAS_MINIMAS_CANCELACION){push(`No se puede reagendar: faltan solo ${Math.round(hs)}hs.`);return;}
      const hfa=t.horaFin?parseInt(t.horaFin.split(':')[0]):ha+1;
      const dur=Math.max(1,hfa-ha);
      const[yn,mn,dn]=args.fecha_nueva.split('-').map(Number),hn=parseInt(args.hora_nueva.split(':')[0]);
      const hfn=Math.min(hn+dur,HORA_FIN_DIA),hfnStr=`${String(hfn).padStart(2,'0')}:00`;
      const ini=crearFecha(yn,mn,dn,hn),fin=crearFecha(yn,mn,dn,hfn);
      const conf=await obtenerEventos(CALENDAR_ID,ini,fin);
      const confR=conf.filter(e=>!(e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase())&&args.fecha_nueva===args.fecha_actual));
      if(confR.length>0){push(`El horario ${args.fecha_nueva} ${args.hora_nueva}–${hfnStr} ya está ocupado.`);return;}
      const evs=await obtenerEventos(CALENDAR_ID,crearFecha(ya,ma,da,ha),crearFecha(ya,ma,da,hfa));
      const ev=evs.find(e=>e.summary?.toLowerCase().includes(usuario.nombre.toLowerCase()));
      if(ev)await eliminarEvento(CALENDAR_ID,ev.id);
      const nuevo=await crearEvento(CALENDAR_ID,`Turno — ${usuario.nombre}`,`WhatsApp: +${usuario.numeroReal||extraerNumero(chatId)} | Reagendado desde ${args.fecha_actual} ${args.hora_actual}`,ini,fin,usuario.email,usuario.numeroReal||extraerNumero(chatId));
      if(!nuevo){push(`Error creando nuevo evento.`);return;}
      usuario.turnosConfirmados=(usuario.turnosConfirmados||[]).map(tc=>tc.fecha===args.fecha_actual&&tc.hora===args.hora_actual?{...tc,fecha:args.fecha_nueva,hora:args.hora_nueva,horaFin:hfnStr}:tc);
      guardarMemoria(chatId,usuario);
      programarRecs(chatId,usuario.nombre,args.fecha_nueva,args.hora_nueva);
      push(`Reagendado: ${args.fecha_nueva} ${args.hora_nueva}–${hfnStr}. Sin costo extra.`);
    }
  }

  // ── Generar pago post-email ──────────────────────────────────
  async function generarPago(chatId,usuario,fecha,hora,horaFin=null){
    try{
      limpiarExpiradas();const pend=pendienteActual(chatId);
      if(pend){await enviarMensaje(chatId,`Ojo, ${usuario.nombre}! Ya tenés un turno pendiente para el *${pend.fecha}* a las *${pend.hora}*. Pagá ese primero. 💳`);return;}
      const hI=parseInt(hora.split(':')[0]),hF=horaFin?parseInt(horaFin.split(':')[0]):hI+1;
      const cant=Math.max(1,hF-hI),total=PRECIO_TURNO*cant;
      const pref=await crearPago(chatId,usuario.nombre,fecha,hora,horaFin);
      const rk=`${chatId}|${fecha}|${hora}|${horaFin||hora}`;
      reservasPendientes[rk]={chatId,fecha,hora,horaFin,nombre:usuario.nombre,email:usuario.email,cant,total,expiresAt:Date.now()+30*60000};
      guardar(RESERVAS_PATH,reservasPendientes);
      const r=horaFin?`de *${hora}* a *${horaFin}*`:`a las *${hora}*`;
      await enviarMensaje(chatId,`¡Perfecto! 🎉 Para confirmar tu turno del *${fecha}* ${r}:\n\n💳 *Pagá aquí:*\n${pref.init_point}\n\n💰 *$${total} ARS*${cant>1?` (${cant} × $${PRECIO_TURNO})`:''}\n⏳ Vence en 30 min. ✅`);
    }catch(e){log('[MP] Error pago: '+e.message);await enviarMensaje(chatId,'¡Ups! Error generando el link de pago. Intentá en unos minutos. 🙏');}
  }

  // ── Webhook bot MP ───────────────────────────────────────────
  function iniciarServidor(){
    const app=express();
    app.use(express.json());
    app.post('/webhook-bot',async(req,res)=>{
      res.sendStatus(200);
      const p=req.body;if(p.type!=='payment'||!p.data?.id)return;
      try{
        const pago=await verificarPago(p.data.id);
        if(pago.status!=='approved')return;
        const rk=pago.external_reference,res2=reservasPendientes[rk];
        if(!res2)return;
        if(Date.now()>res2.expiresAt){
          await enviarMensaje(res2.chatId,`Hola ${res2.nombre}! Tu pago fue recibido ✅ pero la reserva expiró. ${MI_NOMBRE} te contacta para reagendar. 🙏`);
          delete reservasPendientes[rk];guardar(RESERVAS_PATH,reservasPendientes);return;
        }
        const[y,m,d]=res2.fecha.split('-').map(Number);
        const hI=parseInt(res2.hora.split(':')[0]),hF=res2.horaFin?parseInt(res2.horaFin.split(':')[0]):hI+DURACION_RESERVA_HORAS;
        const ini=crearFecha(y,m,d,hI),fin=crearFecha(y,m,d,hF);
        const conf=await obtenerEventos(CALENDAR_ID,ini,fin);
        if(conf.length>0){
          await enviarMensaje(res2.chatId,`Hola ${res2.nombre}! Tu pago fue recibido ✅ pero el horario quedó ocupado. ${MI_NOMBRE} te contacta para reagendar. 🙏`);
          delete reservasPendientes[rk];guardar(RESERVAS_PATH,reservasPendientes);return;
        }
        const um=cargarMemoria(res2.chatId),tel=um?.numeroReal||extraerNumero(res2.chatId);
        const ev=await crearEvento(CALENDAR_ID,`Turno — ${res2.nombre}`,`WhatsApp: +${tel} | Pago MP ID: ${pago.id} | $${res2.total||PRECIO_TURNO}`,ini,fin,res2.email||null,tel);
        delete reservasPendientes[rk];guardar(RESERVAS_PATH,reservasPendientes);
        if(ev){
          if(um){if(!um.turnosConfirmados)um.turnosConfirmados=[];um.turnosConfirmados.push({fecha:res2.fecha,hora:res2.hora,horaFin:res2.horaFin||null,pagoId:pago.id,confirmadoEn:new Date().toISOString()});um.historial.push({role:'assistant',content:`[SISTEMA] Pago MP confirmado (ID:${pago.id}). Turno ${res2.fecha} ${res2.hora}. YA PAGÓ.`});guardarMemoria(res2.chatId,um);}
          programarRecs(res2.chatId,res2.nombre,res2.fecha,res2.hora);
          await enviarMensaje(res2.chatId,`¡Listo, ${res2.nombre}! 🎉\n✅ *Pago: $${res2.total||PRECIO_TURNO} ARS*\n📅 *Turno:* ${res2.fecha} de *${res2.hora}${res2.horaFin?'–'+res2.horaFin:''}*\n${ev.htmlLink?`📆 ${ev.htmlLink}\n`:''}\n⏰ Te recordamos 24hs, 4hs y 30min antes. ¡Te esperamos! 🙌`);
        }else{
          await enviarMensaje(res2.chatId,`Hola ${res2.nombre}! Pago recibido ✅ pero error en el calendario. ${MI_NOMBRE} confirma manualmente. 🙏`);
        }
      }catch(e){log('[Webhook] '+e.message);}
    });
    app.get('/health',(_,r)=>r.json({ok:true,bot:MI_NOMBRE}));
    expressServer=app.listen(PUERTO,()=>log(`🚀 Webhook bot en puerto ${PUERTO}`));
    expressServer.on('error',(e)=>log(`⚠️ Puerto ${PUERTO} en uso: ${e.message}`));
  }

  // ── Ngrok ────────────────────────────────────────────────────
  async function iniciarNgrok(){
    if(!NGROK_AUTH_TOKEN)return;
    try{const ng=require('@ngrok/ngrok');const l=await ng.forward({addr:PUERTO,authtoken:NGROK_AUTH_TOKEN,domain:NGROK_DOMAIN||undefined});log(`✅ Ngrok: ${l.url()}/webhook-bot`);}
    catch(e){log('❌ Ngrok: '+e.message);}
  }

  // ── FIX SESIONES AISLADAS ────────────────────────────────────
  async function iniciar(){
    iniciarServidor();
    if(NGROK_AUTH_TOKEN)await iniciarNgrok();

    const userId = path.basename(sessionDir);
    // Directorio 100% aislado por usuario — sin compartir nada con otras instancias
    const waAuthPath = path.join(sessionDir, 'wa_auth');
    if(!fs.existsSync(waAuthPath))fs.mkdirSync(waAuthPath,{recursive:true});

    // CRÍTICO: LocalAuth NO es compatible con userDataDir en puppeteer.
    // LocalAuth gestiona su propio userDataDir internamente usando dataPath + clientId.
    // Estructura resultante: sessionDir/wa_auth/.wwebjs_auth/session-akira_{userId}/
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: `akira_${userId}`,
        dataPath:  waAuthPath,
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        // NO poner userDataDir aquí — LocalAuth lanza error si lo detecta
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    client.on('qr',(qr)=>{log('📱 QR generado — escaneá con WhatsApp');emitter.emit('qr',qr);});
    client.on('ready',()=>{log('✅ WhatsApp conectado y listo');emitter.emit('ready');reprogramarRecs();});
    client.on('message',async msg=>{try{await handleMessage(msg);}catch(e){log('❌ Error handleMessage: '+e.message);}});
    client.on('disconnected',r=>{log('⚠️ Desconectado: '+r);emitter.emit('disconnected',r);});
    client.on('auth_failure',m=>{log('❌ Auth failure: '+m);emitter.emit('error',new Error('Auth failure: '+m));});
    client.on('loading_screen',(pct,msg)=>{log(`⏳ Cargando WhatsApp: ${pct}% — ${msg}`);});

    log('🔄 Iniciando cliente WhatsApp...');
    await client.initialize();
  }

  async function detener(){
    for(const k of Object.keys(timeoutsRecs))clearTimeout(timeoutsRecs[k]);
    if(client){try{await client.destroy();}catch(e){log('destroy: '+e.message);}client=null;}
    if(expressServer){try{expressServer.close();}catch{}expressServer=null;}
    log('🛑 Bot detenido.');
    emitter.emit('stopped');
  }

  emitter.iniciar=iniciar;
  emitter.detener=detener;
  return emitter;
}

module.exports=crearAkiraBot;
