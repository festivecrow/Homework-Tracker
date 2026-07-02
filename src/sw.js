import { precacheAndRoute } from 'workbox-precaching';

// Precaches the app shell for offline support — same as before, just now
// living in a service worker we also control the push behavior of.
precacheAndRoute(self.__WB_MANIFEST);

// Take over immediately on install/activate instead of waiting for every
// open tab to close first. Without this, a new deploy can sit "installed"
// but never actually take effect until the browser decides to swap it in
// on its own — which on iOS can take a very long time or never happen
// while the app stays open in the background.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Fires when a push message arrives from the server, even if the app/tab
// isn't open. Shows a real system notification.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'The Clock', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'The Clock';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification focuses/opens the app instead of just dismissing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
