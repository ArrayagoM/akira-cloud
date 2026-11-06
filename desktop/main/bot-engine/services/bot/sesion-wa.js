// services/bot/sesion-wa.js
// Qué hacer cuando WhatsApp corta la conexión del bot: ¿borrar la vinculación (hay que escanear el QR de nuevo) o reintentar con la sesión guardada?
//
//  · 401 (cerrada desde el celular) y 440 (reemplazada por otro dispositivo): la vinculación ya no sirve → se borra.
//  · 500 ("sesión corrupta", casi siempre después de errores Bad MAC): ANTES se borraba siempre. Pero la mayoría de las veces las
//    credenciales guardadas están sanas y basta con reconectar; borrarlas obligaba a escanear el QR otra vez (pasó 6 veces entre el 6/10 y el
//    2/11/2026, cada vez más seguido). Ahora se reintenta con la sesión guardada y solo se borra si el 500 se repite sin que la conexión llegue
//    a estabilizarse (MAX_500 seguidos).
//  · Cualquier otro código (cortes de internet, 408, 428, 515…): nunca se borra, se reconecta.
// Función pura: probada en tests/sesion-wa.test.js.
'use strict';

const MAX_500 = 3;                 // 500 seguidos (sin una conexión estable en el medio) que hacen falta para dar la sesión por perdida
const ESTABLE_MS = 60 * 1000;      // una conexión que duró más de esto cuenta como sana: el próximo 500 vuelve a ser "el primero"

// previoSeguidos: 500 seguidos hasta ahora. abrioDesdeElUltimo: ¿hubo un 'open' desde el último 500? msAbierta: cuánto duró esa conexión.
// → { accion: 'borrar' | 'reintentar', seguidos, motivo }
function decidirDesconexion({ code, previoSeguidos = 0, abrioDesdeElUltimo = false, msAbierta = 0 } = {}) {
  if (code === 401) return { accion: 'borrar', seguidos: 0, motivo: 'cerrada' };
  if (code === 440) return { accion: 'borrar', seguidos: 0, motivo: 'reemplazada' };
  if (code === 500) {
    const sana = abrioDesdeElUltimo && msAbierta >= ESTABLE_MS;
    const seguidos = sana ? 1 : previoSeguidos + 1;
    return seguidos >= MAX_500 ? { accion: 'borrar', seguidos, motivo: 'corrupta-repetida' } : { accion: 'reintentar', seguidos, motivo: 'corrupta-primera' };
  }
  return { accion: 'reintentar', seguidos: previoSeguidos, motivo: 'transitoria' };
}

module.exports = { decidirDesconexion, MAX_500, ESTABLE_MS };
