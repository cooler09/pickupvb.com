/**
 * Service worker for web push notifications.
 *
 * Lifecycle:
 *  - `install` → activate immediately (skipWaiting) so first registration
 *    doesn't require a reload.
 *  - `activate` → claim all clients.
 *  - `push` → parse JSON payload sent by the server, show a notification.
 *  - `notificationclick` → focus an existing tab on the target URL or open
 *    a new one.
 *
 * Payload shape (must match `WebPushPayload` in lib/web-push.ts):
 *   { title: string; body: string; href?: string; tag?: string }
 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'PickupVB', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'PickupVB';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: { href: data.href || '/' },
    tag: data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        try {
          const url = new URL(client.url);
          if (url.pathname === href && 'focus' in client) return client.focus();
        } catch {}
      }
      return self.clients.openWindow(href);
    }),
  );
});
