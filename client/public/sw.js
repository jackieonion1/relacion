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
  const isSameOrigin = url.origin === self.location.origin;
  const isFirebaseStorage = /(^https?:\/\/)?([a-z0-9.-]*\.)?(firebasestorage\.googleapis\.com|firebasestorage\.app)$/.test(url.host);

  // Same-origin navigation -> serve index.html offline fallback
  if (isSameOrigin && request.mode === 'navigate') {
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

  // Same-origin static assets (script/style/worker) -> stale-while-revalidate
  if (isSameOrigin && ['script', 'style', 'worker'].includes(request.destination)) {
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

  // Images (same-origin or Firebase Storage) -> cache-first
  if (request.destination === 'image' && (isSameOrigin || isFirebaseStorage)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const resp = await fetch(request);
        // Cache opaque/cors responses as-is; subsequent loads will use cache
        cache.put(request, resp.clone());
        return resp;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }
});
