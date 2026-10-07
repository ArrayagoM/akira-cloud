// services/bot/resenas.service.js
// Reseñas después del servicio: al día siguiente el bot pregunta "¿cómo te fue?" (del 1 al 5). Si responde bien
// (4 o 5) le agradece y le pasa el enlace de Google; si responde mal (1 a 3) NO se le pide reseña pública:
// se le agradece y se le avisa al dueño en privado para que lo resuelva. Lógica pura.
'use strict';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:()"*_]/g, ' ').replace(/\s+/g, ' ').trim();
const PALABRAS = [
  [5, ['excelente', 'excelentisimo', 'genial', 'perfecto', 'perfecta', 'hermoso', 'hermosa', 'increible', 'espectacular', 'maravilloso', 'maravillosa', 'de diez', 'de 10', 'muy bueno', 'muy buena', 'muy bien', 'buenisimo', 'buenisima', 'fantastico', 'fantastica', 'la mejor', 'el mejor', 'encanto', 'me encanto']],
  [4, ['bueno', 'buena', 'bien', 'todo bien', 'contento', 'contenta', 'conforme', 'ok', 'okey', 'lindo', 'linda']],
  [3, ['regular', 'mas o menos', 'normal', 'maso', 'maomeno']],
  [2, ['malo', 'mala', 'mal', 'no me gusto', 'decepcionante', 'decepcion', 'flojo', 'floja']],
  [1, ['pesimo', 'pesima', 'horrible', 'terrible', 'desastre', 'nunca mas']],
];

// → { puntaje: 1..5 | null, comentario: '' }
function interpretarRespuesta(texto) {
  const t = norm(texto);
  if (!t) return { puntaje: null, comentario: '' };
  const m = /^([1-5])(?:\s*(?:\/\s*5|de\s*5|estrellas?|puntos?))?(?:\s+(.+))?$/.exec(t);
  if (m) return { puntaje: parseInt(m[1], 10), comentario: (m[2] || '').slice(0, 300) };
  if (/^(10|9|8)\b/.test(t)) return { puntaje: 5, comentario: '' }; // "10", "un 9": lo piensa sobre 10
  if (t.split(' ').length > 14) return { puntaje: null, comentario: '' }; // un mensaje largo es otra conversación
  // negaciones simples ("no estuvo bien", "no me gustó") invierten lo positivo
  const negado = /\b(no|nada|ni)\b/.test(t.replace(/\bno\s+me\s+gusto\b/, ' '));
  for (const [p, lista] of PALABRAS) {
    if (lista.some((w) => new RegExp(`(^|\\s)${w}(\\s|$)`).test(t))) {
      if (negado && p >= 4 && !/\bnada\s+mal\b/.test(t)) return { puntaje: 2, comentario: String(texto).trim().slice(0, 300) };
      return { puntaje: p, comentario: p <= 3 ? String(texto).trim().slice(0, 300) : '' };
    }
  }
  return { puntaje: null, comentario: '' };
}

const nombre1 = (n) => String(n || '').trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '').slice(0, 30);

function mensajePedido({ nombre, negocio }) {
  const n = nombre1(nombre);
  return `¡Hola${n ? ' ' + n : ''}! 😊 Soy Akira, de ${negocio || 'tu negocio de confianza'}. ¿Cómo te fue ayer? Contame del *1 al 5* (5 = excelente). Tu opinión nos ayuda a mejorar. 🙏`;
}

function respuestaAlCliente({ puntaje, nombre, link, dueno }) {
  const n = nombre1(nombre);
  if (puntaje >= 4) {
    return link
      ? `¡Qué alegría${n ? ', ' + n : ''}! 🙌 Gracias por contarnos. Si tenés un minuto, nos ayuda muchísimo que dejes tu opinión acá: ${link}`
      : `¡Qué alegría${n ? ', ' + n : ''}! 🙌 Gracias por contarnos, nos pone muy contentos. ¡Te esperamos pronto!`;
  }
  return `Gracias por contarnos${n ? ', ' + n : ''}. 🙏 Lamentamos que no haya sido la experiencia que esperabas. Le aviso a ${dueno || 'quien te atendió'} para mejorar y, si querés, para contactarte.`;
}

function avisoAlDueno({ puntaje, nombre, numero, comentario }) {
  const quien = `*${nombre || numero}*${nombre && numero ? ` (+${numero})` : ''}`;
  const estrellas = '⭐'.repeat(puntaje) + '☆'.repeat(5 - puntaje);
  const base = puntaje >= 4 ? `${estrellas} ${quien} calificó tu servicio con ${puntaje}/5 y se le pasó el link de Google.` : `⚠️ ${estrellas} ${quien} calificó con ${puntaje}/5. Conviene escribirle vos.`;
  return comentario ? `${base}\n_“${String(comentario).slice(0, 200)}”_` : base;
}

// ¿A qué turnos hay que pedirles reseña ahora? Confirmados, a los que vino, que terminaron hace entre `horas` y 48 h y sin pedido previo.
function turnosParaPedir(turnos, ahora, horas = 20) {
  const desde = ahora.getTime() - 48 * 3600e3; const hasta = ahora.getTime() - horas * 3600e3;
  return (turnos || []).filter((t) => {
    if (t.estado !== 'confirmado' || t.ausente === true || t.resenaEnviada) return false;
    const fin = new Date(t.fechaFin || t.fechaInicio).getTime();
    return !Number.isNaN(fin) && fin <= hasta && fin >= desde;
  });
}

// Solo se pregunta en horario razonable (no de madrugada).
const horaAdecuada = (ahora) => ahora.getHours() >= 9 && ahora.getHours() < 21;
const VIGENCIA_PEDIDO_MS = 72 * 3600e3; // pasado ese tiempo, una respuesta suelta ya no se toma como puntaje

module.exports = { interpretarRespuesta, mensajePedido, respuestaAlCliente, avisoAlDueno, turnosParaPedir, horaAdecuada, VIGENCIA_PEDIDO_MS, norm };
