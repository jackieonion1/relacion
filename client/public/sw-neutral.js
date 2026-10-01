/* neutral service worker (emergency rollback, level 1) */
// Not registered by the app. To use it, COMMIT its content over public/sw.js and deploy
// (relacion-docs/runbook-sw.md): a cp over build/ alone is undone by the next CI build.
// No fetch handler (everything goes to the network, as without a SW); every cache is purged; push stays.
// No unregister (it would drop the push subscription) and no client.navigate (index.js registers on
// every load: navigate + register loops). The open window keeps what it has; the next cold start is clean.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
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
