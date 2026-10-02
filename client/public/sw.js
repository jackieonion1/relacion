/* simple PWA service worker (v3) */
// The browser only updates the worker when this file's bytes change, and a normal deploy does not touch
// it (the in-app banner compares asset-manifest.json instead). Bump CACHE_VERSION when the caching changes.
// Keep the URL /sw.js and scope /: the push subscription hangs off this registration.
// Emergency rollback: public/sw-neutral.js (see relacion-docs/runbook-sw.md).
const CACHE_VERSION = 'v3';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const MAX_RUNTIME = 6; // a build has 3 servable files (main.js, main.css, one chunk): room for two builds
const MAX_FONTS = 6; // 3 fonts (Newsreader upright and italic, Instrument Sans): room for two generations

// --- Pure helpers (tested in src/sw.test.js, which evaluates this file) ---

const contentType = (resp) => (resp.headers.get('content-type') || '').toLowerCase();
const isHtml = (resp) => contentType(resp).includes('text/html');

// Only hashed build files: /static/js/*.js, /static/css/*.css and the fonts in /static/media/*.woff2.
// Other media, maps, etc. are not intercepted
function isStaticAsset(pathname) {
  return /^\/static\/(js\/[^/]+\.js|css\/[^/]+\.css|media\/[^/]+\.woff2)$/.test(pathname);
}

// Worth caching: a full 200 (not 206, not opaque, not redirected) whose type matches the extension.
// The Hosting rewrite answers a missing /static/js/x.js with 200 text/html: that must never be stored
function isGoodAsset(pathname, resp) {
  if (!resp || resp.status !== 200 || resp.type === 'opaque' || resp.redirected || isHtml(resp)) return false;
  const type = contentType(resp);
  if (pathname.endsWith('.js')) return type.includes('javascript');
  if (pathname.endsWith('.css')) return type.includes('text/css');
  if (pathname.endsWith('.woff2')) return type.includes('font/woff2') || type.includes('application/font-woff2');
  return false;
}

function isGoodShell(resp) {
  return !!resp && resp.status === 200 && !resp.redirected && isHtml(resp);
}

// The /static entry files that an index.html loads (CRA injects main.js and main.css). Fonts are not here on
// purpose: they are never precached, so one that fails to load cannot fail the install (without network and
// without having loaded them the serif falls back to Georgia)
function shellAssets(html) {
  const found = String(html || '').match(/\/static\/(?:js|css)\/[^"'\s>?#]+\.(?:js|css)/g) || [];
  return [...new Set(found)].filter(isStaticAsset);
}

// main.js and main.css are mandatory: a shell without them is a blank screen offline
function hasEntryAssets(urls) {
  return urls.some((u) => /^\/static\/js\/main\.[^/]+\.js$/.test(u))
    && urls.some((u) => /^\/static\/css\/main\.[^/]+\.css$/.test(u));
}

// Oldest entries go first, but never the files the cached shell needs
function runtimeEvictions(paths, keep, max = MAX_RUNTIME) {
  const keepSet = new Set(keep);
  const extra = paths.length - max;
  if (extra <= 0) return [];
  return paths.filter((p) => !keepSet.has(p)).slice(0, extra);
}

// js/css and fonts are trimmed apart: fonts stored before a build's js/css would be the "oldest" and go first
function cacheEvictions(paths, keep) {
  const isFont = (p) => p.endsWith('.woff2');
  return [
    ...runtimeEvictions(paths.filter((p) => !isFont(p)), keep),
    ...runtimeEvictions(paths.filter(isFont), [], MAX_FONTS),
  ];
}

// --- Cache plumbing ---

async function fetchFresh(url) {
  return fetch(new Request(url, { cache: 'reload' }));
}

// Make sure every asset this shell references is in RUNTIME; throws if any cannot be stored
async function cacheShellAssets(html) {
  const urls = shellAssets(html);
  if (!hasEntryAssets(urls)) throw new Error('shell-without-entry-assets');
  const runtime = await caches.open(RUNTIME_CACHE);
  await Promise.all(urls.map(async (u) => {
    if (await runtime.match(u)) return;
    const resp = await fetchFresh(u);
    if (!isGoodAsset(u, resp)) throw new Error(`bad-asset ${u} ${resp.status}`);
    await runtime.put(u, resp);
  }));
  return urls;
}

// Store index.html only once its assets are cached; otherwise keep the previous shell
async function storeShell(resp) {
  if (!isGoodShell(resp)) return false;
  const html = await resp.clone().text();
  const urls = await cacheShellAssets(html);
  await (await caches.open(APP_SHELL_CACHE)).put('/index.html', resp);
  await trimRuntime(urls);
  return true;
}

async function trimRuntime(keep) {
  const runtime = await caches.open(RUNTIME_CACHE);
  const paths = (await runtime.keys()).map((r) => new URL(r.url).pathname);
  await Promise.all(cacheEvictions(paths, keep).map((p) => runtime.delete(p)));
}

async function cachedShellAssets() {
  const shell = await (await caches.open(APP_SHELL_CACHE)).match('/index.html');
  return shell ? shellAssets(await shell.text()) : [];
}

// No skipWaiting here: the new worker waits until the banner's "Actualizar" (SKIP_WAITING message)
// or until every window is closed. If anything throws, the install fails and the current worker stays
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const index = await fetchFresh('/index.html');
    if (!isGoodShell(index)) throw new Error(`bad-index ${index.status}`);
    const stored = await storeShell(index);
    if (!stored) throw new Error('shell-not-stored');
  })());
});

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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

// Every other cache goes (app-shell-v1/-v2 and runtime-v1/-v2 included: that is where v1 could keep HTML as JS)
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

// Only same-origin GET navigations and hashed /static files (js, css, woff2). Everything else (Firebase Storage images,
// audio with Range, manifest, icons, APIs) goes straight to the network as if there were no SW
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first, no timeout. Offline: the last shell whose assets are cached
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      let network;
      try {
        network = await fetch(request);
      } catch (e) {
        try {
          const cached = await (await caches.open(APP_SHELL_CACHE)).match('/index.html');
          return cached || Response.error();
        } catch {
          return Response.error();
        }
      }
      if (isGoodShell(network)) {
        try { event.waitUntil(storeShell(network.clone()).catch(() => {})); } catch {}
      }
      return network;
    })());
    return;
  }

  // Hashed file names never change content: cache first, network on a miss, store only good assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith((async () => {
      try {
        const runtime = await caches.open(RUNTIME_CACHE);
        const cached = await runtime.match(url.pathname);
        if (cached) return cached;
        const resp = await fetch(request);
        if (isGoodAsset(url.pathname, resp)) {
          const copy = resp.clone();
          try {
            event.waitUntil((async () => {
              await runtime.put(url.pathname, copy);
              await trimRuntime(await cachedShellAssets());
            })().catch(() => {}));
          } catch {}
        }
        return resp;
      } catch (e) {
        return fetch(request);
      }
    })());
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
