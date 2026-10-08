// Avisos (notificaciones push) de la app instalada desde la web. Funcionan en Android y en iPhone con iOS 16.4 o
// superior, pero en iPhone SOLO si la web está instalada en la pantalla de inicio y se abre desde ahí.
export const soportaAvisos = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const esIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const estaInstalada = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

const aBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
const nombreDelCelular = () => (esIPhone() ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Navegador') + ' (web)';

async function suscripcionActual() {
  if (!soportaAvisos()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function avisosActivos() {
  if (!soportaAvisos() || Notification.permission !== 'granted') return false;
  return !!(await suscripcionActual());
}

// api = el cliente de la web (axios). Devuelve { ok, motivo }.
export async function activarAvisos(api) {
  if (!soportaAvisos()) {
    return { ok: false, motivo: esIPhone() && !estaInstalada()
      ? 'En iPhone, primero instalá Akira en la pantalla de inicio (Compartir → “Agregar a inicio”) y abrila desde ahí. Después volvé a tocar este botón.'
      : 'Este navegador no permite recibir avisos. Probá con Chrome (Android) o Safari instalada en el inicio (iPhone).' };
  }
  let clave;
  try { clave = (await api.get('/mobile/web-push/clave')).data?.clave; } catch { clave = null; }
  if (!clave) return { ok: false, motivo: 'Los avisos todavía no están habilitados en el servidor. Probá más tarde.' };
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'No diste permiso para las notificaciones. Podés activarlo en los ajustes del celular → Akira → Notificaciones.' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) }));
    await api.post('/mobile/registrar', { suscripcion: sub.toJSON(), nombre: nombreDelCelular() });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e?.response?.data?.error || 'No se pudo activar los avisos en este celular. Probá de nuevo.' };
  }
}

export async function desactivarAvisos(api) {
  const sub = await suscripcionActual();
  if (!sub) return;
  await api.post('/mobile/desregistrar', { pushToken: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
