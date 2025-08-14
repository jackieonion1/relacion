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

// Inform clients to re-subscribe if subscription changes (expiry, invalidation)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      try { client.postMessage({ type: 'pushsubscriptionchange' }); } catch {}
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Allow page to request a SW-side subscribe (iOS fallback)
self.addEventListener('message', (event) => {
  try {
    const data = event && event.data;
    if (data && data.type === 'subscribe') {
      event.waitUntil((async () => {
        try {
          const appServerKey = data.applicationServerKey;
          const reqId = data.reqId;
          let sub = await self.registration.pushManager.getSubscription();
          if (!sub) {
            sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
          }
          const json = sub && typeof sub.toJSON === 'function' ? sub.toJSON() : {};
          const endpoint = (sub && sub.endpoint) || json.endpoint || '';
          const keys = json.keys || {};
          if (event.source && event.source.postMessage) {
            event.source.postMessage({ type: 'subscribeResult', reqId, ok: true, endpoint, keys });
          }
        } catch (e) {
          try {
            if (event.source && event.source.postMessage) {
              event.source.postMessage({ type: 'subscribeResult', reqId: (event && event.data && event.data.reqId) || undefined, ok: false, error: (e && e.message) ? e.message : String(e) });
            }
          } catch {}
        }
      })());
    }
  } catch {}
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

// Push notifications: expect a JSON payload with optional { title, body, url, icon, badge, data }
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    // Fallback to text
    payload = { title: 'Notificación', body: event.data && event.data.text ? event.data.text() : '' };
  }
  const title = payload.title || 'Nosotros';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    data: { url: payload.url || '/', ...(payload.data || {}) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Open app to the target URL when the notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        // Reuse existing tab
        if ('navigate' in client) {
          await client.navigate(url);
        }
        if ('focus' in client) {
          await client.focus();
        }
        return;
      } catch {}
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  })());
});
