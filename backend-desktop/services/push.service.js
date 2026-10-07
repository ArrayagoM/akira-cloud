// services/push.service.js
// Notificaciones push al celular (Expo Push). Se usan para avisar al dueño por un canal que NO depende de su
// WhatsApp: el bot se cayó, volvió, la PC dejó de dar señales. Sin SDK: un POST a la API pública de Expo.
// El texto de la notificación nunca lleva datos de clientes: solo el estado del bot / de la PC.
'use strict';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;
const LOTE = 100;

const tokenValido = (t) => typeof t === 'string' && TOKEN_RE.test(t);

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

// Envía a todos los celulares activos del usuario y desactiva los que Expo reporta como dados de baja.
async function notificarUsuario(userId, payload, { MobileDevice = require('../models/MobileDevice'), enviarFn = enviar, opciones } = {}) {
  const lista = await MobileDevice.find({ userId, activo: true });
  if (!lista.length) return { enviados: 0, invalidos: [], errores: 0 };
  const r = await enviarFn(lista.map((d) => d.pushToken), payload, opciones);
  for (const to of r.invalidos) {
    const d = lista.find((x) => x.pushToken === to);
    if (d) { d.activo = false; await d.save(); }
  }
  return r;
}

module.exports = { enviar, notificarUsuario, tokenValido };
