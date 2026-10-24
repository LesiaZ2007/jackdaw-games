/* global self, caches */
// Jackdaw's service worker. It makes the app installable and keeps a page on screen when the
// connection drops; it never caches lobbies or the API, which must always be live.
const CACHE = 'jackdaw-v3';
// Build assets from every deploy collect here; only the newest MAX_ASSETS are kept.
const ASSETS = 'jackdaw-assets-v3';
const MAX_ASSETS = 160;
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
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== ASSETS).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Store a good response; for build assets, then drop the oldest beyond MAX_ASSETS. */
function keep(name, request, response) {
  if (!response.ok) return Promise.resolve();
  const copy = response.clone();
  return caches.open(name).then((cache) =>
    cache.put(request, copy).then(() => {
      if (name !== ASSETS) return undefined;
      // keys() lists the oldest first, so earlier deploys' files go first.
      return cache.keys().then((keys) => {
        const stale = keys.slice(0, Math.max(0, keys.length - MAX_ASSETS));
        return Promise.all(stale.map((k) => cache.delete(k)));
      });
    }),
  );
}

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
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            event.waitUntil(keep(ASSETS, request, response));
            return response;
          }),
      ),
    );
    return;
  }

  // Icons keep their names when they change: show the cached copy and refresh it behind.
  if (url.pathname.startsWith('/icons/')) {
    const fresh = fetch(request).then((response) => {
      event.waitUntil(keep(CACHE, request, response));
      return response;
    });
    event.waitUntil(fresh.catch(() => undefined));
    event.respondWith(caches.match(request).then((hit) => hit || fresh));
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
