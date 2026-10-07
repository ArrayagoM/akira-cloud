// services/bot/conocimiento.service.js
// Base de conocimiento propia: el dueño sube su documento de preguntas frecuentes (políticas, formas de pago, cómo llegar,
// cuidados, etc.) y el bot lo usa para responder. Todo local: el documento se parte en fragmentos y, ante cada pregunta,
// se buscan por palabras clave los 2–3 más relevantes (BM25) y SOLO esos se le pasan a la IA. Lógica pura.
'use strict';

const STOP = new Set(('a al algo algun alguna algunas alguno algunos ante antes aqui asi aun cada como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estan estar este esto estos fue ha hacer han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otras otro otros para pero poco por porque que quien quienes se sea ser si sin sobre solo son su sus tambien tan tanto te tengo ti tiene tienen todo todos tu tus un una unas uno unos usted ustedes va vamos van ver vez voy y ya yo hola buenas buen dia dias tarde noche quiero quisiera queria necesito podria puedo puede gracias favor saber consulta consultar').split(' '));

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function tokens(texto) {
  return norm(texto).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 2 && !STOP.has(t)).map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t)); // plural simple
}

const MAX_FRAGMENTO = 700;

// Parte un texto largo en fragmentos de ~700 caracteres respetando párrafos y oraciones.
function fragmentar(texto, max = MAX_FRAGMENTO) {
  const limpio = String(texto ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!limpio) return [];
  const parrafos = limpio.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const salida = []; let actual = '';
  const volcar = () => { if (actual.trim()) salida.push(actual.trim()); actual = ''; };
  for (const p of parrafos) {
    if (p.length > max) {
      volcar();
      const oraciones = p.split(/(?<=[.!?:;])\s+/);
      for (const o of oraciones) {
        if (o.length > max) { for (let i = 0; i < o.length; i += max) { volcar(); actual = o.slice(i, i + max); volcar(); } continue; }
        if ((actual + ' ' + o).length > max) volcar();
        actual = actual ? `${actual} ${o}` : o;
      }
      volcar();
    } else {
      if ((actual + '\n\n' + p).length > max) volcar();
      actual = actual ? `${actual}\n\n${p}` : p;
    }
  }
  volcar();
  return salida;
}

// Devuelve los k fragmentos más relevantes para la consulta (BM25 simple sobre todos los documentos).
// docs: [{ _id, titulo, fragmentos: [string] }]  →  [{ docId, titulo, texto, puntaje }]
function buscar(docs, consulta, { k = 3, minimo = 0.45 } = {}) {
  const q = [...new Set(tokens(consulta))];
  if (!q.length) return [];
  const todos = [];
  for (const d of docs || []) for (const f of d.fragmentos || []) todos.push({ docId: String(d._id), titulo: d.titulo || '', texto: f, tk: tokens(`${d.titulo || ''} ${f}`) });
  if (!todos.length) return [];
  const N = todos.length; const prom = todos.reduce((s, f) => s + f.tk.length, 0) / N || 1;
  const df = new Map();
  for (const f of todos) for (const t of new Set(f.tk)) df.set(t, (df.get(t) || 0) + 1);
  const k1 = 1.4; const b = 0.75;
  const puntuados = todos.map((f) => {
    const tf = new Map(); for (const t of f.tk) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const t of q) {
      const n = tf.get(t) || 0; if (!n) continue;
      const idf = Math.log(1 + (N + 1 - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5)); // N+1: con un solo fragmento el idf no se anula
      score += idf * ((n * (k1 + 1)) / (n + k1 * (1 - b + b * (f.tk.length / prom))));
    }
    return { docId: f.docId, titulo: f.titulo, texto: f.texto, puntaje: Math.round(score * 100) / 100 };
  });
  return puntuados.filter((p) => p.puntaje >= minimo).sort((a, b) => b.puntaje - a.puntaje).slice(0, k);
}

// Texto que se agrega al prompt del bot. Vacío si no hay nada relevante.
function notaParaPrompt(fragmentos) {
  if (!fragmentos?.length) return '';
  const lista = fragmentos.map((f, i) => `[${i + 1}] ${f.texto.replace(/\s+/g, ' ').slice(0, MAX_FRAGMENTO)}`).join('\n');
  return `📚 INFORMACIÓN DEL NEGOCIO (documento propio del dueño). Si la pregunta del cliente se responde con esto, usala y no inventes nada más; si NO alcanza para responder, decile que consultás con el dueño y que le avisás:\n${lista}\n`;
}

// La consulta para buscar: último mensaje del cliente (si es muy corto, se le suma el anterior para tener contexto).
function consultaDesdeHistorial(historial) {
  const msgs = (historial || []).filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim()).map((m) => m.content.trim());
  if (!msgs.length) return '';
  const ult = msgs[msgs.length - 1];
  return tokens(ult).length < 3 && msgs.length > 1 ? `${msgs[msgs.length - 2]} ${ult}` : ult;
}

const LIMITES = { maxDocumentos: 10, maxCaracteresPorDoc: 200000, maxCaracteresTotal: 800000 };

module.exports = { tokens, fragmentar, buscar, notaParaPrompt, consultaDesdeHistorial, LIMITES, MAX_FRAGMENTO };
