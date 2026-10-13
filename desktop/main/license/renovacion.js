// license/renovacion.js
// Renovación automática de la sesión: el guardián (cada 15 min) cambia la sesión por una nueva cuando le quedan menos de 20 días, así que
// mientras el programa se use la sesión no vence nunca y el bot no se pausa por "sesión vencida". Si la sesión ya venció, o es demasiado
// antigua (el servidor no renueva pasados 180 días desde que se ingresó con contraseña), no se puede renovar: el aviso le pide al usuario
// volver a ingresar. Probado en tests/sesion-renovar.test.js.
'use strict';

const DIA_MS = 24 * 60 * 60 * 1000;
const UMBRAL_DIAS = 20;

// Vencimiento del token en milisegundos (sin verificar la firma: eso lo hace el servidor), o null
function expiraDe(token) {
  try {
    const p = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Number(p.exp) ? Number(p.exp) * 1000 : null;
  } catch { return null; }
}

// → 'renovar' | 'ok' (todavía le queda mucho) | 'vencida' (ya no se puede renovar)
function estadoDeSesion(token, ahora = Date.now(), umbralDias = UMBRAL_DIAS) {
  const exp = expiraDe(token);
  if (!exp) return 'ok'; // un token sin vencimiento no se toca
  if (exp <= ahora) return 'vencida';
  return exp - ahora < umbralDias * DIA_MS ? 'renovar' : 'ok';
}

// sesion = { token, userId, email }. guardar(sesionNueva) la persiste; configurar(token) actualiza el cliente de licencias;
// avisar(token) se la pasa a la ventana (para que no siga usando la vieja). → { renovada, motivo }
async function renovarSiHaceFalta({ sesion, renovar, guardar, configurar, avisar, ahora = Date.now(), log = () => {} }) {
  const estado = estadoDeSesion(sesion?.token, ahora);
  if (estado === 'ok') return { renovada: false, motivo: 'no_hace_falta' };
  if (estado === 'vencida') return { renovada: false, motivo: 'vencida' };
  try {
    const r = await renovar();
    if (!r?.token || expiraDe(r.token) === null || expiraDe(r.token) <= ahora) return { renovada: false, motivo: 'respuesta_invalida' };
    guardar({ token: r.token, userId: sesion.userId, email: sesion.email });
    configurar(r.token);
    avisar?.(r.token);
    log('[sesion] sesión renovada');
    return { renovada: true, motivo: 'renovada' };
  } catch (e) {
    log('[sesion] no se pudo renovar:', e.status || '', e.message);
    return { renovada: false, motivo: e.status === 401 ? 'rechazada' : 'sin_conexion' };
  }
}

module.exports = { expiraDe, estadoDeSesion, renovarSiHaceFalta, UMBRAL_DIAS };
