/* global self, caches */
// Jackdaw's service worker. It makes the app installable and keeps a page on screen when the
// connection drops; it never caches lobbies or the API, which must always be live.
const CACHE = 'jackdaw-v2';
const OFFLINE = '/offline.html';
const PRECACHE = [OFFLINE, '/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: always from the network; the offline page only when there is no network.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Build assets are content-hashed, so a cached copy never goes stale.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// "Your move" notifications (Web Push). When Jackdaw is already on screen the page alerts by
// itself, so nothing is shown twice.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // An empty or unreadable push still gets a plain notification.
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      if (windows.some((w) => w.visibilityState === 'visible')) return undefined;
      return self.registration.showNotification(data.title || 'Your move', {
        body: data.body || 'Your lobby is waiting for you.',
        tag: data.tag || 'jackdaw',
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [90, 60, 90],
        data: { url: data.url || '/' },
      });
    }),
  );
});

// Tapping one opens the lobby, in a Jackdaw window that's already open if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin,
  );
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname === url.pathname);
      if (open) return open.focus();
      const any = windows[0];
      if (any && 'navigate' in any) return any.navigate(url.href).then((w) => w && w.focus());
      return self.clients.openWindow(url.href);
    }),
  );
});
