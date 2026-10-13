// main/resumen-vivo.js
// "Tiempo real" para el celular y la web: en vez de esperar al latido de 15 minutos, la PC revisa cada pocos segundos si cambió algo
// (mensajes, turnos, caja, deudas, estado del bot) y, si cambió, manda el resumen enseguida. Solo si el usuario activó "Ver tu negocio desde el celular"
// (mismo permiso y mismos números que resumen-web.js: nunca nombres, teléfonos ni chats).
// Ritmo: rápido (cada 10 s como mínimo) mientras alguien está mirando la web o el celular; tranquilo (cada 60 s) si nadie mira.
// Vercel no mantiene conexiones abiertas (no hay WebSocket posible ahí): la PC empuja el cambio y la web/celular consultan cada pocos segundos.
'use strict';

// Lo que importa del estado del bot para detectar cambios (sin los contadores de tiempo, que cambian siempre).
function firmaEstado(e) {
  if (!e) return '';
  return JSON.stringify({ p: !!e.pausado, v: !!e.vacaciones, s: (e.slots || []).map((s) => [s.slot, !!s.conectado, !!s.deseado]) });
}

function crearServicio({
  activo, obtenerUserId, calcular, estadoBot, enviar,
  ahora = () => Date.now(), setI = setInterval, clearI = clearInterval,
  cadaMs = 10000, entreEnviosRapidoMs = 10000, entreEnviosCalmoMs = 60000, reenviarCadaMs = 10 * 60000, log = () => {},
}) {
  let timer = null; let ocupado = false;
  let ultimaFirma = null; let ultimoEnvio = 0; let mirando = false;

  async function tick() {
    if (ocupado) return { enviado: false, motivo: 'ocupado' };
    ocupado = true;
    try {
      if (!activo()) { ultimaFirma = null; return { enviado: false, motivo: 'apagado' }; }
      const uid = obtenerUserId();
      if (!uid) return { enviado: false, motivo: 'sin_sesion' };
      const resumen = await calcular(uid);
      const estado = await estadoBot(uid);
      const firma = JSON.stringify(resumen) + '|' + firmaEstado(estado);
      const t = ahora();
      const sinCambios = firma === ultimaFirma;
      if (sinCambios && t - ultimoEnvio < reenviarCadaMs) return { enviado: false, motivo: 'sin_cambios' };
      if (t - ultimoEnvio < (mirando ? entreEnviosRapidoMs : entreEnviosCalmoMs)) return { enviado: false, motivo: 'muy_pronto' };
      try {
        const r = await enviar({ resumen, estadoBot: estado });
        ultimaFirma = firma; ultimoEnvio = t; mirando = !!(r && r.mirando);
        return { enviado: true, mirando };
      } catch (e) {
        log('[resumen-vivo] no se pudo enviar (se reintenta):', e && e.message);
        return { enviado: false, motivo: 'error' };
      }
    } catch (e) {
      log('[resumen-vivo] falló el cálculo:', e && e.message);
      return { enviado: false, motivo: 'error' };
    } finally { ocupado = false; }
  }

  function iniciar() { if (!timer) { timer = setI(() => { tick().catch(() => {}); }, cadaMs); timer.unref?.(); } }
  function detener() { if (timer) { clearI(timer); timer = null; } }
  return { iniciar, detener, tick, estado: () => ({ mirando, ultimoEnvio }) };
}

module.exports = { crearServicio, firmaEstado };
