// Service worker mínimo de Akira (web): hace que el sitio se pueda instalar en el celular y muestra una pantalla amable si no hay internet.
// NO guarda la aplicación en caché a propósito: así nunca queda una versión vieja cuando se publica una actualización.
const OFFLINE = '/offline.html';
const CACHE = 'akira-offline-v1';

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // solo las páginas; todo lo demás va directo a la red
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
