/* simple PWA service worker */
const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll([
      '/',
      '/index.html',
      '/manifest.json',
    ].map((p) => new Request(p, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests -> serve index.html offline fallback
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const network = await fetch(request);
        return network;
      } catch (e) {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Static assets (script/style/worker) -> stale-while-revalidate
  if (['script', 'style', 'worker'].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const networkPromise = fetch(request).then((resp) => {
        cache.put(request, resp.clone());
        return resp;
      }).catch(() => undefined);
      return cached || networkPromise || fetch(request);
    })());
    return;
  }

  // Images -> cache-first
  if (request.destination === 'image') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const resp = await fetch(request);
        cache.put(request, resp.clone());
        return resp;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }
});
