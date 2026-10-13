// services/bot/saludo.service.js
// Cuando el cliente solo saluda ("Hola", "Buenas tardes", "Hey, ¿qué tal?"), el bot responde con un saludo cálido y pregunta en qué puede
// ayudar, SIN pasar por la IA. Antes, un simple "Hola" podía terminar en una lista de horarios libres (el modelo llamaba a la herramienta de
// disponibilidad y el prompt de respuesta lo obligaba a listarlos todos), con un tono seco. Funciones puras: probadas en tests/saludo.test.js.
'use strict';

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Palabras que, solas o combinadas, son un saludo (no incluye "bien" ni "todo": "bien" suele ser una respuesta a otra cosa)
const NUCLEO = /^(hola+|holis|holi|ola|hey|buenas|buen|buenos|dia|dias|tarde|tardes|noche|noches|que|tal|como|estas|andas|va|vas|todo|bien)$/;
const CLAVE = /^(hola+|holis|holi|ola|hey|buenas|buen|buenos)$/;

// → true si el mensaje es solo un saludo (hasta 6 palabras, todas de saludo)
function esSoloSaludo(texto) {
  const limpio = sinTildes(texto).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio || limpio.length > 40) return false;
  const palabras = limpio.split(' ');
  if (palabras.length > 6 || !palabras.every((p) => NUCLEO.test(p))) return false;
  // "que tal" / "como estas" / "como andas" solos también son saludo; "bien" o "todo" solos, no
  if (palabras.some((p) => CLAVE.test(p))) return true;
  return /^(que tal|como estas|como andas|como va|como vas)( .*)?$/.test(limpio);
}

function saludoDelMomento(hora) {
  if (hora >= 6 && hora < 13) return '¡Buen día';
  if (hora >= 13 && hora < 20) return '¡Buenas tardes';
  return '¡Buenas noches';
}

// → texto del saludo. `conocido`: ya habló antes (historial con respuestas del bot) → saludo más corto.
function armarSaludo({ nombre = '', negocio = '', miNombre = '', conocido = false, ahora = new Date() } = {}) {
  const n = String(nombre || '').trim();
  const cabeza = `${saludoDelMomento(ahora.getHours())}${n ? `, ${n}` : ''}!`;
  if (conocido) return `${cabeza} 😊 ¿En qué te puedo ayudar hoy?`;
  const de = negocio ? ` de *${negocio}*` : miNombre ? ` de ${miNombre}` : '';
  return `${cabeza} 😊 Soy Akira, el asistente${de}. ¿En qué te puedo ayudar? Te puedo pasar precios y horarios, o reservarte un turno.`;
}

module.exports = { esSoloSaludo, armarSaludo, saludoDelMomento };
