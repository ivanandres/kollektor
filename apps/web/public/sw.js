/* Kolektorz service worker: app shell offline + last-known data when the connection drops. */
/* global self, caches, fetch, URL */
const VERSION = 'kz-v1';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const DATA = `${VERSION}-data`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// Signing out wipes cached personal data.
self.addEventListener('message', (event) => {
  if (event.data === 'kz:clear-data') event.waitUntil(caches.delete(DATA));
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Auth and exports always hit the network; the rest falls back to the last response.
    if (url.pathname.startsWith('/api/auth') || url.pathname.endsWith('.csv')) return;
    event.respondWith(networkFirst(req, DATA));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === 'navigate') event.respondWith(networkFirst(req, PAGES, '/'));
});
