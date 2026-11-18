// gestion/turnos-manual.js
// Turnos cargados a mano desde la Agenda y reprogramación / edición de los que ya existen.
// Lógica PURA (sin base de datos ni Express): validación y saneado, fecha y hora de Argentina (UTC-3 fijo, igual que el bot),
// duración, solapamiento y "puestos". Un puesto es un lugar o equipo de trabajo (Puesto 1, Box A, Sillón 2…): dos turnos pueden
// correr a la vez si están en puestos distintos; en el mismo puesto no pueden pisarse. Técnicamente el puesto es el calendarId del
// turno (el mismo campo que el bot usa para detectar choques), así que no hace falta migrar nada.
// Probado en tests/turnos-manual.test.js. La UI usa una copia mínima en frontend/src/lib/turnoManual.js (el test compara las dos).
'use strict';

const OFFSET_AR_H = 3; // Argentina es UTC-3 todo el año
const LIM = { cliente: 80, telefono: 30, titulo: 120, detalle: 1000, puesto: 40 };
const MAX_PUESTOS = 20;
const DURACION_MIN = 5;
const DURACION_MAX = 1440;
const PRECIO_MAX = 1e9;
// Nombres que significan "el puesto principal" (el calendario que usa el bot). 'primary' es el que usa el bot cuando no hay Google Calendar.
const NOMBRES_GENERAL = ['general', 'principal', 'primary'];

const ERR = (error) => ({ ok: false, error });
const esTextoPlano = (v) => v === undefined || v === null || typeof v === 'string' || typeof v === 'number';

// Una sola línea: sin saltos ni caracteres de control, espacios colapsados.
function linea(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
// Texto libre con renglones: conserva los saltos de línea (máximo 2 seguidos), saca caracteres de control.
function libre(v, max) {
  return String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

// 'YYYY-MM-DD' → { y, m, d } si es un día real del calendario (años 2020 a 2100), si no null
function parsearFecha(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const y = +m[1]; const mes = +m[2]; const d = +m[3];
  if (y < 2020 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mes - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d ? { y, m: mes, d } : null;
}
// 'HH:mm' → { h, min } o null
function parsearHora(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s ?? ''));
  return m ? { h: +m[1], min: +m[2] } : null;
}
// Fecha y hora de Argentina → Date (se guarda en UTC, igual que el resto de los turnos)
function aFechaUTC(fecha, hora) {
  const f = parsearFecha(fecha); const h = parsearHora(hora);
  if (!f || !h) return null;
  return new Date(Date.UTC(f.y, f.m - 1, f.d, h.h + OFFSET_AR_H, h.min, 0, 0));
}
// Date → { fecha:'YYYY-MM-DD', hora:'HH:mm' } en hora de Argentina
function aFechaAR(date) {
  const iso = new Date(new Date(date).getTime() - OFFSET_AR_H * 3600000).toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}
// Duración en minutos: entero entre 5 y 1440 (acepta "45" como texto). null si no sirve.
function parsearDuracion(v) {
  if (v === undefined || v === null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= DURACION_MIN && n <= DURACION_MAX ? n : null;
}
const calcularFin = (ini, duracionMin) => new Date(new Date(ini).getTime() + duracionMin * 60000);
const duracionDe = (ini, fin) => Math.round((new Date(fin) - new Date(ini)) / 60000);
const solapan = (aIni, aFin, bIni, bFin) => new Date(aIni) < new Date(bFin) && new Date(aFin) > new Date(bIni);

// Precio informativo (no entra a la Caja): vacío → null; si no, número entre 0 y mil millones
function parsearPrecio(v) {
  if (v === undefined || v === null || v === '') return { ok: true, valor: null };
  if (typeof v === 'boolean' || typeof v === 'object') return ERR('El precio no es válido.');
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > PRECIO_MAX) return ERR('El precio tiene que ser un número entre 0 y 1.000.000.000.');
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

// ── Puestos ──────────────────────────────────────────────────────────
// El calendario "general" es el que usa el bot: el idCalendar del negocio (descifrado) o 'primary' si no hay.
// Si no se puede descifrar, se usa 'primary' (el mismo valor por defecto del bot).
function calendarioGeneral(config, descifrar) {
  try {
    const v = config?.idCalendar && descifrar ? descifrar(config.idCalendar) : null;
    return v ? String(v) : 'primary';
  } catch { return 'primary'; }
}
const idsGenerales = (general) => [...new Set([general, 'principal', 'primary'])];
const esGeneral = (calendarId, general) => !calendarId || idsGenerales(general).includes(String(calendarId));
const nombrePuesto = (calendarId, general) => (esGeneral(calendarId, general) ? 'General' : String(calendarId));

// Lo que escribió la persona → el calendarId que se guarda. Vacío o "General" = el calendario del bot.
// Si ya existe un puesto con ese nombre (sin importar mayúsculas) se reutiliza tal cual está escrito.
function resolverPuesto(valor, { general, conocidos = [] } = {}) {
  if (!esTextoPlano(valor)) return ERR('El puesto no es válido.');
  const n = linea(valor, LIM.puesto + 1);
  if (n.length > LIM.puesto) return ERR(`El nombre del puesto puede tener hasta ${LIM.puesto} caracteres.`);
  if (!n || NOMBRES_GENERAL.includes(n.toLowerCase()) || n === general) return { ok: true, calendarId: general, esGeneral: true, nuevo: false };
  const ya = conocidos.find((c) => String(c).toLowerCase() === n.toLowerCase());
  return { ok: true, calendarId: ya || n, esGeneral: false, nuevo: !ya };
}

// Lista guardada de nombres de puestos → { ok, puestos } sin repetidos (ignora mayúsculas), máximo 20, 1 a 40 caracteres.
function validarPuestos(lista) {
  if (!Array.isArray(lista)) return ERR('La lista de puestos no es válida.');
  if (lista.length > MAX_PUESTOS) return ERR(`Podés tener hasta ${MAX_PUESTOS} puestos.`);
  const vistos = new Set(); const salida = [];
  for (const x of lista) {
    if (typeof x !== 'string') return ERR('Cada puesto tiene que ser un texto.');
    const n = linea(x, LIM.puesto + 1);
    if (!n) return ERR('Un puesto no puede estar vacío.');
    if (n.length > LIM.puesto) return ERR(`El nombre del puesto puede tener hasta ${LIM.puesto} caracteres.`);
    if (NOMBRES_GENERAL.includes(n.toLowerCase())) return ERR('Ese nombre ya lo usa el puesto principal ("General"). Elegí otro.');
    const k = n.toLowerCase();
    if (vistos.has(k)) return ERR(`El puesto "${n}" está repetido.`);
    vistos.add(k); salida.push(n);
  }
  return { ok: true, puestos: salida };
}

// Puestos para mostrar: el general siempre, los guardados y los que ya aparecen en turnos (menos los técnicos, como un id de Google).
// → [{ valor, nombre, general, turnos }]  (valor '' = general; es lo que se manda como "puesto")
function listarPuestos({ configurados = [], turnos = [], general, incluirDeTurnos = true }) {
  const cuentan = (c) => turnos.filter((t) => t.estado !== 'cancelado' && (esGeneral(t.calendarId, general) ? esGeneral(c, general) : String(t.calendarId) === String(c))).length;
  const salida = [{ valor: '', nombre: 'General', general: true, turnos: cuentan(general) }];
  const vistos = new Set(NOMBRES_GENERAL);
  const agregar = (n) => {
    const k = String(n).toLowerCase();
    if (vistos.has(k) || String(n) === general) return;
    vistos.add(k); salida.push({ valor: String(n), nombre: String(n), general: false, turnos: cuentan(n) });
  };
  configurados.forEach(agregar);
  if (incluirDeTurnos) {
    const otros = [...new Set(turnos.map((t) => t.calendarId).filter((c) => c && !esGeneral(c, general) && !String(c).includes('@') && String(c).length <= LIM.puesto))].sort((a, b) => String(a).localeCompare(String(b)));
    otros.forEach(agregar);
  }
  return salida;
}

// ── Choques ──────────────────────────────────────────────────────────
// calendarIds que cuentan como "el mismo puesto"
const idsDelPuesto = (calendarId, general) => (esGeneral(calendarId, general) ? idsGenerales(general) : [String(calendarId)]);

function buscarChoque(turnos, { ini, fin, calendarIds, excluirId = null }) {
  return turnos.find((t) => t.estado !== 'cancelado'
    && calendarIds.includes(String(t.calendarId || 'principal'))
    && String(t._id) !== String(excluirId ?? '')
    && solapan(ini, fin, t.fechaInicio, t.fechaFin)) || null;
}

function mensajeChoque(t, puesto) {
  const quien = linea(t.resumen || t.clienteNombre || 'otro turno', 60);
  const a = aFechaAR(t.fechaInicio).hora; const b = aFechaAR(t.fechaFin).hora;
  return `Ese horario ya lo ocupa "${quien}" (${a} a ${b}) en el puesto ${puesto}. Si los dos trabajos se hacen a la vez, ponelos en puestos distintos; si no, elegí otra hora.`;
}
const mensajeMismoInicio = (puesto) => `Ya hay un turno que empieza a esa misma hora en ${puesto ? `el puesto ${puesto}` : 'ese puesto'}. Probá con otro puesto o con otra hora.`;

// ── Alta ─────────────────────────────────────────────────────────────
// body: { clienteNombre, clienteTelefono?, titulo, detalle?, fecha:'YYYY-MM-DD', hora:'HH:mm', duracionMin (5 a 1440), puesto?, profesionalId?, precioInformativo? }
// Convención de duración: siempre `duracionMin` (no hay horaFin). El puesto y el profesional se resuelven afuera (necesitan la base).
// → { ok, dato: { clienteNombre, clienteTelefono, resumen, descripcion, fechaInicio, fechaFin, precioInformativo }, puesto: <lo pedido>, profesionalId }
function validarAlta(b = {}) {
  if (!b || typeof b !== 'object') return ERR('Faltan los datos del turno.');
  for (const k of ['clienteNombre', 'clienteTelefono', 'titulo', 'detalle', 'fecha', 'hora', 'puesto', 'profesionalId']) {
    if (!esTextoPlano(b[k])) return ERR('Alguno de los datos no es válido.');
  }
  const clienteNombre = linea(b.clienteNombre, LIM.cliente + 1);
  if (!clienteNombre) return ERR('Poné el nombre del cliente.');
  if (clienteNombre.length > LIM.cliente) return ERR(`El nombre del cliente puede tener hasta ${LIM.cliente} caracteres.`);
  const titulo = linea(b.titulo, LIM.titulo + 1);
  if (!titulo) return ERR('Contá qué trabajo es (por ejemplo "Corte" o "Revisión").');
  if (titulo.length > LIM.titulo) return ERR(`El trabajo puede tener hasta ${LIM.titulo} caracteres.`);
  const tel = sanearTelefono(b.clienteTelefono); if (!tel.ok) return tel;
  if (String(b.detalle ?? '').length > LIM.detalle * 2) return ERR(`El detalle puede tener hasta ${LIM.detalle} caracteres.`);
  const detalle = libre(b.detalle, LIM.detalle + 1);
  if (detalle.length > LIM.detalle) return ERR(`El detalle puede tener hasta ${LIM.detalle} caracteres.`);
  if (!parsearFecha(b.fecha)) return ERR('La fecha no es válida (año-mes-día).');
  if (!parsearHora(b.hora)) return ERR('La hora no es válida (formato 24 horas, por ejemplo 15:30).');
  const dur = parsearDuracion(b.duracionMin);
  if (dur === null) return ERR(`La duración tiene que ser un número entero de minutos, entre ${DURACION_MIN} y ${DURACION_MAX}.`);
  if (linea(b.puesto, LIM.puesto + 1).length > LIM.puesto) return ERR(`El nombre del puesto puede tener hasta ${LIM.puesto} caracteres.`);
  const precio = parsearPrecio(b.precioInformativo); if (!precio.ok) return precio;
  const ini = aFechaUTC(b.fecha, b.hora);
  return {
    ok: true,
    dato: { clienteNombre, clienteTelefono: tel.valor, resumen: titulo, descripcion: detalle, fechaInicio: ini, fechaFin: calcularFin(ini, dur), precioInformativo: precio.valor },
    puesto: b.puesto ?? '',
    profesionalId: b.profesionalId === undefined || b.profesionalId === null ? '' : String(b.profesionalId).slice(0, 80),
  };
}

function sanearTelefono(v) {
  if (!esTextoPlano(v)) return ERR('El teléfono no es válido.');
  const t = linea(v, LIM.telefono + 1);
  if (t.length > LIM.telefono) return ERR(`El teléfono puede tener hasta ${LIM.telefono} caracteres.`);
  if (t && !/^[\d\s+()\-.]+$/.test(t)) return ERR('El teléfono solo puede tener números, espacios y + - ( ).');
  return { ok: true, valor: t };
}

// ── Edición ──────────────────────────────────────────────────────────
const CAMPOS_EDICION = ['clienteNombre', 'clienteTelefono', 'titulo', 'resumen', 'detalle', 'descripcion', 'fecha', 'hora', 'duracionMin', 'puesto', 'profesionalId', 'precioInformativo'];
const CAMPOS_HORARIO = ['fecha', 'hora', 'duracionMin', 'puesto'];
const hayEdicion = (b) => !!b && typeof b === 'object' && CAMPOS_EDICION.some((k) => b[k] !== undefined);

// previo = turno guardado. Solo se cambia lo que viene en el body; lo demás queda como está.
// → { ok, set:{campos del turno}, horario:{ ini, fin, puesto(lo pedido|undefined) , cambia } | null, profesionalId: undefined|string }
//   `cambia` es true solo si el horario o el puesto realmente son distintos de los actuales (mandar lo mismo no cuenta como reprogramar).
function validarEdicion(b = {}, previo = {}, { general } = {}) {
  for (const k of CAMPOS_EDICION) if (!esTextoPlano(b[k])) return ERR('Alguno de los datos no es válido.');
  const set = {};
  if (b.clienteNombre !== undefined) {
    const n = linea(b.clienteNombre, LIM.cliente + 1);
    if (!n) return ERR('El nombre del cliente no puede quedar vacío.');
    if (n.length > LIM.cliente) return ERR(`El nombre del cliente puede tener hasta ${LIM.cliente} caracteres.`);
    set.clienteNombre = n;
  }
  if (b.clienteTelefono !== undefined) { const t = sanearTelefono(b.clienteTelefono); if (!t.ok) return t; set.clienteTelefono = t.valor; }
  const tituloIn = b.titulo !== undefined ? b.titulo : b.resumen;
  if (tituloIn !== undefined) {
    const n = linea(tituloIn, LIM.titulo + 1);
    if (!n) return ERR('El trabajo no puede quedar vacío.');
    if (n.length > LIM.titulo) return ERR(`El trabajo puede tener hasta ${LIM.titulo} caracteres.`);
    set.resumen = n;
  }
  const detalleIn = b.detalle !== undefined ? b.detalle : b.descripcion;
  if (detalleIn !== undefined) {
    if (String(detalleIn ?? '').length > LIM.detalle * 2) return ERR(`El detalle puede tener hasta ${LIM.detalle} caracteres.`);
    const d = libre(detalleIn, LIM.detalle + 1);
    if (d.length > LIM.detalle) return ERR(`El detalle puede tener hasta ${LIM.detalle} caracteres.`);
    set.descripcion = d;
  }
  if (b.precioInformativo !== undefined) { const p = parsearPrecio(b.precioInformativo); if (!p.ok) return p; set.precioInformativo = p.valor; }

  let horario = null;
  if (CAMPOS_HORARIO.some((k) => b[k] !== undefined)) {
    const act = aFechaAR(previo.fechaInicio);
    const fecha = b.fecha !== undefined ? b.fecha : act.fecha;
    const hora = b.hora !== undefined ? b.hora : act.hora;
    if (!parsearFecha(fecha)) return ERR('La fecha no es válida (año-mes-día).');
    if (!parsearHora(hora)) return ERR('La hora no es válida (formato 24 horas, por ejemplo 15:30).');
    const durActual = duracionDe(previo.fechaInicio, previo.fechaFin);
    const dur = parsearDuracion(b.duracionMin !== undefined ? b.duracionMin : durActual);
    if (dur === null) return ERR(`La duración tiene que ser un número entero de minutos, entre ${DURACION_MIN} y ${DURACION_MAX}.`);
    const ini = aFechaUTC(fecha, hora);
    const fin = calcularFin(ini, dur);
    const cambiaHora = ini.getTime() !== new Date(previo.fechaInicio).getTime() || fin.getTime() !== new Date(previo.fechaFin).getTime();
    horario = { ini, fin, puesto: b.puesto, cambiaHora };
  }
  return { ok: true, set, horario, profesionalId: b.profesionalId === undefined ? undefined : (b.profesionalId === null ? '' : String(b.profesionalId).slice(0, 80)) };
}

// Los campos del profesional que se guardan en el turno (los mismos que escribe /app/profesionales/asignar)
const camposProfesional = (p) => (p ? { profesionalId: String(p._id), profesionalNombre: p.nombre, comisionPct: p.comisionPct || 0 } : { profesionalId: '', profesionalNombre: '', comisionPct: null });

module.exports = {
  LIM, MAX_PUESTOS, DURACION_MIN, DURACION_MAX, NOMBRES_GENERAL, CAMPOS_EDICION, CAMPOS_HORARIO,
  linea, libre, parsearFecha, parsearHora, aFechaUTC, aFechaAR, parsearDuracion, calcularFin, duracionDe, solapan, parsearPrecio,
  calendarioGeneral, idsGenerales, esGeneral, nombrePuesto, resolverPuesto, validarPuestos, listarPuestos, idsDelPuesto,
  buscarChoque, mensajeChoque, mensajeMismoInicio, validarAlta, validarEdicion, hayEdicion, camposProfesional,
};
