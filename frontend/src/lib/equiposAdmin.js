// lib/equiposAdmin.js
// Formato de la sección "Equipos" del panel admin (GET /api/admin/users/:id/devices):
//   { devices: [{ id, nombre, version, canal, activadoEn, ultimoHeartbeat, estadoBot, revocado, ultimoErrorLicencia: {motivo,status,en}|null }] }
// Solo lectura. Todo es defensivo: el backend puede no estar publicado todavía o devolver campos vacíos.
// Funciones puras: probadas en desktop/tests/equipos-admin.test.js.

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const aMs = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : null; };

// "hace 5 min", "hace 3 h", "hace 2 días". Sin fecha válida: "nunca".
export function tiempoRelativo(fecha, ahoraMs = Date.now()) {
  const t = aMs(fecha);
  if (t === null) return 'nunca';
  const d = ahoraMs - t;
  if (d < -MIN) return 'en el futuro (reloj desfasado)';
  if (d < MIN) return 'hace instantes';
  if (d < HORA) return `hace ${Math.floor(d / MIN)} min`;
  if (d < DIA) return `hace ${Math.floor(d / HORA)} h`;
  const dias = Math.floor(d / DIA);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

export function fechaLarga(fecha) {
  const t = aMs(fecha);
  return t === null ? '—' : new Date(t).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

// La app manda 'store' (Microsoft Store) o 'exe' (instalador). Cualquier otro valor se muestra tal cual.
export function etiquetaCanal(canal) {
  const c = String(canal || '').trim().toLowerCase();
  if (!c) return 'Sin dato';
  if (c === 'store') return 'Microsoft Store';
  if (c === 'exe') return 'Instalador (.exe)';
  return String(canal);
}

const ESTADOS_BOT = {
  conectado: 'Conectado', caido: 'Caído', 'pc-sin-senal': 'PC sin señal', 'pausado-licencia': 'Pausado por licencia',
  detenido: 'Detenido', conectando: 'Conectando', desconocido: 'Sin información',
};
export function etiquetaEstadoBot(estado) {
  // Forma real que guarda la PC en Device.estadoBot: { slots: [{ slot, conectado, deseado }], pausado, vacaciones }.
  if (estado && typeof estado === 'object' && Array.isArray(estado.slots)) {
    const deseados = estado.slots.filter((s) => s && s.deseado);
    const conectados = deseados.filter((s) => s.conectado).length;
    let base;
    if (estado.pausado) base = 'Pausado por licencia';
    else if (!deseados.length) base = 'Detenido';
    else if (conectados === deseados.length) base = 'Conectado';
    else if (conectados > 0) base = `Conectado en ${conectados} de ${deseados.length} cuentas`;
    else base = 'Sin conectar';
    return estado.vacaciones === true ? `${base} (modo vacaciones)` : base;
  }
  const bruto = estado && typeof estado === 'object' ? (estado.estado ?? estado.resumen ?? '') : estado;
  const e = String(bruto ?? '').trim();
  if (!e) return 'Sin información';
  return ESTADOS_BOT[e.toLowerCase()] || e;
}

// Texto del último error de licencia, o null si no hay.
export function textoErrorLicencia(err, ahoraMs = Date.now()) {
  if (!err || typeof err !== 'object') return null;
  const partes = [];
  if (err.motivo) partes.push(String(err.motivo));
  if (err.status) partes.push(`HTTP ${err.status}`);
  if (!partes.length) return null;
  return `${partes.join(' · ')} (${tiempoRelativo(err.en, ahoraMs)})`;
}

// Devuelve la lista de equipos o null si la respuesta no tiene el formato esperado.
export function equiposDeRespuesta(data) {
  return data && Array.isArray(data.devices) ? data.devices : null;
}
