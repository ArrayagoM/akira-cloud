// lib/ia-foto-producto.js
// Lee la foto de un producto (app del celular, antes de enviarlo) y sugiere nombre, categoría y descripción para que el dueño los revise y edite.
// Usa la clave de Groq de la plataforma (modelo con visión; cuesta una fracción de centavo por foto) y un tope por usuario (ver la ruta).
// Reglas: NUNCA devuelve precio ni stock; solo lo que se lee en el envase o se ve en la foto; si no se lee, todo vacío (no se inventa).
// El prompt y el saneado son los mismos que usa la PC como respaldo (desktop/main/ia-producto.js): si se cambia uno, cambiar el otro.
// Con la función de red inyectada para probarla sin internet (tests/ia-foto-producto.test.js).
'use strict';

const MODELOS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const PLAZO_MS = 9000; // la función del servidor tiene poco tiempo: un solo plazo para todos los intentos

const SISTEMA = [
  'Sos el asistente de carga de un catálogo de un comercio argentino. Te muestran la foto de UN producto.',
  'Devolvé SOLO un objeto JSON, sin texto antes ni después, con estas claves:',
  '{"legible": true|false, "nombre": "...", "categoria": "...", "descripcion": "..."}',
  'Reglas estrictas:',
  '- nombre: tipo de producto + marca + variante + contenido, tal como figura en el envase. Ej.: "Desodorante Rexona Men Active 150 ml". Máx. 80 caracteres.',
  '- categoria: una sola palabra o dos, genérica del rubro. Ej.: "Perfumería", "Almacén", "Bebidas", "Limpieza", "Indumentaria".',
  '- descripcion: una frase corta y objetiva (tipo, para quién/uso, contenido) basada SOLO en lo que se lee o se ve. Máx. 160 caracteres.',
  '- NO inventes: ni ingredientes, ni beneficios, ni propiedades, ni origen, ni datos que no estén visibles en la foto.',
  '- NO pongas precios, ofertas ni stock, aunque se vean en la foto.',
  '- Si no se lee o no se distingue qué producto es, devolvé "legible": false y los demás campos vacíos.',
  '- Escribí en español rioplatense neutro, sin emojis.',
].join('\n');

const sinClaves = (t) => String(t ?? '').replace(/gsk_[A-Za-z0-9_-]{6,}/g, 'gsk_***').replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer ***');

function limpiarTexto(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').replace(/["“”]+/g, '').trim().slice(0, max);
}

function extraerJson(texto) {
  const t = String(texto || '');
  const desde = t.indexOf('{'); const hasta = t.lastIndexOf('}');
  if (desde < 0 || hasta <= desde) return null;
  try { const o = JSON.parse(t.slice(desde, hasta + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}

// → { legible, nombre, categoria, descripcion }. Si el modelo mete un precio en un texto, se descarta ese campo.
function sanear(crudo) {
  const o = crudo && typeof crudo === 'object' ? crudo : {};
  const sinPrecio = (s) => (/\$\s*\d|\b\d+[.,]?\d*\s*(pesos|ars)\b/i.test(s) ? '' : s);
  const r = {
    legible: o.legible !== false && o.legible !== 'false',
    nombre: sinPrecio(limpiarTexto(o.nombre, 120)),
    categoria: sinPrecio(limpiarTexto(o.categoria, 60)),
    descripcion: sinPrecio(limpiarTexto(o.descripcion, 300)),
  };
  if (!r.legible || !r.nombre) return { legible: false, nombre: '', categoria: '', descripcion: '' };
  return r;
}

// → { ok:true, datos:{nombre,categoria,descripcion} } | { ok:false, motivo, codigo? }   (codigo: 'SIN_CLAVE' | 'CLAVE' | 'LIMITE' | 'ILEGIBLE' | 'FALLO')
async function analizarFoto({ base64, mime, apiKey, fetchFn = globalThis.fetch, plazoMs = PLAZO_MS, modelos = MODELOS } = {}) {
  if (!apiKey) return { ok: false, codigo: 'SIN_CLAVE', motivo: 'La lectura con IA no está disponible ahora.' };
  if (!base64) return { ok: false, codigo: 'FALLO', motivo: 'Falta la foto.' };
  const tipo = /^image\/(jpeg|png|webp)$/.test(mime || '') ? mime : 'image/jpeg';
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), plazoMs);
  try {
    let ultimo = 'FALLO';
    for (const modelo of modelos) {
      let resp;
      try {
        resp = await fetchFn(URL_GROQ, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
          body: JSON.stringify({
            model: modelo, max_tokens: 400, temperature: 0.1,
            messages: [
              { role: 'system', content: SISTEMA },
              { role: 'user', content: [{ type: 'text', text: 'Producto a cargar en el catálogo. Devolvé el JSON.' }, { type: 'image_url', image_url: { url: `data:${tipo};base64,${base64}` } }] },
            ],
          }),
        });
      } catch { return { ok: false, codigo: 'FALLO', motivo: 'La IA no respondió a tiempo. Escribí el nombre a mano.' }; }
      if (resp.status === 401 || resp.status === 403) return { ok: false, codigo: 'CLAVE', motivo: 'La lectura con IA no está disponible ahora.' };
      if (resp.status === 429) { ultimo = 'LIMITE'; continue; }   // cada modelo tiene su propio cupo: se prueba el otro
      if (resp.status === 404 || resp.status === 400) { ultimo = 'FALLO'; continue; } // modelo retirado o sin visión: se prueba el otro
      if (!resp.ok) { ultimo = 'FALLO'; continue; }
      let cuerpo; try { cuerpo = await resp.json(); } catch { ultimo = 'FALLO'; continue; }
      const datos = sanear(extraerJson(cuerpo && cuerpo.choices && cuerpo.choices[0] && cuerpo.choices[0].message && cuerpo.choices[0].message.content));
      if (!datos.legible) return { ok: false, codigo: 'ILEGIBLE', motivo: 'No pude distinguir qué producto es. Probá con otra foto más cerca o escribí el nombre.' };
      return { ok: true, datos: { nombre: datos.nombre, categoria: datos.categoria, descripcion: datos.descripcion } };
    }
    return { ok: false, codigo: ultimo, motivo: ultimo === 'LIMITE' ? 'La IA está muy ocupada. Probá en un minuto o escribí el nombre.' : 'No se pudo leer la foto. Escribí el nombre a mano.' };
  } finally { clearTimeout(timer); }
}

module.exports = { analizarFoto, extraerJson, sanear, sinClaves, MODELOS };
