/*
 * LocalTools service worker — Phase 2 precache shell.
 *
 * Strategy: cache-first for same-origin GET assets (the built app is fully
 * static), with a versioned cache rotated on activate. Navigation requests
 * fall back to the cached index.html so offline reloads work (Section 8).
 * No runtime caching of cross-origin traffic; no telemetry, ever.
 */
const VERSION = 'v1';
const CACHE = `localtools-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['/']))
      .then(() => self.skipWaiting()),
  );
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
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations → cached shell (index.html), then network.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          void caches.open(CACHE).then((cache) => cache.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Static assets → cache-first, populating on miss.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ??
        fetch(req).then((res) => {
          if (res.ok) {
            void caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
          }
          return res;
        }),
    ),
  );
});
