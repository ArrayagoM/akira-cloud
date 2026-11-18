// Lógica pura de los turnos cargados a mano y de la vista del día por "puestos" (lugares o equipos de trabajo).
// Sin React ni red: se prueba con node en desktop/tests/turnos-manual-ui.test.js, que además compara estas reglas con las del
// servidor (desktop/main/gestion/turnos-manual.js) para que no se desalineen.

export const DURACIONES_RAPIDAS = [15, 30, 45, 60, 90, 120];
export const DURACION_MIN = 5;
export const DURACION_MAX = 1440;
export const LIM = { cliente: 80, telefono: 30, titulo: 120, detalle: 1000, puesto: 40 };
export const MAX_PUESTOS = 20;
export const AYUDA_PUESTOS = 'Si dos trabajos se hacen a la vez, ponelos en puestos distintos';

const MIN_DIA = 1440;

export function fechaValida(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return false;
  const y = +m[1];
  if (y < 2020 || y > 2100) return false;
  const d = new Date(Date.UTC(y, +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === y && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function horaValida(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s ?? ''));
}

export function duracionValida(v) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= DURACION_MIN && n <= DURACION_MAX;
}

// 'HH:mm' → minutos desde medianoche (NaN si no es válida)
export function aMinutos(hora) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hora ?? ''));
  return m ? +m[1] * 60 + +m[2] : NaN;
}
const aHora = (min) => {
  const t = ((min % MIN_DIA) + MIN_DIA) % MIN_DIA;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// Hora de fin ('HH:mm') de un trabajo que empieza a `hora` y dura `duracionMin`. Si cruza la medianoche, sigue en el día siguiente.
export function finDe(hora, duracionMin) {
  return aHora(aMinutos(hora) + Number(duracionMin));
}
export function cruzaMedianoche(hora, duracionMin) {
  return aMinutos(hora) + Number(duracionMin) >= MIN_DIA;
}

// Duración (minutos) a partir de las horas de inicio y fin del mismo turno. Si el fin es "antes" que el inicio, cruzó la medianoche.
export function duracionEntre(hora, horaFin) {
  const a = aMinutos(hora); const b = aMinutos(horaFin);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return b > a ? b - a : b + MIN_DIA - a;
}

// Intervalo [ini, fin) en minutos de un turno del día ({ hora, horaFin, duracionMin }). Usa la duración si viene; si no, las horas.
export function intervalo(t) {
  const ini = aMinutos(t?.hora);
  if (Number.isNaN(ini)) return null;
  const dur = Number(t?.duracionMin) > 0 ? Number(t.duracionMin) : duracionEntre(t?.hora, t?.horaFin);
  return { ini, fin: ini + (dur > 0 ? dur : 1) };
}
export const solapan = (a, b) => !!a && !!b && a.ini < b.fin && a.fin > b.ini;

export const nombreDePuesto = (puesto) => (puesto ? String(puesto) : 'General');

// Agrupa los turnos de un día por puesto: el General primero, después los demás por nombre. Cada grupo queda ordenado por hora.
export function agruparPorPuesto(turnos) {
  const mapa = new Map();
  for (const t of turnos || []) {
    const k = t.puesto || '';
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(t);
  }
  const porHora = (a, b) => (aMinutos(a.hora) || 0) - (aMinutos(b.hora) || 0);
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'es')))
    .map(([puesto, lista]) => ({ puesto, nombre: nombreDePuesto(puesto), turnos: lista.slice().sort(porHora) }));
}

// ¿Hay más de un puesto en uso este día? (si no, la vista queda como siempre)
export const hayParalelo = (turnos) => new Set((turnos || []).map((t) => t.puesto || '')).size > 1;

// id → lista de turnos con los que coincide en el tiempo (de cualquier puesto). Sirve para marcar "a la vez con…".
export function solapados(turnos) {
  const lista = (turnos || []).filter((t) => t && t._id).map((t) => ({ t, iv: intervalo(t) }));
  const salida = {};
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (solapan(lista[i].iv, lista[j].iv)) {
        (salida[lista[i].t._id] ||= []).push(lista[j].t);
        (salida[lista[j].t._id] ||= []).push(lista[i].t);
      }
    }
  }
  return salida;
}

// Validación del formulario (mismas reglas que el servidor). → { campo: 'mensaje' } ({} si está todo bien)
export function validarFormulario(f = {}) {
  const e = {};
  const linea = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const cliente = linea(f.clienteNombre);
  if (!cliente) e.clienteNombre = 'Poné el nombre del cliente.';
  else if (cliente.length > LIM.cliente) e.clienteNombre = `Hasta ${LIM.cliente} caracteres.`;
  const titulo = linea(f.titulo);
  if (!titulo) e.titulo = 'Contá qué trabajo es.';
  else if (titulo.length > LIM.titulo) e.titulo = `Hasta ${LIM.titulo} caracteres.`;
  const tel = linea(f.clienteTelefono);
  if (tel.length > LIM.telefono) e.clienteTelefono = `Hasta ${LIM.telefono} caracteres.`;
  else if (tel && !/^[\d\s+()\-.]+$/.test(tel)) e.clienteTelefono = 'Solo números, espacios y + - ( ).';
  if (String(f.detalle ?? '').trim().length > LIM.detalle) e.detalle = `Hasta ${LIM.detalle} caracteres.`;
  if (!fechaValida(f.fecha)) e.fecha = 'Elegí una fecha válida.';
  if (!horaValida(f.hora)) e.hora = 'Elegí una hora válida.';
  if (!duracionValida(f.duracionMin)) e.duracionMin = `Entre ${DURACION_MIN} y ${DURACION_MAX} minutos.`;
  const puesto = linea(f.puesto);
  if (puesto.length > LIM.puesto) e.puesto = `Hasta ${LIM.puesto} caracteres.`;
  const precio = String(f.precioInformativo ?? '').trim();
  if (precio) {
    const n = Number(precio.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 1e9) e.precioInformativo = 'Poné un número válido.';
  }
  return e;
}

// Nombre de puesto nuevo (para "Agregar puesto"): { ok, nombre } o { ok:false, error }
export function validarNombrePuesto(nombre, existentes = []) {
  const n = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  if (!n) return { ok: false, error: 'Escribí el nombre del puesto.' };
  if (n.length > LIM.puesto) return { ok: false, error: `Hasta ${LIM.puesto} caracteres.` };
  if (['general', 'principal', 'primary'].includes(n.toLowerCase())) return { ok: false, error: 'Ese nombre ya lo usa el puesto General.' };
  if (existentes.some((x) => String(x).toLowerCase() === n.toLowerCase())) return { ok: false, error: 'Ya existe un puesto con ese nombre.' };
  if (existentes.length >= MAX_PUESTOS) return { ok: false, error: `Podés tener hasta ${MAX_PUESTOS} puestos.` };
  return { ok: true, nombre: n };
}

// Cuerpo para el servidor a partir del formulario. En la edición solo se mandan los campos que cambiaron.
export function cuerpoDesdeFormulario(f, original = null) {
  const completo = {
    clienteNombre: f.clienteNombre, clienteTelefono: f.clienteTelefono, titulo: f.titulo, detalle: f.detalle,
    fecha: f.fecha, hora: f.hora, duracionMin: Number(f.duracionMin), puesto: f.puesto || '',
    profesionalId: f.profesionalId || '', precioInformativo: String(f.precioInformativo ?? '').trim() === '' ? null : String(f.precioInformativo).trim(),
  };
  if (!original) return completo;
  const cuerpo = {};
  for (const k of Object.keys(completo)) {
    if (String(completo[k] ?? '') !== String(original[k] ?? '')) cuerpo[k] = completo[k];
  }
  return cuerpo;
}

// Formulario inicial: de un turno existente (como lo devuelve /bot/agenda) o en blanco
export function formularioDe(turno, { fecha = '', hora = '', puesto = '' } = {}) {
  if (!turno) return { clienteNombre: '', clienteTelefono: '', titulo: '', detalle: '', fecha, hora, duracionMin: 60, puesto, profesionalId: '', precioInformativo: '' };
  return {
    clienteNombre: turno.nombre && turno.nombre !== 'Sin nombre' ? turno.nombre : '',
    clienteTelefono: turno.telefono || '', titulo: turno.titulo || '', detalle: turno.detalle || '',
    fecha: turno.fecha || fecha, hora: turno.hora || hora,
    duracionMin: turno.duracionMin > 0 ? turno.duracionMin : (duracionEntre(turno.hora, turno.horaFin) || 60),
    puesto: turno.puesto || '', profesionalId: turno.profesionalId || '',
    precioInformativo: turno.precioInformativo != null ? String(turno.precioInformativo) : '',
  };
}
