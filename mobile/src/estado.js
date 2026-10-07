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

// Campos del resumen que mostramos, en orden (solo los que vinieron).
function lineasResumen(r) {
  if (!r) return [];
  const L = [
    ['mensajesHoy', 'Mensajes hoy', (v) => String(v)], ['turnosHoy', 'Turnos hoy', (v) => String(v)], ['turnosMes', 'Turnos del mes', (v) => String(v)],
    ['ingresosMes', 'Ingresos del mes', pesos], ['gastosMes', 'Gastos del mes', pesos], ['teDeben', 'Te deben', pesos], ['debes', 'Debés', pesos],
    ['clientes', 'Clientes', (v) => String(v)], ['documentosPendientes', 'Documentos sin revisar', (v) => String(v)],
  ];
  return L.filter(([k]) => r[k] !== undefined && r[k] !== null).map(([k, etiqueta, f]) => ({ clave: k, etiqueta, valor: f(r[k]) }));
}

module.exports = { describirBot, hace, pesos, accionesDisponibles, lineasResumen, ETIQUETAS, DETALLES };
