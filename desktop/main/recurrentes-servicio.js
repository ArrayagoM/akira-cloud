// main/recurrentes-servicio.js
// Reloj de los gastos fijos: al abrir la app y cada hora carga los gastos que vencieron y avisa los vencimientos cercanos
// (al celular del dueño por WhatsApp). Si el bot no está conectado el aviso no se marca y sale en la próxima vuelta.
'use strict';

const recurrentes = require('./gestion/recurrentes');
const caja = require('./gestion/caja');

function crearServicio({ obtenerUserId, modelos, avisar, ahora = () => new Date(), setI = setInterval, log = () => {} }) {
  let timer = null; let enCurso = false;
  async function revisar() {
    if (enCurso) return { cargados: [], avisos: [], motivo: 'en-curso' };
    const uid = obtenerUserId(); if (!uid) return { cargados: [], avisos: [], motivo: 'sin-sesion' };
    enCurso = true;
    try {
      const r = await recurrentes.procesar(modelos, uid, { hoy: caja.fechaLocal(ahora()), avisar });
      if (r.cargados.length) log('[recurrentes] gastos cargados:', r.cargados.map((c) => c.descripcion).join(', '));
      return { ...r, motivo: 'ok' };
    } catch (e) { log('[recurrentes] FALLÓ', e.message); return { cargados: [], avisos: [], motivo: 'error', error: e.message }; } finally { enCurso = false; }
  }
  const programar = () => { setTimeout(() => revisar().catch(() => {}), 20000); timer = setI(() => { revisar().catch(() => {}); }, 60 * 60 * 1000); };
  const detener = () => { if (timer) clearInterval(timer); };
  return { revisar, programar, detener };
}

module.exports = { crearServicio };
