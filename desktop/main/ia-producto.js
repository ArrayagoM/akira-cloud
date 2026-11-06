// main/ia-producto.js
// Lee la foto de un producto cargado desde el celular y sugiere nombre, categoría y descripción (IA con visión de Groq, con la clave
// que el propio cliente ya cargó en Config: no tiene costo para Akira). Reglas:
//  · NUNCA devuelve precio ni stock: eso lo pone siempre el dueño.
//  · Solo lo que se lee en el envase o se ve en la foto; si no se lee, el campo queda vacío (no se inventa).
//  · Nunca rompe la importación: ante cualquier problema devuelve { ok:false, motivo } y el producto se guarda igual con lo que mandó el celular.
//  · Tope por hora para no gastarle al cliente su cupo gratuito de Groq.
'use strict';

const MODELOS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
const MAX_POR_HORA = 40;
const VENTANA_MS = 60 * 60 * 1000;
const MAX_FOTO_B64 = 4 * 1024 * 1024; // Groq acepta hasta ~4 MB en base64

const sinClaves = (t) => String(t ?? '').replace(/gsk_[A-Za-z0-9_-]{6,}/g, 'gsk_***').replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer ***');

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

function limpiarTexto(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').replace(/["“”]+/g, '').trim().slice(0, max);
}

// Saca el JSON de la respuesta del modelo (a veces viene entre ```json ... ``` o con texto alrededor).
function extraerJson(texto) {
  const t = String(texto || '');
  const desde = t.indexOf('{'); const hasta = t.lastIndexOf('}');
  if (desde < 0 || hasta <= desde) return null;
  try { const o = JSON.parse(t.slice(desde, hasta + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}

// → { legible, nombre, categoria, descripcion } con todo saneado. Si el modelo mete un precio en un texto, se descarta ese campo.
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

function crearReconocedor({ obtenerClave, crearCliente = (apiKey) => { const Groq = require('groq-sdk'); return new Groq({ apiKey }); }, listarModelos, ahora = () => Date.now(), log = () => {} } = {}) {
  const usos = [];
  let modelo = null;
  const noExiste = (e) => e && (e.status === 404 || /model_not_found|decommissioned|does not exist/i.test(String(e.message)));
  const limite = (e) => e && (e.status === 429 || /rate.?limit/i.test(String(e.message)));

  // → { ok:true, datos:{ nombre, categoria, descripcion } } | { ok:false, motivo }
  return async function reconocer({ foto } = {}) {
    try {
      if (!foto || !foto.data) return { ok: false, motivo: 'sin foto' };
      if (String(foto.data).length > MAX_FOTO_B64) return { ok: false, motivo: 'foto muy pesada para la IA' };
      const apiKey = obtenerClave ? await obtenerClave() : '';
      if (!apiKey) return { ok: false, motivo: 'falta la clave de Groq en Config' };
      const t = ahora();
      while (usos.length && t - usos[0] >= VENTANA_MS) usos.shift();
      if (usos.length >= MAX_POR_HORA) return { ok: false, motivo: 'límite de lecturas por hora' };
      usos.push(t);

      const groq = crearCliente(apiKey);
      const mime = /^image\/(jpeg|png|webp)$/.test(foto.mime || '') ? foto.mime : 'image/jpeg';
      const mensajes = [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: [{ type: 'text', text: 'Producto a cargar en el catálogo. Devolvé el JSON.' }, { type: 'image_url', image_url: { url: `data:${mime};base64,${foto.data}` } }] },
      ];
      const orden = modelo ? [modelo, ...MODELOS.filter((x) => x !== modelo)] : [...MODELOS];
      let consultoLista = false; let ultimo = null;
      for (let i = 0; i < orden.length; i++) {
        try {
          const r = await groq.chat.completions.create({ model: orden[i], messages: mensajes, max_tokens: 400, temperature: 0.1 }, { timeout: 30_000, maxRetries: 0 });
          modelo = orden[i];
          const datos = sanear(extraerJson(r?.choices?.[0]?.message?.content));
          if (!datos.legible) return { ok: false, motivo: 'la IA no pudo leer qué producto es' };
          return { ok: true, datos: { nombre: datos.nombre, categoria: datos.categoria, descripcion: datos.descripcion } };
        } catch (e) {
          ultimo = e;
          if (limite(e)) { log('[ia-producto] límite de', orden[i], '→ pruebo otro modelo'); continue; }
          if (noExiste(e)) {
            if (!consultoLista) {
              consultoLista = true;
              try {
                const ids = await (listarModelos ? listarModelos(apiKey) : fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + apiKey } }).then(async (x) => (x.ok ? ((await x.json()).data || []).filter((m) => m.active !== false).map((m) => m.id) : [])));
                const extra = ids.find((id) => !orden.includes(id) && /llama-4|vision/i.test(id) && !/guard|whisper|tts/i.test(id));
                if (extra) orden.push(extra);
              } catch { /* sin lista de modelos */ }
            }
            continue;
          }
          throw e;
        }
      }
      throw ultimo || new Error('Sin modelo con visión disponible');
    } catch (e) {
      const msg = sinClaves(e && e.message);
      log('[ia-producto] no se pudo leer la foto:', msg);
      if (e && (e.status === 401 || e.status === 403)) return { ok: false, motivo: 'la clave de Groq no es válida' };
      return { ok: false, motivo: 'la IA no respondió' };
    }
  };
}

module.exports = { crearReconocedor, extraerJson, sanear, MAX_POR_HORA, MODELOS };
