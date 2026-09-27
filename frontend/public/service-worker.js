const CACHE_NAME = 'smart-home-v1.5.0';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Push Notification Handler
self.addEventListener('push', (event) => {
  let data = { title: 'Smart Home Alert', body: 'New alert from Home Hub', icon: '/assets/icon-192.png' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('[ServiceWorker] Push data parse error', e);
  }

  const options = {
    body: data.body,
    icon: data.icon || '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    vibrate: [200, 100, 200],
    data: { timestamp: data.timestamp || Date.now() }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
