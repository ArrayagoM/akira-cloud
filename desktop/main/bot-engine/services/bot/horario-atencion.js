// services/bot/horario-atencion.js
// ¿El negocio está abierto ahora? ¿Cuándo vuelve a abrir? Sirve para que el bot, fuera de horario, no
// prometa atención inmediata ("te respondemos mañana a las 9"). Lógica pura (mismo formato de horarios
// que calendar.service.js: por día { activo, inicio, fin } o { activo, franjas: [{ inicio, fin }] }).
'use strict';

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const LABEL = { domingo: 'el domingo', lunes: 'el lunes', martes: 'el martes', miercoles: 'el miércoles', jueves: 'el jueves', viernes: 'el viernes', sabado: 'el sábado' };
const aMin = (hhmm) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function franjasDelDia(horarios, dia) {
  const c = horarios?.[dia];
  if (!c || !c.activo) return [];
  const f = Array.isArray(c.franjas) && c.franjas.length ? c.franjas : [{ inicio: c.inicio || '09:00', fin: c.fin || '18:00' }];
  return f.map((x) => ({ ini: aMin(x.inicio), fin: aMin(x.fin) })).filter((x) => x.fin > x.ini).sort((a, b) => a.ini - b.ini);
}

// → { configurado, abierto, proxima: { cuando: 'hoy'|'mañana'|'el lunes', hora: '09:00', texto: 'hoy a las 17:00' } | null }
function estadoAhora(horarios, diasBloqueados = [], ahora = new Date()) {
  if (!horarios || !Object.keys(horarios).length) return { configurado: false, abierto: true, proxima: null };
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const bloqueado = (d) => Array.isArray(diasBloqueados) && diasBloqueados.includes(iso(d));

  if (!bloqueado(ahora) && franjasDelDia(horarios, DIAS[ahora.getDay()]).some((f) => minAhora >= f.ini && minAhora < f.fin)) return { configurado: true, abierto: true, proxima: null };

  for (let i = 0; i <= 14; i++) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + i);
    if (bloqueado(d)) continue;
    const f = franjasDelDia(horarios, DIAS[d.getDay()]).find((x) => i > 0 || x.ini > minAhora);
    if (!f) continue;
    const cuando = i === 0 ? 'hoy' : i === 1 ? 'mañana' : LABEL[DIAS[d.getDay()]];
    return { configurado: true, abierto: false, proxima: { cuando, hora: hhmm(f.ini), texto: `${cuando} a las ${hhmm(f.ini)}` } };
  }
  return { configurado: true, abierto: false, proxima: null };
}

// Línea para el prompt del bot (o '' si está abierto / no hay horarios / está en pausa).
function notaFueraDeHorario(horarios, diasBloqueados, ahora = new Date(), { modoPausa = false, dueno = 'el dueño' } = {}) {
  if (modoPausa) return '';
  const e = estadoAhora(horarios, diasBloqueados, ahora);
  if (!e.configurado || e.abierto) return '';
  const vuelve = e.proxima ? `Volvemos a atender ${e.proxima.texto}.` : 'Todavía no hay una próxima apertura cargada.';
  return `🌙 FUERA DE HORARIO: ahora el negocio está cerrado. ${vuelve} Podés seguir tomando turnos con normalidad, pero si el cliente necesita hablar con una persona, tiene una urgencia o una consulta que solo ${dueno} puede resolver, avisale con calidez que lo/la va a atender ${e.proxima ? e.proxima.texto : 'apenas abra'} (no prometas respuesta inmediata).\n`;
}

module.exports = { estadoAhora, notaFueraDeHorario, franjasDelDia };
