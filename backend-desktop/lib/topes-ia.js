// lib/topes-ia.js
// Topes diarios para lo que gasta la clave de IA (Groq) de la PLATAFORMA: soporte, demo de la web y sugerencias.
// Usan el limitador en la base (lib/limite.js), así valen para todas las instancias de Vercel (el limitador en memoria no). Son valores
// generosos a propósito: una persona real no los toca; solo frenan a un script o a una cuenta que dispara pedidos sin parar.
// Si la base falla, el limitador deja pasar y lo avisa en el log (mejor un gasto de más que dejar a todos sin soporte).
'use strict';

const { consumir } = require('./limite');

const HORA = 3600e3;

// Los valores se leen en cada pedido (los tests los bajan para no tener que mandar cientos de pedidos).
const TOPES_IA = {
  // Mensajes al chat de soporte por usuario y por día. Una consulta normal son 5-20 mensajes; 120 alcanza para una sesión larga de pruebas.
  // Solo cuenta cuando se responde con la clave de la plataforma: quien cargó su propia clave de Groq no gasta la nuestra.
  soporteUsuarioDia: 120,
  // Sugerencias por usuario y por día (cada una dispara un análisis con IA). Mismo máximo que ya se aplicaba contando documentos; acá es atómico.
  sugerenciasUsuarioDia: 5,
  // Mensajes al demo público de la landing por IP y por día. Una persona prueba el demo con 5-15 mensajes; el margen cubre varias personas detrás de
  // la misma IP (oficina, red móvil compartida). Se suma al límite en memoria de la ruta (20 cada 10 minutos).
  demoIpDia: 300,
};

// Día en Argentina (UTC-3), para que "por día" corte a la medianoche local y no a la del servidor.
const diaAR = (ahora = Date.now()) => new Date(ahora - 3 * HORA).toISOString().slice(0, 10);

// → { ok, n, reintentarEnSeg, falloBase? }. La clave lleva el día; el contador vence a las 30 h (más de lo que dura el día) y se borra solo.
function consumirTopeDia(prefijo, id, max, { Modelo, ahora = Date.now() } = {}) {
  return consumir(`${prefijo}:${id}:${diaAR(ahora)}`, { max, ventanaMs: 30 * HORA }, Modelo, ahora);
}

// Hasta la medianoche argentina (cuando el tope se renueva).
const segundosHastaMedianoche = (ahora = Date.now()) => Math.max(60, Math.ceil((86400e3 - ((ahora - 3 * HORA) % 86400e3)) / 1000));

function mensajeTope(que, ahora = Date.now()) {
  const h = Math.ceil(segundosHastaMedianoche(ahora) / 3600);
  return `Llegaste al máximo de ${que} de hoy. Se renueva en unas ${h} hora${h === 1 ? '' : 's'}.`;
}

module.exports = { TOPES_IA, consumirTopeDia, diaAR, mensajeTope, segundosHastaMedianoche };
