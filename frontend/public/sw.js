// Service worker mínimo de Akira (web): hace que el sitio se pueda instalar en el celular, muestra una pantalla amable si no hay internet
// y recibe los avisos (push) de la app del celular: el bot se cayó / volvió. Los avisos nunca llevan datos de clientes.
// NO guarda la aplicación en caché a propósito: así nunca queda una versión vieja cuando se publica una actualización.
const OFFLINE = '/offline.html';
const CACHE = 'akira-offline-v1';

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // solo las páginas; todo lo demás va directo a la red
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

// ── Avisos ──
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* aviso sin datos */ }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Akira', {
    body: d.cuerpo || 'Tenés un aviso de tu bot.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: (d.datos && d.datos.tipo) || 'akira',
    data: { url: '/celular' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/celular';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
