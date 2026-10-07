// services/bot/copiloto.service.js
// Copiloto: cuando el dueño atiende un chat él mismo, le redacta un BORRADOR de respuesta usando lo que el negocio sabe
// (servicios, precios, horarios, su base de conocimiento y la charla). El dueño lo revisa, lo edita y recién ahí lo envía:
// el copiloto nunca manda nada solo. Lógica pura (el armado del pedido a la IA y la limpieza de lo que devuelve).
'use strict';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const ETQ = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };
const MAX_HISTORIAL = 10;

function textoHorarios(h) {
  if (!h || !Object.keys(h).length) return '';
  return DIAS.map((d) => {
    const x = h[d]; if (!x) return null;
    if (!x.activo) return `${ETQ[d]} cerrado`;
    const fr = Array.isArray(x.franjas) && x.franjas.length ? x.franjas : [{ inicio: x.inicio, fin: x.fin }];
    return `${ETQ[d]} ${fr.map((f) => `${f.inicio}–${f.fin}`).join(' y ')}`;
  }).filter(Boolean).join(' | ');
}

const resumirCliente = (c = {}) => [c.nombre && `Se llama ${c.nombre}`, (c.etiquetas || []).length && `Etiquetas: ${c.etiquetas.join(', ')}`, c.notas && `Notas del dueño: ${String(c.notas).slice(0, 300)}`, c.perfilResumen && `Lo que se sabe de él/ella: ${String(c.perfilResumen).slice(0, 300)}`].filter(Boolean).join('. ');

// → { ok, mensajes } | { ok:false, error }
function armarMensajes({ negocio, miNombre, servicios = [], horarios = '', catalogo = [], fragmentos = [], cliente = {}, historial = [], instruccion = '' }) {
  const charla = (historial || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() && !m.tool_calls).slice(-MAX_HISTORIAL);
  if (!charla.some((m) => m.role === 'user')) return { ok: false, error: 'Todavía no hay mensajes del cliente para responder.' };
  const lista = servicios.slice(0, 20).map((s) => `• ${s.nombre}: $${s.precio}${s.duracion ? ` (${s.duracion} min)` : ''}`).join('\n');
  const prods = catalogo.filter((p) => p.disponible !== false && p.precio > 0).slice(0, 20).map((p) => `• ${p.nombre}: $${p.precio}${p.stock >= 0 ? ` (stock ${p.stock})` : ''}`).join('\n');
  const conocimiento = fragmentos.map((f, i) => `[${i + 1}] ${String(f.texto || f).replace(/\s+/g, ' ').slice(0, 600)}`).join('\n');
  const sistema = [
    `Sos el asistente personal de ${miNombre || 'el dueño'}, dueño de "${negocio || 'un negocio'}". ${miNombre || 'El dueño'} va a responderle él mismo a un cliente por WhatsApp y te pide que le redactes UN borrador de respuesta, en primera persona como si fuera ${miNombre || 'él'}.`,
    'Reglas: tono cálido y natural de WhatsApp (español rioplatense), máximo 4 líneas, sin inventar precios, horarios ni políticas: usá SOLO la información de abajo. Si falta un dato para responder, escribí igual una respuesta amable y poné entre corchetes lo que el dueño debe completar, por ejemplo [confirmar horario]. Devolvé solo el texto del mensaje, sin comillas ni explicaciones.',
    horarios && `Horarios de atención: ${horarios}`,
    lista && `Servicios y precios:\n${lista}`,
    prods && `Productos:\n${prods}`,
    conocimiento && `Información del negocio (documento del dueño):\n${conocimiento}`,
    resumirCliente(cliente) && `Sobre el cliente: ${resumirCliente(cliente)}`,
    instruccion && `Indicación especial del dueño para este mensaje: ${String(instruccion).slice(0, 200)}`,
  ].filter(Boolean).join('\n\n');
  const mensajes = [{ role: 'system', content: sistema }, ...charla.map((m) => ({ role: m.role, content: String(m.content).slice(0, 600) }))];
  if (mensajes[mensajes.length - 1].role === 'assistant') mensajes.push({ role: 'user', content: '(El dueño quiere agregar algo más a lo último que se le dijo al cliente: redactá ese mensaje.)' });
  return { ok: true, mensajes };
}

// Saca comillas, prefijos tipo "Respuesta:", bloques de código y tags raros de lo que devuelve la IA.
function limpiarSugerencia(t) {
  let s = String(t ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*\n?|```/gi, '').trim();
  s = s.replace(/^(borrador|respuesta|mensaje|sugerencia)\s*:\s*/i, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('“') && s.endsWith('”'))) s = s.slice(1, -1).trim();
  return s.slice(0, 900);
}

module.exports = { armarMensajes, limpiarSugerencia, textoHorarios, MAX_HISTORIAL };
