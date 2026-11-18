// src/estado.js — qué le mostramos al usuario según el estado que informa su PC. Lógica pura (sin React Native)
// para poder probarla con Node. El servidor ya resume el estado en: conectado | caido | pc-sin-senal |
// pausado-licencia | detenido | conectando | desconocido.
'use strict';

const DETALLES = {
  conectado: { titulo: 'Atendiendo', detalle: 'Tu bot está conectado a WhatsApp y respondiendo.', tono: 'ok' },
  conectando: { titulo: 'Reconectando…', detalle: 'El bot se está volviendo a conectar a WhatsApp. Suele tardar unos segundos.', tono: 'aviso' },
  detenido: { titulo: 'Bot detenido', detalle: 'El bot está apagado a propósito: no está respondiendo mensajes. Podés reanudarlo desde acá.', tono: 'aviso' },
  'pausado-licencia': { titulo: 'Pausado por la suscripción', detalle: 'Tu suscripción venció o hubo un problema con la licencia. Revisá tu plan en akiracloud.lat.', tono: 'error' },
  'pc-sin-senal': { titulo: 'La PC no da señales', detalle: 'Hace rato que la PC no se comunica: puede estar apagada o sin internet. Mientras tanto el bot no atiende.', tono: 'error' },
  desconocido: { titulo: 'Sin información todavía', detalle: 'Abrí Akira en tu PC (versión 1.0.16 o superior) para ver el estado acá.', tono: 'neutro' },
};

function describirBot(pc) {
  if (!pc) return DETALLES.desconocido;
  if (pc.bot === 'caido') {
    return pc.motivo === 'sesion'
      ? { titulo: 'Hay que vincular WhatsApp de nuevo', detalle: 'WhatsApp pidió escanear el QR otra vez. Abrí Akira en tu PC, entrá a Inicio y escaneá el código desde WhatsApp → Dispositivos vinculados.', tono: 'error' }
      : { titulo: 'El bot se cayó', detalle: 'Se desconectó de WhatsApp y no pudo volver solo. Revisá que la PC tenga internet y que Akira esté abierta.', tono: 'error' };
  }
  const d = DETALLES[pc.bot] || DETALLES.desconocido;
  return pc.vacaciones && pc.bot === 'conectado' ? { ...d, detalle: 'Conectado en modo vacaciones: avisa que no toma reservas por ahora.' } : d;
}

function hace(iso, ahora = new Date()) {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((new Date(ahora).getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'hace instantes';
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(h / 24); return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

const ETIQUETAS = { 'bot-pausar': 'Pausar el bot', 'bot-reanudar': 'Reanudar el bot', 'vacaciones-on': 'Activar modo vacaciones', 'vacaciones-off': 'Desactivar modo vacaciones' };

// ¿Qué botones corresponden según el estado?
function accionesDisponibles(pc) {
  if (!pc || !pc.online) return { puedePausar: false, puedeReanudar: false };
  return {
    puedePausar: pc.bot === 'conectado' || pc.bot === 'conectando',
    puedeReanudar: pc.bot === 'detenido',
  };
}


// ── Órdenes al bot (pausar / reanudar / vacaciones) ──
// El servidor devuelve las últimas 5 en cada /estado (pc.comandos: { id, tipo, estado, creadoEn }) con estado pendiente | hecho | fallo | vencido | cancelado.
// Ojo: /estado NO marca como vencidas las pendientes que ya pasaron su hora (eso lo hace solo la consulta de una orden puntual), así que el celular lo calcula.
const VENCE_ORDEN_MS = 10 * 60 * 1000; // igual que VENCE_MS de backend-desktop/lib/comandos.js: la PC tiene 10 min para retirar la orden
const AVISO_ORDEN_LENTA_MS = 90 * 1000; // pasado este tiempo sin respuesta se le avisa al usuario que la PC tarda

const ESTADOS_ORDEN = {
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
  hecho: { texto: 'Hecho', tono: 'ok' },
  vencido: { texto: 'Vencido', tono: 'error' },
  fallo: { texto: 'Falló', tono: 'error' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' },
  desconocido: { texto: 'Sin datos', tono: 'neutro' },
};

// Estado real de una orden: una "pendiente" que ya pasó su hora cuenta como vencida.
function estadoEfectivoOrden(c, ahora = new Date()) {
  const e = c && c.estado;
  if (e === 'pendiente') {
    const t = new Date(c.creadoEn).getTime();
    if (Number.isFinite(t) && new Date(ahora).getTime() > t + VENCE_ORDEN_MS) return 'vencido';
    return 'pendiente';
  }
  return ESTADOS_ORDEN[e] ? e : 'desconocido';
}

// Hora local del celular: "14:32" si es de hoy, "12/11 14:32" si es de otro día. Vacío si la fecha no sirve.
function horaCorta(iso, ahora = new Date()) {
  const d = new Date(iso); const n = new Date(ahora);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const dos = (x) => String(x).padStart(2, '0');
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  return d.toDateString() === n.toDateString() ? hora : `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${hora}`;
}

// Las últimas órdenes de una PC listas para mostrar, la más nueva primero. Un servidor sin `comandos` da lista vacía.
function ordenesRecientes(pc, ahora = new Date()) {
  const lista = pc && Array.isArray(pc.comandos) ? pc.comandos : [];
  return lista.filter((c) => c && typeof c.id === 'string').slice(-5).reverse().map((c) => {
    const estado = estadoEfectivoOrden(c, ahora); const e = ESTADOS_ORDEN[estado];
    return { id: c.id, tipo: c.tipo, texto: ETIQUETAS[c.tipo] || 'Orden', estado, etiqueta: e.texto, tono: e.tono, hora: horaCorta(c.creadoEn, ahora) };
  });
}

// Órdenes que todavía esperan a la PC (con tiempo de vida), para saber si hay que sondear rápido. Devuelve [{ id, tipo, edadMs }].
function ordenesPendientes(pcs, ahora = new Date()) {
  const ms = new Date(ahora).getTime(); const out = [];
  for (const pc of Array.isArray(pcs) ? pcs : []) {
    for (const c of (pc && Array.isArray(pc.comandos) ? pc.comandos : [])) {
      if (c && estadoEfectivoOrden(c, ahora) === 'pendiente') out.push({ id: c.id, tipo: c.tipo, edadMs: Math.max(0, ms - new Date(c.creadoEn).getTime() || 0) });
    }
  }
  return out;
}

// Lo que se le dice al usuario sobre una orden que mandó: { texto, tipo: 'ok' | 'error' | 'info' }.
function mensajeOrden(tipo, estado, edadMs = 0) {
  const nombre = (ETIQUETAS[tipo] || 'la orden').toLowerCase();
  if (estado === 'hecho') {
    if (tipo === 'bot-pausar') return { texto: 'Listo: el bot quedó apagado y no contesta a nadie hasta que lo reanudes.', tipo: 'ok' };
    if (tipo === 'bot-reanudar') return { texto: 'Listo: el bot volvió a atender.', tipo: 'ok' };
    if (tipo === 'vacaciones-on') return { texto: 'Listo: el modo vacaciones quedó activado.', tipo: 'ok' };
    if (tipo === 'vacaciones-off') return { texto: 'Listo: el modo vacaciones quedó desactivado.', tipo: 'ok' };
    return { texto: `Listo: ${nombre}.`, tipo: 'ok' };
  }
  if (estado === 'vencido') return { texto: 'La PC no respondió a tiempo, así que NO se hizo nada. Revisá que Akira esté abierta y con internet, y probá de nuevo.', tipo: 'error' };
  if (estado === 'fallo') return { texto: 'Tu PC recibió la orden pero no pudo cumplirla, así que NO se hizo. Probá de nuevo; si sigue igual, revisá Akira en la PC.', tipo: 'error' };
  if (estado === 'cancelado') return { texto: 'La orden se canceló porque mandaste la contraria. No se hizo.', tipo: 'info' };
  if (estado === 'pendiente') {
    return edadMs >= AVISO_ORDEN_LENTA_MS
      ? { texto: 'Tu PC todavía no respondió. La orden sigue esperando y, si la PC no la retira, vence sola a los 10 minutos sin hacerse.', tipo: 'info' }
      : { texto: 'Enviado. Esperando a tu PC (puede tardar hasta 1 minuto)…', tipo: 'info' };
  }
  return { texto: 'No se pudo saber qué pasó con la orden. Mirá el estado de tu bot y probá de nuevo.', tipo: 'error' };
}

// La orden en curso se guarda en sessionStorage como JSON { id, tipo, en } para seguirla si se recarga la página. Devuelve null si no sirve o ya venció.
function leerOrdenGuardada(raw, ahora = new Date()) {
  let o = null;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!o || typeof o.id !== 'string' || !o.id || typeof o.tipo !== 'string' || !Number.isFinite(o.en)) return null;
  const edad = new Date(ahora).getTime() - o.en;
  if (edad > VENCE_ORDEN_MS + 60 * 1000 || edad < -60 * 1000) return null;
  return { id: o.id, tipo: o.tipo, en: o.en };
}

// ── Cada cuánto se consulta al servidor ──
// PC y celular comparten un tope de pedidos por IP (300 cada 15 min), así que se consulta rápido solo cuando hace falta:
// pendiente (hay una orden esperando a la PC): cada 4 s el primer minuto, 8 s hasta los 3 min y 15 s después.
// mirando (tocó la pantalla hace poco): cada 10 s. En reposo (pantalla encendida pero sin tocarla): cada 30 s.
// Con la pestaña oculta devuelve null = no consultar (al volver se refresca de inmediato). Cada error seguido duplica la espera (hasta 2 min).
const SONDEO = { pendiente: [[60000, 4000], [180000, 8000], [Infinity, 15000]], mirando: 10000, reposo: 30000, maxError: 120000 };
function intervaloSondeo({ visible = true, pendiente = false, mirando = true, errores = 0, edadPendienteMs = 0 } = {}) {
  if (!visible) return null;
  let base = mirando ? SONDEO.mirando : SONDEO.reposo;
  if (pendiente) base = SONDEO.pendiente.find(([hasta]) => (Number(edadPendienteMs) || 0) < hasta)[1];
  const e = Math.max(0, Math.min(5, Math.floor(Number(errores) || 0)));
  return Math.min(SONDEO.maxError, base * 2 ** e);
}

// ── Último estado conocido, para mostrarlo cuando no hay conexión (public/offline.js lo lee de localStorage) ──
// Solo lo mínimo: nombre de la PC, cómo está el bot y cuándo dio señal. NUNCA los números del negocio, clientes ni chats.
const CLAVE_ULTIMO_ESTADO = 'akira.celular.ultimoEstado';
function instantaneaOffline(estado, ahoraMs = Date.now()) {
  const pcs = estado && Array.isArray(estado.pcs) ? estado.pcs : [];
  return {
    v: 1, en: ahoraMs,
    pcs: pcs.map((pc) => { const d = describirBot(pc); return { nombre: String((pc && pc.nombre) || 'Mi PC').slice(0, 60), titulo: d.titulo, detalle: d.detalle, tono: d.tono, ultimoHeartbeat: (pc && pc.ultimoHeartbeat) || null }; }),
  };
}

// ¿Los números del resumen siguen valiendo? La PC los manda apenas algo cambia (y como mínimo cada 10 minutos); si se apaga, pierde internet o se le vence la sesión, el
// último resumen queda guardado y se vería como si fuera de ahora (un "Mensajes hoy" de ayer, "Ingresos del mes" del mes pasado).
// Argentina es UTC-3 fijo (sin cambio horario): se calcula sin Intl para que ande igual en el celular.
const AR_MS = 3 * 60 * 60 * 1000;
const LIMITE_OBSOLETO_MIN = 40; // la PC reenvía como mínimo cada 10 min; 40 min sin novedades = algo pasa (igual que PC_SIN_SENAL_MS del servidor)
const CLAVES_HOY = ['mensajesHoy', 'turnosHoy'];
const CLAVES_MES = ['turnosMes', 'ingresosMes', 'gastosMes'];
const diaAR = (t) => new Date(new Date(t).getTime() - AR_MS).toISOString().slice(0, 10);

function vigenciaResumen(resumen, resumenEn, ahora = new Date()) {
  const t = resumenEn ? new Date(resumenEn).getTime() : NaN;
  if (!resumen || !Number.isFinite(t)) return { conocido: false, obsoleto: false, esDeHoy: false, esDelMes: false, edadMin: null };
  const edadMin = Math.max(0, Math.round((new Date(ahora).getTime() - t) / 60000));
  const hoy = diaAR(ahora);
  const mesDelResumen = /^\d{4}-\d{2}$/.test(String(resumen.mes || '')) ? resumen.mes : diaAR(t).slice(0, 7);
  return { conocido: true, obsoleto: edadMin > LIMITE_OBSOLETO_MIN, esDeHoy: diaAR(t) === hoy, esDelMes: mesDelResumen === hoy.slice(0, 7), edadMin };
}

// Texto para el usuario cuando los números no están al día (null si están al día).
function avisoResumen(vig, resumenEn, ahora = new Date()) {
  if (!vig || !vig.conocido || (!vig.obsoleto && vig.esDeHoy && vig.esDelMes)) return null;
  const ocultos = [!vig.esDeHoy && 'de “hoy”', !vig.esDelMes && '“del mes”'].filter(Boolean).join(' y ');
  return `Estos números no están al día: tu PC no los actualiza desde ${hace(resumenEn, ahora)}. ` +
    (ocultos ? `Ocultamos los ${ocultos} porque son de otro ${!vig.esDelMes ? 'mes' : 'día'}. ` : '') +
    'Abrí Akira en la PC (con internet y la sesión iniciada) y se corrigen solos.';
}

// Campos del resumen que mostramos, en orden (solo los que vinieron). Con `vig` (de vigenciaResumen) se ocultan los "de hoy" / "del mes" que ya son de otro día o mes.
function lineasResumen(r, vig) {
  if (!r) return [];
  const L = [
    ['mensajesHoy', 'Mensajes hoy', (v) => String(v)], ['turnosHoy', 'Turnos hoy', (v) => String(v)], ['turnosMes', 'Turnos del mes', (v) => String(v)],
    ['ingresosMes', 'Ingresos del mes', pesos], ['gastosMes', 'Gastos del mes', pesos], ['teDeben', 'Te deben', pesos], ['debes', 'Debés', pesos],
    ['clientes', 'Clientes', (v) => String(v)], ['documentosPendientes', 'Documentos sin revisar', (v) => String(v)],
  ];
  return L.filter(([k]) => r[k] !== undefined && r[k] !== null && !(vig && vig.conocido && ((!vig.esDeHoy && CLAVES_HOY.includes(k)) || (!vig.esDelMes && CLAVES_MES.includes(k))))).map(([k, etiqueta, f]) => ({ clave: k, etiqueta, valor: f(r[k]) }));
}

module.exports = {
  describirBot, hace, pesos, accionesDisponibles, lineasResumen, vigenciaResumen, avisoResumen, ETIQUETAS, DETALLES,
  VENCE_ORDEN_MS, AVISO_ORDEN_LENTA_MS, ESTADOS_ORDEN, estadoEfectivoOrden, horaCorta, ordenesRecientes, ordenesPendientes, mensajeOrden, leerOrdenGuardada, SONDEO, intervaloSondeo, CLAVE_ULTIMO_ESTADO, instantaneaOffline,
};
