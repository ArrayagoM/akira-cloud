// services/bot/derivacion.service.js
// Derivar a una persona: cuándo el bot debe dejar de contestar y avisarle al dueño, y qué se le cuenta.
//  · "pide-persona": el cliente pide hablar con una persona / con el dueño.
//  · "reclamo": el cliente está molesto o reclama (queja, estafa, devolución, "pésimo"…).
// Lógica pura y conservadora: preferimos no derivar de más (frases fuertes, no palabras sueltas).
'use strict';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:()"]/g, ' ').replace(/\s+/g, ' ').trim();

const PIDE_PERSONA = [
  'hablar con una persona', 'hablar con alguien', 'hablar con un humano', 'atencion humana', 'atencion personal',
  'hablar con el dueno', 'hablar con la duena', 'hablar con el encargado', 'hablar con la encargada', 'hablar con un asesor',
  'hablar con un representante', 'pasame con el dueno', 'pasame con la duena', 'pasame con el encargado', 'pasame con la encargada',
  'pasame con alguien', 'pasame con una persona', 'comunicame con el dueno', 'comunicame con la duena', 'comunicame con una persona',
  'no quiero hablar con un bot', 'no quiero hablar con un robot', 'no quiero hablar con una maquina',
];
const RECLAMO = [
  'quiero hacer un reclamo', 'quiero reclamar', 'tengo un reclamo', 'tengo una queja', 'quiero hacer una queja', 'presentar una queja', 'queja formal',
  'es una estafa', 'me estafaron', 'me estafaste', 'estafadores', 'me siento estafado', 'me siento estafada', 'voy a denunciar', 'los voy a denunciar', 'defensa del consumidor',
  'quiero que me devuelvan', 'quiero mi plata', 'devuelvanme la plata', 'devuelvanme el dinero', 'quiero la devolucion', 'quiero mi dinero',
  'pesimo servicio', 'pesima atencion', 'mal servicio', 'muy mal servicio', 'una verguenza', 'me cobraron de mas', 'me cobraron dos veces',
  'estoy muy enojado', 'estoy muy enojada', 'estoy harto', 'estoy harta', 'nunca mas vuelvo', 'jamas vuelvo',
];

function motivoDerivacion(texto, nombreDueno = '') {
  const t = ` ${norm(texto)} `;
  const dueno = norm(nombreDueno);
  const hay = (arr) => arr.some((f) => t.includes(` ${f}`));
  if (hay(RECLAMO)) return 'reclamo';
  if (hay(PIDE_PERSONA)) return 'pide-persona';
  if (dueno && (t.includes(` hablar con ${dueno}`) || t.includes(` pasame con ${dueno}`))) return 'pide-persona';
  return null;
}

const recorte = (s, n) => { const x = String(s ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };

// Últimos mensajes de la charla (solo texto de cliente y de Akira), para que el dueño sepa de qué se trata.
function resumenCharla(historial = [], max = 6) {
  const t = (historial || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() && !m.tool_calls);
  return t.slice(-max).map((m) => `${m.role === 'user' ? '👤' : '🤖'} ${recorte(m.content, 140)}`).join('\n');
}

function mensajeParaDueno({ nombre, numero, motivo, historial }) {
  const quien = `*${nombre || numero}*${nombre && numero ? ` (+${numero})` : ''}`;
  const cab = motivo === 'reclamo'
    ? `⚠️ ${quien} está *molesto/a o hizo un reclamo*. Conviene que le respondas vos.`
    : `👤 ${quien} quiere hablar con vos directamente. Respondele en WhatsApp.`;
  const charla = resumenCharla(historial);
  return charla ? `${cab}\n\n*Lo último de la charla:*\n${charla}\n\n_El bot dejó de responder ese chat por 30 min (o escribí "akira reactivate" ahí)._` : cab;
}

function respuestaAlCliente({ nombre, dueno, motivo }) {
  const n = nombre ? `, ${nombre}` : '';
  return motivo === 'reclamo'
    ? `Lamento mucho lo que pasó${n}. 🙏 Ya le avisé a ${dueno} para que te contacte personalmente y lo resuelva lo antes posible.`
    : `¡Dale${n}! Le aviso a ${dueno} para que te contacte. 🙌`;
}

module.exports = { motivoDerivacion, resumenCharla, mensajeParaDueno, respuestaAlCliente, norm };
