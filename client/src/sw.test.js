// Evalúa los service workers de verdad (public/sw.js y public/sw-neutral.js) con un `self`, `caches` y
// `fetch` falsos: así se prueba el fichero que se despliega, no una copia
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://relacion.test';
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
const HELPERS = ['isGoodAsset', 'isGoodShell', 'shellAssets', 'hasEntryAssets', 'runtimeEvictions', 'isStaticAsset'];

class FakeResponse {
  constructor(body, { status = 200, type = 'basic', redirected = false, contentType = '' } = {}) {
    Object.assign(this, { body, status, type, redirected });
    this.headers = { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) };
  }
  clone() { return new FakeResponse(this.body, { ...this, contentType: this.headers.get('content-type') }); }
  async text() { return this.body; }
  static error() { return new FakeResponse('', { status: 0, type: 'error' }); }
}
class FakeRequest {
  constructor(url, opts = {}) {
    this.url = new URL(url, ORIGIN).href;
    Object.assign(this, { method: 'GET', mode: 'no-cors', destination: '', ...opts });
  }
}
const keyOf = (k) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).pathname;
class FakeCache {
  constructor() { this.map = new Map(); }
  async match(k) { return this.map.get(keyOf(k)); }
  async put(k, r) { this.map.set(keyOf(k), r); }
  async delete(k) { return this.map.delete(keyOf(k)); }
  async keys() { return [...this.map.keys()].map((p) => ({ url: ORIGIN + p })); }
}
function fakeCaches() {
  const store = new Map();
  return {
    store,
    open: async (n) => { if (!store.has(n)) store.set(n, new FakeCache()); return store.get(n); },
    keys: async () => [...store.keys()],
    delete: async (n) => store.delete(n),
  };
}

const JS = { contentType: 'text/javascript; charset=utf-8' };
const CSS = { contentType: 'text/css; charset=utf-8' };
const HTML = { contentType: 'text/html; charset=utf-8' };
const indexHtml = (hash) => `<!doctype html><html><head><script defer="defer" src="/static/js/main.${hash}.js"></script><link href="/static/css/main.${hash}.css" rel="stylesheet"></head><body><div id="root"></div></body></html>`;
// Como Firebase Hosting: un fichero que no existe responde 200 con el index (rewrite **)
function hosting(hash, files = {}) {
  return {
    '/index.html': [indexHtml(hash), HTML],
    [`/static/js/main.${hash}.js`]: ['js', JS],
    [`/static/css/main.${hash}.css`]: ['css', CSS],
    ...files,
  };
}

function load(name, env = {}) {
  const handlers = {};
  const caches = env.caches || fakeCaches();
  let server = env.server || hosting('aaa');
  let online = true;
  const fetch = jest.fn(async (req) => {
    if (!online) throw new TypeError('Failed to fetch');
    const p = keyOf(req);
    const hit = server[p] || server['/index.html'];
    return new FakeResponse(hit[0], hit[1]);
  });
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    skipWaiting: jest.fn(async () => {}),
    clients: { claim: jest.fn(async () => {}), matchAll: jest.fn(async () => []) },
    registration: { unregister: jest.fn(async () => true), showNotification: jest.fn(async () => {}) },
  };
  const src = read(name);
  const helpers = name === 'sw.js' ? `\n;return { ${HELPERS.join(', ')} };` : '';
  // eslint-disable-next-line no-new-func
  const api = new Function('self', 'caches', 'fetch', 'Request', 'Response', src + helpers)(self, caches, fetch, FakeRequest, FakeResponse);
  return {
    api, self, caches, fetch, handlers,
    setServer: (s) => { server = s; },
    setOnline: (v) => { online = v; },
  };
}

// Dispara un evento y espera a todo lo que haya pedido con waitUntil/respondWith
async function dispatch(sw, type, init = {}) {
  const waits = [];
  const event = { ...init, waitUntil: (p) => { waits.push(p); }, respondWith: (p) => { event.response = Promise.resolve(p); } };
  for (const fn of sw.handlers[type] || []) fn(event);
  const response = event.response ? await event.response : undefined;
  // waitUntil puede llegar desde dentro de respondWith: se espera en bucle hasta que no quede nada
  for (let done = 0; done < waits.length; done++) await waits[done];
  return { response, intercepted: !!event.response };
}
const nav = (p) => ({ request: new FakeRequest(p, { mode: 'navigate', destination: 'document' }) });
const get = (p, destination) => ({ request: new FakeRequest(p, { destination }) });
const shellOf = async (sw) => (await sw.caches.open('app-shell-v2')).match('/index.html');
const runtimePaths = async (sw) => (await (await sw.caches.open('runtime-v2')).keys()).map((r) => keyOf(r.url));

describe('sw.js v2: qué se guarda', () => {
  const { api } = load('sw.js');

  test('solo un 200 completo del tipo que toca; nunca el HTML del rewrite como JS', () => {
    const p = '/static/js/main.aaa.js';
    expect(api.isGoodAsset(p, new FakeResponse('js', JS))).toBe(true);
    expect(api.isGoodAsset(p, new FakeResponse('<html>', HTML))).toBe(false);
    expect(api.isGoodAsset(p, new FakeResponse('js', { ...JS, status: 206 }))).toBe(false);
    expect(api.isGoodAsset(p, new FakeResponse('x', { ...JS, status: 404 }))).toBe(false);
    expect(api.isGoodAsset(p, new FakeResponse('js', { ...JS, redirected: true }))).toBe(false);
    expect(api.isGoodAsset(p, new FakeResponse('', { status: 0, type: 'opaque' }))).toBe(false);
    expect(api.isGoodAsset('/static/css/main.aaa.css', new FakeResponse('js', JS))).toBe(false);
    expect(api.isGoodAsset('/static/css/main.aaa.css', new FakeResponse('css', CSS))).toBe(true);
  });

  test('solo intercepta /static/js/*.js y /static/css/*.css', () => {
    expect(api.isStaticAsset('/static/js/626.abc.chunk.js')).toBe(true);
    expect(api.isStaticAsset('/static/css/main.abc.css')).toBe(true);
    expect(api.isStaticAsset('/static/js/main.abc.js.map')).toBe(false);
    expect(api.isStaticAsset('/static/media/foto.jpg')).toBe(false);
    expect(api.isStaticAsset('/manifest.json')).toBe(false);
  });

  test('saca del index los ficheros de arranque y exige main.js y main.css', () => {
    const urls = api.shellAssets(indexHtml('d47ba32c'));
    expect(urls).toEqual(['/static/js/main.d47ba32c.js', '/static/css/main.d47ba32c.css']);
    expect(api.hasEntryAssets(urls)).toBe(true);
    expect(api.hasEntryAssets(['/static/js/main.d47ba32c.js'])).toBe(false);
    expect(api.shellAssets('<html>sin nada</html>')).toEqual([]);
  });

  test('el recorte de runtime quita los más antiguos pero nunca los del shell', () => {
    const paths = ['/a.js', '/b.js', '/c.js', '/d.js', '/e.js', '/f.js', '/g.js', '/h.js'];
    expect(api.runtimeEvictions(paths, ['/a.js'], 6)).toEqual(['/b.js', '/c.js']);
    expect(api.runtimeEvictions(paths.slice(0, 6), [], 6)).toEqual([]);
  });
});

describe('sw.js v2: install y activate', () => {
  test('install guarda el shell y sus dos ficheros, sin skipWaiting', async () => {
    const sw = load('sw.js');
    await dispatch(sw, 'install');
    expect((await shellOf(sw)).body).toBe(indexHtml('aaa'));
    expect(await runtimePaths(sw)).toEqual(['/static/js/main.aaa.js', '/static/css/main.aaa.css']);
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });

  test('si main.js llega como HTML el install falla (sigue el SW anterior) y no deja shell', async () => {
    const server = hosting('aaa');
    delete server['/static/js/main.aaa.js'];
    const sw = load('sw.js', { server });
    await expect(dispatch(sw, 'install')).rejects.toThrow(/bad-asset/);
    expect(await shellOf(sw)).toBeUndefined();
    expect(await runtimePaths(sw)).not.toContain('/static/js/main.aaa.js');
  });

  test('si el index no trae main.css, o no es HTML, el install falla', async () => {
    const noCss = load('sw.js', { server: { '/index.html': ['<script src="/static/js/main.aaa.js"></script>', HTML], '/static/js/main.aaa.js': ['js', JS] } });
    await expect(dispatch(noCss, 'install')).rejects.toThrow(/entry-assets/);
    const notHtml = load('sw.js', { server: { '/index.html': ['{}', { contentType: 'application/json' }] } });
    await expect(dispatch(notHtml, 'install')).rejects.toThrow(/bad-index/);
  });

  test('SKIP_WAITING (botón Actualizar) es lo único que llama a skipWaiting', async () => {
    const sw = load('sw.js');
    await dispatch(sw, 'message', { data: { type: 'subscribe-no' } });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    await dispatch(sw, 'message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  test('activate borra las cachés del v1 y conserva las suyas', async () => {
    const sw = load('sw.js');
    for (const n of ['app-shell-v1', 'runtime-v1', 'app-shell-v2', 'runtime-v2']) await sw.caches.open(n);
    await dispatch(sw, 'activate');
    expect(await sw.caches.keys()).toEqual(['app-shell-v2', 'runtime-v2']);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});

describe('sw.js v2: fetch', () => {
  async function installed() {
    const sw = load('sw.js');
    await dispatch(sw, 'install');
    sw.fetch.mockClear();
    return sw;
  }

  test('/static: caché primero, sin tocar la red', async () => {
    const sw = await installed();
    const { response } = await dispatch(sw, 'fetch', get('/static/js/main.aaa.js', 'script'));
    expect(response.body).toBe('js');
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  test('/static que no existe: devuelve lo de la red pero no guarda el HTML', async () => {
    const sw = await installed();
    const { response } = await dispatch(sw, 'fetch', get('/static/js/626.viejo.chunk.js', 'script'));
    expect(response.headers.get('content-type')).toMatch(/html/);
    expect(await runtimePaths(sw)).not.toContain('/static/js/626.viejo.chunk.js');
  });

  test('/static nuevo y bueno: se guarda', async () => {
    const sw = await installed();
    sw.setServer(hosting('aaa', { '/static/js/626.nuevo.chunk.js': ['chunk', JS] }));
    await dispatch(sw, 'fetch', get('/static/js/626.nuevo.chunk.js', 'script'));
    expect(await runtimePaths(sw)).toContain('/static/js/626.nuevo.chunk.js');
  });

  test('navegación con red: si los ficheros del index nuevo no se pueden guardar, se queda el shell anterior', async () => {
    const sw = await installed();
    const server = hosting('bbb');
    delete server['/static/js/main.bbb.js'];
    sw.setServer(server);
    const { response } = await dispatch(sw, 'fetch', nav('/gallery'));
    expect(response.body).toBe(indexHtml('bbb'));
    expect((await shellOf(sw)).body).toBe(indexHtml('aaa'));
  });

  test('navegación con red: con sus ficheros ya guardados, el shell pasa al index nuevo', async () => {
    const sw = await installed();
    sw.setServer(hosting('bbb'));
    await dispatch(sw, 'fetch', nav('/'));
    expect((await shellOf(sw)).body).toBe(indexHtml('bbb'));
    expect(await runtimePaths(sw)).toEqual(expect.arrayContaining(['/static/js/main.bbb.js', '/static/css/main.bbb.css']));
  });

  test('navegación sin red: el shell guardado; y sus ficheros salen de la caché', async () => {
    const sw = await installed();
    sw.setOnline(false);
    const page = await dispatch(sw, 'fetch', nav('/notes'));
    expect(page.response.body).toBe(indexHtml('aaa'));
    const js = await dispatch(sw, 'fetch', get('/static/js/main.aaa.js', 'script'));
    expect(js.response.body).toBe('js');
  });

  test('sin red y sin shell: error de red, nunca undefined', async () => {
    const sw = load('sw.js');
    sw.setOnline(false);
    const { response } = await dispatch(sw, 'fetch', nav('/'));
    expect(response.type).toBe('error');
  });

  test('no intercepta Storage, audio, manifest, POST ni otros orígenes', async () => {
    const sw = await installed();
    const cases = [
      { request: new FakeRequest('https://firebasestorage.googleapis.com/v0/b/x/o/f.jpg', { destination: 'image' }) },
      get('/static/media/cancion.mp3', 'audio'),
      get('/manifest.json', 'manifest'),
      get('/icon.svg', 'image'),
      { request: new FakeRequest('/static/js/main.aaa.js', { method: 'POST', destination: 'script' }) },
    ];
    for (const c of cases) expect((await dispatch(sw, 'fetch', c)).intercepted).toBe(false);
  });
});

describe('sw-neutral.js (marcha atrás nivel 1)', () => {
  test('sin handler fetch; se activa solo; purga todas las cachés; no desregistra ni navega', async () => {
    const sw = load('sw-neutral.js');
    expect(sw.handlers.fetch).toBeUndefined();
    await dispatch(sw, 'install');
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    for (const n of ['app-shell-v2', 'runtime-v2', 'app-shell-v1']) await sw.caches.open(n);
    await dispatch(sw, 'activate');
    expect(await sw.caches.keys()).toEqual([]);
    expect(sw.self.registration.unregister).not.toHaveBeenCalled();
    expect(read('sw-neutral.js')).not.toMatch(/unregister\(|importScripts/);
  });

  test('push, notificationclick, subscribe y pushsubscriptionchange idénticos en v2 y neutro', () => {
    const v2 = load('sw.js').handlers;
    const neutral = load('sw-neutral.js').handlers;
    for (const t of ['push', 'notificationclick', 'pushsubscriptionchange']) {
      expect(neutral[t].map(String)).toEqual(v2[t].map(String));
    }
    const subscribe = (hs) => hs.message.map(String).filter((s) => s.includes("'subscribe'"));
    expect(subscribe(neutral)).toHaveLength(1);
    expect(subscribe(neutral)).toEqual(subscribe(v2));
  });

  test('una notificación se sigue mostrando con el neutro', async () => {
    const sw = load('sw-neutral.js');
    await dispatch(sw, 'push', { data: { json: () => ({ title: 'Hola', body: 'b', url: '/notes' }) } });
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Hola', expect.objectContaining({ body: 'b', data: { url: '/notes' } }));
  });
});
