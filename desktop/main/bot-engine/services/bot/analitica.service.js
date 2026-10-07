// services/bot/analitica.service.js
// Análisis de conversaciones: qué preguntan más los clientes y en qué momentos el bot no supo responder, para que el dueño
// mejore su Conocimiento. Todo local y sin IA: temas por palabras clave y agrupación por parecido. Antes de guardar una pregunta
// se quitan teléfonos, mails, CBU/DNI y cualquier número largo (el análisis no necesita datos personales).
'use strict';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const TEMAS = [
  // Orden = prioridad ante un empate: los temas específicos ganan a los genéricos (turnos, productos, servicios).
  ['Reclamos', ['reclamo', 'queja', 'problema', 'mal servicio', 'estafa', 'devolucion', 'devolver', 'reembolso']],
  ['Cancelar o cambiar', ['cancelar', 'cancelo', 'reprogramar', 'cambiar el turno', 'cambiar turno', 'mover el turno', 'no puedo ir', 'posponer', 'reagendar']],
  ['Precios', ['precio', 'precios', 'cuanto sale', 'cuanto cuesta', 'cuanto es', 'cuanto cobran', 'valor', 'tarifa', 'cuanto vale', 'costo', 'presupuesto', 'sale el']],
  ['Medios de pago', ['pago', 'pagar', 'tarjeta', 'efectivo', 'transferencia', 'mercadopago', 'mercado pago', 'cuotas', 'debito', 'credito', 'seña', 'sena', 'alias', 'cbu', 'factura']],
  ['Horarios', ['horario', 'horarios', 'abren', 'cierran', 'hasta que hora', 'a que hora', 'abierto', 'sabado', 'domingo', 'feriado', 'feriados']],
  ['Ubicación', ['donde estan', 'ubicacion', 'direccion', 'como llego', 'como llegar', 'queda', 'estan ubicados', 'mapa', 'zona', 'barrio', 'estacionamiento']],
  ['Promos y descuentos', ['promo', 'promocion', 'descuento', 'oferta', 'combo', 'regalo', 'cupon', 'gratis', 'jubilados', 'estudiantes']],
  ['Pedidos y envíos', ['pedido', 'envio', 'envios', 'entrega', 'delivery', 'retiro', 'retirar', 'comprar']],
  ['Turnos y reservas', ['turno', 'turnos', 'reserva', 'reservar', 'agendar', 'disponibilidad', 'disponible', 'lugar', 'cupo', 'hueco', 'sacar un turno']],
  ['Productos y stock', ['producto', 'productos', 'stock', 'tienen', 'venden', 'hay', 'catalogo', 'marca', 'talle', 'color']],
  ['Servicios', ['servicio', 'servicios', 'hacen', 'trabajan', 'ofrecen', 'tratamiento', 'que incluye', 'en que consiste', 'duracion', 'cuanto dura']],
];

const FRASES_DUDA = ['no tengo esa informacion', 'no tengo ese dato', 'no tengo informacion', 'no cuento con', 'no estoy segur', 'no sabria', 'no se si', 'no puedo confirmarte', 'no tengo forma de', 'consulto con', 'consultarlo con', 'consultar con', 'le consulto', 'le aviso a', 'te aviso', 'te confirmo mas tarde', 'te escribe', 'te contacta', 'no pude entender', 'no entendi', 'ups tuve un problema', 'tuve un problema', 'tarde demasiado', 'mucha demanda'];
const SALUDO = /^(hola|buen[ao]s?|buen dia|buenas tardes|buenas noches|gracias|ok|dale|si|no|listo|perfecto|genial|chau|hasta luego|de nada|jaja+|jeje+)\b/;

// Saca teléfonos, mails y números largos (CBU, DNI, tarjetas) de un texto.
function anonimizar(t) {
  return String(t ?? '').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[mail]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[número]').replace(/\d{5,}/g, '[número]').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function clasificarTema(texto) {
  const t = ` ${norm(texto)} `;
  let mejor = null; let max = 0;
  for (const [tema, claves] of TEMAS) {
    // palabra completa = 2 puntos; solo el comienzo de una palabra ("color" en "coloración") = 1
    const n = claves.reduce((s, c) => s + (t.includes(` ${c} `) ? 2 : t.includes(` ${c}`) ? 1 : 0), 0);
    if (n > max) { max = n; mejor = tema; }
  }
  return mejor || 'Otras consultas';
}

const esPregunta = (texto) => {
  const t = norm(texto);
  if (!t || SALUDO.test(t) && t.split(' ').length <= 3) return false;
  return /\?/.test(String(texto)) || /^(cuanto|cuanta|cuantos|como|donde|cuando|que|quien|cual|cuales|hay|tienen|tenes|puedo|se puede|aceptan|hacen|atienden|abren|trabajan|venden)\b/.test(t) || t.split(' ').length >= 5;
};

// ¿El bot dudó o no supo? (sobre su respuesta) y la consulta era una pregunta real.
function noSupoResponder(pregunta, respuesta) {
  if (!esPregunta(pregunta)) return false;
  const r = norm(respuesta);
  return FRASES_DUDA.some((f) => r.includes(f));
}

// Palabras que no distinguen una pregunta de otra ("cuánto sale", "cuánto cuesta", "tienen", "hay"…)
const STOP = new Set('de la el los las un una unos unas y o a en por para con que es me te se lo al del mi tu su hola buenas buen dia tarde noche quiero quisiera queria podria puedo gracias favor cuanto cuanta cuantos sale cuesta vale cobran precio como donde cual cuales tienen tenes hacen hay saber consulta consultar necesito'.split(' '));
function tokensClave(texto) {
  const t = norm(anonimizar(texto)).split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
  return new Set(t);
}
const clave = (texto) => [...tokensClave(texto)].sort().join(' ');

// Agrupa preguntas parecidas ("cuánto sale el corte" ≈ "cuánto cuesta un corte de pelo") por palabras en común.
function agrupar(items) {
  const grupos = [];
  for (const it of items) {
    const tk = tokensClave(it.pregunta);
    const g = tk.size ? grupos.find((x) => { const comunes = [...tk].filter((w) => x.tokens.has(w)).length; return comunes >= 1 && comunes / Math.min(tk.size, x.tokens.size) >= 0.6; }) : null;
    if (g) { g.veces++; if (new Date(it.ts) > new Date(g.ultima)) { g.ultima = it.ts; g.pregunta = it.pregunta; } }
    else grupos.push({ tokens: tk, pregunta: it.pregunta, veces: 1, ultima: it.ts });
  }
  return grupos;
}

// docs: [{ ts, pregunta, tema, sinRespuesta }]
function resumir(docs, { dias = 30, ahora = Date.now() } = {}) {
  const desde = ahora - dias * 86400000;
  const lista = (docs || []).filter((d) => new Date(d.ts).getTime() >= desde);
  const porTema = new Map();
  for (const d of lista) {
    const t = porTema.get(d.tema) || { tema: d.tema, n: 0, ejemplos: new Map() };
    t.n++; t.ejemplos.set(d.pregunta, (t.ejemplos.get(d.pregunta) || 0) + 1);
    porTema.set(d.tema, t);
  }
  const limpia = (g) => ({ pregunta: g.pregunta, veces: g.veces, ultima: g.ultima });
  const repetidas = agrupar(lista.filter((d) => esPregunta(d.pregunta))).filter((g) => g.veces >= 2).map(limpia);
  const sinResp = agrupar(lista.filter((d) => d.sinRespuesta)).map(limpia);
  const total = lista.length; const sin = lista.filter((d) => d.sinRespuesta).length;
  return {
    dias, total, sinRespuesta: sin, porcentajeResuelto: total ? Math.round(((total - sin) / total) * 100) : null,
    temas: [...porTema.values()].sort((a, b) => b.n - a.n).map((t) => ({ tema: t.tema, n: t.n, porcentaje: total ? Math.round((t.n / total) * 100) : 0, ejemplos: [...t.ejemplos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p) })),
    masPreguntadas: repetidas.sort((a, b) => b.veces - a.veces).slice(0, 8),
    sinResponder: sinResp.sort((a, b) => b.veces - a.veces || new Date(b.ultima) - new Date(a.ultima)).slice(0, 12),
  };
}

const MAX_REGISTROS = 5000; const RETENCION_DIAS = 90;

module.exports = { anonimizar, clasificarTema, esPregunta, noSupoResponder, clave, resumir, MAX_REGISTROS, RETENCION_DIAS, TEMAS };
