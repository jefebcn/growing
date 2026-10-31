/* Chill Sander House: service worker solo per le notifiche push (nessuna cache, il sito resta sempre aggiornato). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { body: event.data ? event.data.text() : '' }; }
  const opts = {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || './' }
  };
  if (d.image) opts.image = d.image;
  event.waitUntil(self.registration.showNotification(d.title || 'Chill Sander House', opts));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) {
        try { await c.focus(); c.postMessage({ type: 'nav', url }); return; } catch (_) {}
      }
    }
    await self.clients.openWindow(url);
  })());
});
