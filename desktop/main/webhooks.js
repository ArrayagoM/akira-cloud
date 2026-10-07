// main/webhooks.js
// Webhooks de salida: cuando pasa algo en el negocio (una venta, un pedido pagado, un turno confirmado…) Akira le avisa a las direcciones que
// el dueño configuró (Zapier, Make, n8n, su propio sistema). Cada aviso va firmado con HMAC-SHA256 para que el receptor pueda comprobar que
// viene de Akira, y se reintenta si el destino no responde. Es OPCIONAL (apagado hasta que se agrega un destino).
// Probado en tests/webhooks.test.js.
//
// Importante: los avisos salen desde ESTA PC hacia afuera. Para que otras herramientas ESCRIBAN en Akira haría falta exponer la PC a internet,
// y eso no se hace: Akira solo informa.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EVENTOS = {
  'venta.registrada': 'Se registra una venta de mostrador',
  'pedido.pagado': 'Un pedido por WhatsApp se paga',
  'movimiento.creado': 'Se carga un ingreso o un gasto en la Caja',
  'comprobante.creado': 'Se crea un presupuesto o un recibo',
  'turno.confirmado': 'Un turno queda confirmado (pagado)',
};
const MAX_DESTINOS = 10;
const ESPERAS_REINTENTO_MS = [5_000, 30_000, 5 * 60_000];
const TIMEOUT_MS = 8000;
const MAX_ENTREGAS = 50;

const archivo = (dir) => path.join(dir, 'webhooks.json');
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function leer(dir) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(archivo(dir), 'utf8')); } catch { /* sin destinos */ }
  return { destinos: Array.isArray(j.destinos) ? j.destinos : [] };
}
const guardar = (dir, d) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(archivo(dir), JSON.stringify(d)); };

// La dirección tiene que ser https (o http solo hacia esta misma PC, para probar).
function urlValida(u) {
  try {
    const x = new URL(String(u));
    if (x.protocol === 'https:') return !x.username && !x.password;
    return x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname) && !x.username && !x.password;
  } catch { return false; }
}

// → { ok, dato } | { ok:false, error }
function sanear(b = {}, previo = {}) {
  const url = b.url !== undefined ? texto(b.url, 500) : previo.url;
  if (!urlValida(url)) return { ok: false, error: 'La dirección tiene que empezar con https:// (por seguridad no se aceptan otras).' };
  const eventos = b.eventos === undefined ? (previo.eventos || []) : [...new Set((Array.isArray(b.eventos) ? b.eventos : []).filter((e) => EVENTOS[e]))];
  if (!eventos.length) return { ok: false, error: 'Elegí al menos un evento para avisar.' };
  const nombre = texto(b.nombre ?? previo.nombre, 40) || new URL(url).hostname;
  return { ok: true, dato: { nombre, url, eventos, activo: b.activo === undefined ? previo.activo !== false : b.activo === true } };
}

const firmar = (secreto, cuerpo) => `sha256=${crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

function crearServicio({ userDataDir, fetchFn = (...a) => fetch(...a), esperar = (ms) => new Promise((r) => setTimeout(r, ms)), ahora = () => new Date(), log = () => {} }) {
  const entregas = []; // las últimas, para mostrar en pantalla (se pierden al cerrar la app)
  const anotar = (e) => { entregas.unshift(e); if (entregas.length > MAX_ENTREGAS) entregas.length = MAX_ENTREGAS; };

  async function enviarA(destino, evento, intentos = ESPERAS_REINTENTO_MS.length + 1) {
    const cuerpo = JSON.stringify(evento);
    const reg = { id: evento.id, destino: destino.nombre, destinoId: destino.id, tipo: evento.tipo, creadoEn: evento.creadoEn, estado: 'enviando', intentos: 0, codigo: null, error: '' };
    anotar(reg);
    for (let i = 0; i < intentos; i++) {
      reg.intentos = i + 1;
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        const r = await fetchFn(destino.url, { method: 'POST', redirect: 'manual', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Akira-Webhook/1', 'X-Akira-Evento': evento.tipo, 'X-Akira-Entrega': evento.id, 'X-Akira-Firma': firmar(destino.secreto, cuerpo) }, body: cuerpo });
        clearTimeout(t);
        reg.codigo = r.status;
        if (r.status >= 200 && r.status < 300) { reg.estado = 'entregado'; reg.error = ''; return reg; }
        reg.error = `El destino respondió ${r.status}`;
        if (r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 408) break; // un error del destino que no se arregla reintentando
      } catch (e) { reg.error = e.name === 'AbortError' ? 'El destino no respondió a tiempo' : `No se pudo conectar: ${e.message}`; }
      if (i < intentos - 1) { reg.estado = 'reintentando'; await esperar(ESPERAS_REINTENTO_MS[i]); }
    }
    reg.estado = 'fallido'; log(`[webhooks] falló ${evento.tipo} → ${destino.nombre}: ${reg.error}`);
    return reg;
  }

  // Avisa un evento a todos los destinos activos que lo pidieron. No espera ni rompe nada si algo falla.
  function emitir(tipo, datos = {}) {
    if (!EVENTOS[tipo]) return 0;
    const destinos = leer(userDataDir).destinos.filter((d) => d.activo !== false && d.eventos.includes(tipo));
    if (!destinos.length) return 0;
    const evento = { id: crypto.randomUUID(), tipo, creadoEn: ahora().toISOString(), datos };
    for (const d of destinos) enviarA(d, { ...evento, id: `${evento.id}` }).catch((e) => log('[webhooks] ' + e.message));
    return destinos.length;
  }

  async function probar(id) {
    const d = leer(userDataDir).destinos.find((x) => x.id === id);
    if (!d) return { ok: false, error: 'Destino no encontrado' };
    const reg = await enviarA(d, { id: crypto.randomUUID(), tipo: 'prueba', creadoEn: ahora().toISOString(), datos: { mensaje: 'Esto es una prueba de Akira: si lo ves, la conexión funciona.' } }, 1);
    return { ok: reg.estado === 'entregado', codigo: reg.codigo, error: reg.error };
  }

  // ── administración ──
  const publico = (d, conSecreto) => ({ id: d.id, nombre: d.nombre, url: d.url, eventos: d.eventos, activo: d.activo !== false, ...(conSecreto ? { secreto: d.secreto } : { secretoFin: d.secreto.slice(-4) }) });
  const lista = () => leer(userDataDir).destinos.map((d) => publico(d, false));
  function crear(b) {
    const r = sanear(b); if (!r.ok) return r;
    const d = leer(userDataDir);
    if (d.destinos.length >= MAX_DESTINOS) return { ok: false, error: `Llegaste al máximo de ${MAX_DESTINOS} destinos.` };
    const nuevo = { id: crypto.randomBytes(6).toString('hex'), ...r.dato, secreto: `whsec_${crypto.randomBytes(24).toString('hex')}`, creadoEn: ahora().toISOString() };
    d.destinos.push(nuevo); guardar(userDataDir, d);
    return { ok: true, destino: publico(nuevo, true) }; // el secreto se muestra una sola vez (después queda solo el final)
  }
  function actualizar(id, b) {
    const d = leer(userDataDir); const x = d.destinos.find((y) => y.id === id);
    if (!x) return { ok: false, error: 'Destino no encontrado', status: 404 };
    const r = sanear(b, x); if (!r.ok) return r;
    Object.assign(x, r.dato); guardar(userDataDir, d); return { ok: true };
  }
  function regenerarSecreto(id) {
    const d = leer(userDataDir); const x = d.destinos.find((y) => y.id === id);
    if (!x) return { ok: false, error: 'Destino no encontrado', status: 404 };
    x.secreto = `whsec_${crypto.randomBytes(24).toString('hex')}`; guardar(userDataDir, d);
    return { ok: true, destino: publico(x, true) };
  }
  function eliminar(id) { const d = leer(userDataDir); const n = d.destinos.length; d.destinos = d.destinos.filter((x) => x.id !== id); if (d.destinos.length === n) return { ok: false, error: 'Destino no encontrado', status: 404 }; guardar(userDataDir, d); return { ok: true }; }

  return { emitir, probar, lista, crear, actualizar, regenerarSecreto, eliminar, entregas: () => entregas.map((e) => ({ ...e })) };
}

module.exports = { crearServicio, EVENTOS, urlValida, sanear, firmar, MAX_DESTINOS, ESPERAS_REINTENTO_MS };
