// Service worker mínimo de Akira (web): hace que el sitio se pueda instalar en el celular, muestra una pantalla amable si no hay internet
// y recibe los avisos (push) de la app del celular: el bot se cayó / volvió. Los avisos nunca llevan datos de clientes.
// NO guarda la aplicación en caché a propósito: así nunca queda una versión vieja cuando se publica una actualización.
// Lo único que guarda es la pantalla "sin conexión" (offline.html + offline.js). Nunca toca ni guarda ninguna llamada a /api/*.
const OFFLINE = '/offline.html';
const OFFLINE_JS = '/offline.js';
const CACHE = 'akira-offline-v2'; // v2: offline.html ahora muestra el último estado conocido (carga offline.js). Al cambiar este nombre los usuarios reciben la versión nueva.

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 'reload' = pedirlas a la red sin pasar por la copia temporal del navegador, para guardar las de esta versión
    await c.add(new Request(OFFLINE, { cache: 'reload' }));
    // offline.js es un extra: si no se pudo bajar (o el servidor devolvió otra cosa) la pantalla sin conexión sigue andando con su texto simple
    try {
      const r = await fetch(new Request(OFFLINE_JS, { cache: 'reload' }));
      if (r.ok && /javascript/i.test(r.headers.get('content-type') || '')) await c.put(OFFLINE_JS, r);
    } catch { /* sin offline.js */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // la API va siempre directo a la red: ni se intercepta ni se guarda
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match(OFFLINE))); return; } // solo las páginas
  if (url.pathname === OFFLINE_JS) e.respondWith(caches.match(OFFLINE_JS).then((r) => r || fetch(req))); // el script de la pantalla sin conexión, de la copia guardada
  // todo lo demás va directo a la red
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
