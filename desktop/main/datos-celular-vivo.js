// main/datos-celular-vivo.js
// Mantiene al día la copia de los datos del negocio que el usuario eligió ver desde el celular (ver datos-celular.js).
// Cada pocos segundos revisa si cambió algo; si cambió, sube SOLO los tipos que cambiaron. Ritmo: rápido (cada 10 s como mínimo)
// mientras alguien está mirando desde el celular o la web; tranquilo (cada 60 s) si nadie mira. Aunque no cambie nada, cada 6 horas
// reenvía todo para que el servidor sepa que la PC sigue viva (a los 30 días sin novedades el servidor borra la copia).
// Si falla el envío, se reintenta en el próximo ciclo: nunca se pierde un cambio ni se rompe nada de la app.
'use strict';

function crearServicio({
  activo, tipos, obtenerUserId, calcular, enviar, huella,
  ahora = () => Date.now(), setI = setInterval, clearI = clearInterval,
  cadaMs = 20000, entreEnviosRapidoMs = 10000, entreEnviosCalmoMs = 60000, reenviarCadaMs = 6 * 3600 * 1000, log = () => {},
}) {
  let timer = null; let ocupado = false;
  let huellas = {}; let ultimoEnvio = 0; let mirando = false;

  async function tick() {
    if (ocupado) return { enviado: false, motivo: 'ocupado' };
    ocupado = true;
    try {
      if (!activo()) { huellas = {}; ultimoEnvio = 0; return { enviado: false, motivo: 'apagado' }; }
      const uid = obtenerUserId();
      if (!uid) return { enviado: false, motivo: 'sin_sesion' };
      const elegidos = tipos();
      for (const t of Object.keys(huellas)) if (!elegidos.includes(t)) delete huellas[t]; // un tipo que el usuario sacó deja de seguirse
      const datos = await calcular(uid, elegidos);
      const actuales = {}; for (const t of Object.keys(datos)) actuales[t] = huella(datos[t]);
      const cambiados = Object.keys(actuales).filter((t) => actuales[t] !== huellas[t]);
      const t0 = ahora();
      const hayQueReenviar = t0 - ultimoEnvio >= reenviarCadaMs;
      if (!cambiados.length && !hayQueReenviar) return { enviado: false, motivo: 'sin_cambios' };
      if (t0 - ultimoEnvio < (mirando ? entreEnviosRapidoMs : entreEnviosCalmoMs)) return { enviado: false, motivo: 'muy_pronto' };
      const aEnviar = hayQueReenviar ? Object.keys(datos) : cambiados;
      const paquete = {}; for (const t of aEnviar) paquete[t] = datos[t];
      try {
        const r = await enviar({ datos: paquete });
        for (const t of aEnviar) huellas[t] = actuales[t];
        ultimoEnvio = t0; mirando = !!(r && r.mirando);
        return { enviado: true, tipos: aEnviar, mirando };
      } catch (e) {
        log('[datos-celular] no se pudo enviar (se reintenta):', e && e.message); // nunca se registra el contenido
        return { enviado: false, motivo: 'error' };
      }
    } catch (e) {
      log('[datos-celular] falló el cálculo:', e && e.message);
      return { enviado: false, motivo: 'error' };
    } finally { ocupado = false; }
  }

  function iniciar() { if (!timer) { timer = setI(() => { tick().catch(() => {}); }, cadaMs); timer.unref?.(); } }
  function detener() { if (timer) { clearI(timer); timer = null; } }
  // Para que lo cambiado en los ajustes (activar, sacar un tipo) se aplique al próximo ciclo sin esperar los plazos.
  function reiniciarEstado() { huellas = {}; ultimoEnvio = 0; }
  return { iniciar, detener, tick, reiniciarEstado, estado: () => ({ mirando, ultimoEnvio }) };
}

module.exports = { crearServicio };
