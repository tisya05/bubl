// bubl service worker: shows notifications (Android needs one; so does an
// installed iPhone web app) and receives Web Push from the server
// (src/actions/push.ts). It caches nothing, so every deploy is picked up right away.
// Tapping a notification opens bubl (or focuses it) at the notification's page.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Every push must show a notification: iPhones cancel the subscription otherwise.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // bubl open on screen plays its own pop, so the phone's notification sound stays off.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const onScreen = windows.some((w) => w.visibilityState === 'visible');
      await self.registration.showNotification(data.title || 'bubl', {
        body: data.body || '',
        tag: data.tag,
        icon: '/bubl/icons/icon-192.png',
        badge: '/bubl/icons/icon-192.png',
        silent: onScreen,
        data: { url: data.url || '/home' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/home', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if (open.url !== url && 'navigate' in open) await open.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
