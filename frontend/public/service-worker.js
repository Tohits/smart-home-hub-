const CACHE_NAME = 'smart-home-v1.5.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/favicon.ico',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Fast Cache-First strategy for UI assets, skipping API/Socket.IO
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API or Socket.IO requests
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.hostname.includes('onrender.com')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Background revalidation
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

// Push Notification Handler with Spam Prevention (Unique Tag & Renotify)
self.addEventListener('push', (event) => {
  let data = { title: 'Smart Home Hub', body: 'New alert from your Smart Home Hub', icon: '/assets/icon-192.png' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('[ServiceWorker] Push data parse error', e);
  }

  const notificationTag = 'shh-alert-' + Date.now();

  const options = {
    body: data.body,
    icon: data.icon || '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    tag: notificationTag,
    renotify: true,
    vibrate: [150, 50, 150],
    data: { timestamp: data.timestamp || Date.now() },
    actions: [
      { action: 'open', title: 'Open Dashboard 🏠' }
    ]
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
