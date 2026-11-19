// src/api.js — habla con el servidor de Akira (el mismo de la web y del programa). La app solo MONITOREA:
// el bot y los datos del negocio están en la PC. Si el servidor responde 401 con sesión iniciada, la sesión
// venció y se pide iniciar sesión de nuevo.
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { guardarSesion, leerSesion, borrarSesion } from './almacen';
import { REDIRECCION, verificadorDe, urlInicio, codigoDe, urlCanje } from './google';

export const URL_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://akira-licencias.vercel.app/api').replace(/\/+$/, '');

let token = null;
let alSesionVencida = () => {};
export const alVencerSesion = (fn) => { alSesionVencida = fn; };

async function pedir(ruta, { metodo = 'GET', cuerpo, conSesion = true } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (conSesion && token) headers.Authorization = `Bearer ${token}`;
  let r;
  try {
    r = await fetch(URL_BASE + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor. Revisá tu internet.'), { sinRed: true });
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && conSesion && token) { token = null; await borrarSesion(); alSesionVencida(); }
    throw Object.assign(new Error(datos.error || datos.errors?.[0]?.msg || 'Algo salió mal. Probá de nuevo.'), { status: r.status, codigo: datos.codigo });
  }
  return datos;
}

export async function restaurarSesion() {
  const s = await leerSesion();
  token = s?.token || null;
  return s;
}

export async function iniciarSesion(email, password) {
  const d = await pedir('/auth/login', { metodo: 'POST', cuerpo: { email: String(email).trim(), password }, conSesion: false });
  token = d.token;
  await guardarSesion({ token: d.token, nombre: d.user?.nombre || '', email: d.user?.email || String(email).trim() });
  return d;
}

// Ingreso con Google: abre el navegador del sistema, vuelve por akira://oauth y canjea el código con el verificador (PKCE).
// Devuelve null si la persona cerró el navegador sin terminar. Si algo falla, lanza un Error con un mensaje para mostrar.
export async function iniciarConGoogle() {
  const verificador = verificadorDe(await Crypto.getRandomBytesAsync(32));
  const desafio = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verificador); // hexadecimal
  const r = await WebBrowser.openAuthSessionAsync(urlInicio(URL_BASE, desafio), REDIRECCION);
  if (r.type !== 'success') return null;
  const codigo = codigoDe(r.url);
  if (!codigo) throw new Error('No se pudo completar el ingreso con Google. Probá de nuevo.');
  const d = await pedir(urlCanje(codigo, verificador), { conSesion: false });
  token = d.token;
  try {
    const yo = await pedir('/auth/me');
    await guardarSesion({ token: d.token, nombre: yo.user?.nombre || '', email: yo.user?.email || '' });
    return yo;
  } catch (e) { token = null; throw e; }
}

export async function cerrarSesion() { token = null; await borrarSesion(); }

export const leerEstado = () => pedir('/mobile/estado');
export const enviarComando = (deviceId, tipo) => pedir('/mobile/comandos', { metodo: 'POST', cuerpo: { deviceId, tipo } });
export const leerComando = (id, deviceId) => pedir(`/mobile/comandos/${encodeURIComponent(id)}?deviceId=${encodeURIComponent(deviceId)}`);
export const registrarCelular = (datos) => pedir('/mobile/registrar', { metodo: 'POST', cuerpo: datos });
export const quitarCelular = (pushToken) => pedir('/mobile/desregistrar', { metodo: 'POST', cuerpo: { pushToken } });
export const probarNotificacion = () => pedir('/mobile/prueba', { metodo: 'POST', cuerpo: {} });
export const leerAlertas = () => pedir('/auth/alertas');
export const guardarAlertas = (cambios) => pedir('/auth/alertas', { metodo: 'PUT', cuerpo: cambios });
