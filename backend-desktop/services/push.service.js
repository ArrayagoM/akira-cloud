// services/push.service.js
// Notificaciones push al celular: app nativa (Expo Push) y app web instalada (Web Push con claves VAPID, funciona
// en Android y en iPhone con iOS 16.4+ si se instala en la pantalla de inicio). Se usan para avisar al dueño por un canal que NO depende de su
// WhatsApp: el bot se cayó, volvió, la PC dejó de dar señales. Sin SDK: un POST a la API pública de Expo.
// El texto de la notificación nunca lleva datos de clientes: solo el estado del bot / de la PC.
'use strict';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;
const LOTE = 100;

const tokenValido = (t) => typeof t === 'string' && TOKEN_RE.test(t);

// ── Web Push (la app instalada desde la web) ──
const suscripcionValida = (s) => !!s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 2000
  && !!s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string' && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
const webPushDisponible = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

// → { enviados, invalidos: [endpoints que el servicio de push dio de baja], errores }
async function enviarWeb(subs, { titulo, cuerpo, datos = {} }, { webpush } = {}) {
  const salida = { enviados: 0, invalidos: [], errores: 0 };
  const lista = (subs || []).filter(suscripcionValida);
  if (!lista.length) return salida;
  let wp = webpush;
  if (!wp) {
    if (!webPushDisponible()) { salida.errores = lista.length; return salida; }
    wp = require('web-push');
    wp.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@akiracloud.lat', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  }
  const cuerpoJson = JSON.stringify({ titulo: String(titulo).slice(0, 80), cuerpo: String(cuerpo).slice(0, 200), datos });
  for (const sub of lista) {
    try { await wp.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, cuerpoJson, { TTL: 3600, urgency: 'high' }); salida.enviados++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) salida.invalidos.push(sub.endpoint); else salida.errores++; }
  }
  return salida;
}

// → { enviados, invalidos: [tokens que Expo dice que ya no existen], errores }
async function enviar(tokens, { titulo, cuerpo, datos = {}, canal = 'alertas' }, { fetchFn = globalThis.fetch, accessToken = process.env.EXPO_ACCESS_TOKEN } = {}) {
  const validos = [...new Set((tokens || []).filter(tokenValido))];
  const salida = { enviados: 0, invalidos: [], errores: 0 };
  for (let i = 0; i < validos.length; i += LOTE) {
    const lote = validos.slice(i, i + LOTE);
    try {
      const r = await fetchFn(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(lote.map((to) => ({ to, title: String(titulo).slice(0, 80), body: String(cuerpo).slice(0, 200), data: datos, sound: 'default', priority: 'high', channelId: canal }))),
      });
      const j = await r.json().catch(() => ({}));
      const tickets = Array.isArray(j.data) ? j.data : [];
      lote.forEach((to, k) => {
        const t = tickets[k];
        if (t?.status === 'ok') salida.enviados++;
        else if (t?.details?.error === 'DeviceNotRegistered') salida.invalidos.push(to);
        else salida.errores++;
      });
    } catch { salida.errores += lote.length; }
  }
  return salida;
}

// Envía a todos los celulares activos del usuario (app nativa y app web) y desactiva los que reportan baja.
async function notificarUsuario(userId, payload, { MobileDevice = require('../models/MobileDevice'), enviarFn = enviar, enviarWebFn = enviarWeb, opciones } = {}) {
  const lista = await MobileDevice.find({ userId, activo: true });
  const suma = { enviados: 0, invalidos: [], errores: 0 };
  if (!lista.length) return suma;
  const esWeb = (d) => d.plataforma === 'web' && !!d.suscripcion;
  const nativos = lista.filter((d) => !esWeb(d));
  const webs = lista.filter(esWeb);
  const rs = [];
  if (nativos.length) rs.push(await enviarFn(nativos.map((d) => d.pushToken), payload, opciones));
  if (webs.length) rs.push(await enviarWebFn(webs.map((d) => d.suscripcion), payload));
  for (const r of rs) { suma.enviados += r.enviados; suma.errores += r.errores; suma.invalidos.push(...r.invalidos); }
  for (const to of suma.invalidos) {
    const d = lista.find((x) => x.pushToken === to);
    if (d) { d.activo = false; await d.save(); }
  }
  return suma;
}

module.exports = { enviar, enviarWeb, notificarUsuario, tokenValido, suscripcionValida, webPushDisponible };
