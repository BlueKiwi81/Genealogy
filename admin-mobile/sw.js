const CACHE = 'genealogy-admin-v7';
const SHELL = ['./','./index.html','./admin.css?v=1','./voice-note-v1.css?v=1','../mobile-readability-v1.css?v=1','./admin.js?v=3','./intelligent-review-v1.js?v=3','./resume-refresh-v1.js?v=1','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { title: 'Our Family History', body: event.data?.text() || 'Something needs your attention.' }; }
  const title = data.title || 'Our Family History';
  const options = {
    body: data.body || 'Something needs your attention.',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: data.tag || 'genealogy-admin',
    renotify: true,
    data: { url: data.url || './', eventId: data.eventId || null },
  };
  event.waitUntil((async () => {
    if ('setAppBadge' in self.registration) {
      try { await self.registration.setAppBadge(1); } catch { /* badge support is best effort */ }
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
