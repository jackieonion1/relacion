import fs from 'fs';
import path from 'path';
import {
  ensureShell, guardShell, shellAssets, isGoodAsset, isGoodShell, isStaticAsset, hasEntryAssets, runtimeEvictions, cacheEvictions,
  APP_SHELL_CACHE, RUNTIME_CACHE, MAX_RUNTIME, MAX_FONTS,
} from './shellGuard';

const ORIGIN = 'https://relacion.test';
const keyOf = (k) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).pathname;

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
    open: vi.fn(async (n) => { if (!store.has(n)) store.set(n, new FakeCache()); return store.get(n); }),
    keys: vi.fn(async () => [...store.keys()]),
    delete: vi.fn(async (n) => store.delete(n)),
  };
}

const html = (hash) => `<!doctype html><script type="module" crossorigin src="/static/js/main.${hash}.js"></script><link rel="stylesheet" crossorigin href="/static/css/main.${hash}.css">`;
const htmlRes = (hash) => new FakeResponse(html(hash), { contentType: 'text/html; charset=utf-8' });
const jsRes = () => new FakeResponse('x', { contentType: 'application/javascript' });
const cssRes = () => new FakeResponse('x', { contentType: 'text/css' });

function loadPage(hash) {
  document.head.innerHTML = `<script type="module" crossorigin src="/static/js/main.${hash}.js"></script><link rel="stylesheet" crossorigin href="/static/css/main.${hash}.css">`;
}

// Un servidor con el index de `hash`; lo que no sea /index.html sale de los assets de esa build
function fakeServer(hash, { failOn } = {}) {
  return vi.fn(async (url) => {
    if (failOn && failOn(url)) throw new TypeError('offline');
    if (url === '/index.html') return htmlRes(hash);
    return url.endsWith('.js') ? jsRes() : cssRes();
  });
}

const shellOf = async (c) => (await c.open(APP_SHELL_CACHE)).match('/index.html');
const runtimePaths = async (c) => (await (await c.open(RUNTIME_CACHE)).keys()).map((r) => keyOf(r.url));

let c;
beforeEach(() => {
  c = fakeCaches();
  global.caches = c;
  loadPage('new');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => {
  delete global.caches;
  delete global.fetch;
  document.head.innerHTML = '';
});

describe('names shared with sw.js', () => {
  it('match the cache names and the runtime limit of public/sw.js', () => {
    const sw = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
    const version = sw.match(/const CACHE_VERSION = '([^']+)'/)[1];
    expect(APP_SHELL_CACHE).toBe(`app-shell-${version}`);
    expect(RUNTIME_CACHE).toBe(`runtime-${version}`);
    expect(MAX_RUNTIME).toBe(Number(sw.match(/const MAX_RUNTIME = (\d+)/)[1]));
    expect(MAX_FONTS).toBe(Number(sw.match(/const MAX_FONTS = (\d+)/)[1]));
  });
});

describe('ensureShell', () => {
  it('does nothing when the cached shell points at the running main', async () => {
    await (await c.open(APP_SHELL_CACHE)).put('/index.html', htmlRes('new'));
    global.fetch = fakeServer('new');
    expect(await ensureShell()).toBe('ok');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('repairs an old shell: stores its assets, then the shell', async () => {
    const shell = await c.open(APP_SHELL_CACHE);
    await shell.put('/index.html', htmlRes('old'));
    global.fetch = fakeServer('new');
    expect(await ensureShell()).toBe('repaired');
    expect(global.fetch).toHaveBeenCalledWith('/index.html', { cache: 'no-store' });
    expect(shellAssets(await (await shellOf(c)).text())).toEqual(['/static/js/main.new.js', '/static/css/main.new.css']);
    expect((await runtimePaths(c)).sort()).toEqual(['/static/css/main.new.css', '/static/js/main.new.js']);
  });

  it('repairs a missing shell and skips assets that are already cached', async () => {
    await (await c.open(RUNTIME_CACHE)).put('/static/js/main.new.js', jsRes());
    global.fetch = fakeServer('new');
    expect(await ensureShell()).toBe('repaired');
    expect(global.fetch).not.toHaveBeenCalledWith('/static/js/main.new.js', expect.anything());
    expect(global.fetch).toHaveBeenCalledWith('/static/css/main.new.css', { cache: 'reload' });
    expect(await shellOf(c)).toBeDefined();
  });

  it('keeps the runtime cache within the limit without evicting the new shell files', async () => {
    const runtime = await c.open(RUNTIME_CACHE);
    for (let i = 0; i < MAX_RUNTIME; i += 1) await runtime.put(`/static/js/old${i}.js`, jsRes());
    global.fetch = fakeServer('new');
    expect(await ensureShell()).toBe('repaired');
    const paths = await runtimePaths(c);
    expect(paths).toHaveLength(MAX_RUNTIME);
    expect(paths).toEqual(expect.arrayContaining(['/static/js/main.new.js', '/static/css/main.new.css']));
  });

  it('trims fonts apart from js/css: old fonts never push out the new shell files', async () => {
    const runtime = await c.open(RUNTIME_CACHE);
    for (let i = 0; i < MAX_FONTS; i += 1) await runtime.put(`/static/media/f${i}.woff2`, new FakeResponse('f', { contentType: 'font/woff2' }));
    for (let i = 0; i < MAX_RUNTIME - 2; i += 1) await runtime.put(`/static/js/old${i}.js`, jsRes());
    global.fetch = fakeServer('new');
    expect(await ensureShell()).toBe('repaired');
    const paths = await runtimePaths(c);
    expect(paths.filter((p) => p.endsWith('.woff2'))).toHaveLength(MAX_FONTS);
    expect(paths).toEqual(expect.arrayContaining(['/static/js/main.new.js', '/static/css/main.new.css']));
    expect(paths.filter((p) => !p.endsWith('.woff2'))).toHaveLength(MAX_RUNTIME);
  });

  it('stores nothing when the server already has another main', async () => {
    const shell = await c.open(APP_SHELL_CACHE);
    const old = htmlRes('old');
    await shell.put('/index.html', old);
    global.fetch = fakeServer('newer');
    expect(await ensureShell()).toBe('server-differs');
    expect(await shellOf(c)).toBe(old);
    expect(await runtimePaths(c)).toEqual([]);
  });

  it('does not touch the old shell when an asset cannot be stored', async () => {
    const shell = await c.open(APP_SHELL_CACHE);
    const old = htmlRes('old');
    await shell.put('/index.html', old);
    // El rewrite de Hosting contesta 200 text/html a un fichero que no existe
    global.fetch = vi.fn(async (url) => (url.endsWith('.css') ? htmlRes('new') : url === '/index.html' ? htmlRes('new') : jsRes()));
    expect(await ensureShell()).toBe('failed');
    expect(await shellOf(c)).toBe(old);
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not throw on a network error or a cache error', async () => {
    global.fetch = fakeServer('new', { failOn: () => true });
    await expect(ensureShell()).resolves.toBe('failed');
    global.caches = { open: vi.fn(async () => { throw new Error('quota'); }) };
    global.fetch = fakeServer('new');
    await expect(ensureShell()).resolves.toBe('failed');
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('never deletes caches', async () => {
    global.fetch = fakeServer('new');
    await ensureShell();
    expect(c.delete).not.toHaveBeenCalled();
  });

  it('does nothing without network, without caches or in development', async () => {
    global.fetch = fakeServer('new');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(await ensureShell()).toBe('skipped');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    delete global.caches;
    expect(await ensureShell()).toBe('skipped');
    global.caches = c;
    document.head.innerHTML = '<script type="module" src="/src/index.jsx"></script>';
    expect(await ensureShell()).toBe('skipped');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(c.open).not.toHaveBeenCalled();
  });
});

// Todo es microtareas: un macrotask basta para que termine lo que haya en curso
const settle = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('guardShell', () => {
  let stops;
  const start = (sw = { controller: {} }) => {
    const stop = guardShell({ sw });
    stops.push(stop);
    return stop;
  };
  const setOnline = (v) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
  const setVisibility = (v) => Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  const fire = async (target, type) => { target.dispatchEvent(new Event(type)); await settle(); };

  beforeEach(() => { stops = []; setVisibility('visible'); });
  afterEach(() => {
    stops.forEach((stop) => stop());
    delete document.visibilityState;
    vi.restoreAllMocks();
  });

  it('starts at once when the service worker already controls the page, before `load` or register', async () => {
    global.fetch = fakeServer('new');
    start();
    // ensureShell abre las cachés de forma síncrona: ya ha empezado sin esperar a nada
    expect(c.open).toHaveBeenCalledWith(APP_SHELL_CACHE);
    await settle();
    expect(await shellOf(c)).toBeDefined();
  });

  it('waits for `ready` on a first visit, and does nothing if it never comes or the guard is stopped first', async () => {
    global.fetch = fakeServer('new');
    const ready = deferred();
    start({ controller: null, ready: ready.promise });
    await settle();
    expect(c.open).not.toHaveBeenCalled();
    ready.resolve();
    await settle();
    expect(await shellOf(c)).toBeDefined();

    c.open.mockClear();
    const late = deferred();
    start({ controller: null, ready: late.promise })();
    late.resolve();
    await settle();
    expect(c.open).not.toHaveBeenCalled();
  });

  it('does nothing without service worker support, and survives a `ready` that rejects', async () => {
    start(null);
    start({ controller: null, ready: Promise.reject(new Error('x')) });
    await settle();
    expect(c.open).not.toHaveBeenCalled();
  });

  it('retries on `online` after starting offline, then repairs and removes its listeners', async () => {
    global.fetch = fakeServer('new');
    setOnline(false);
    start();
    await settle();
    expect(await shellOf(c)).toBeUndefined();
    setOnline(true);
    await fire(window, 'online');
    expect(await shellOf(c)).toBeDefined();

    const opened = c.open.mock.calls.length;
    await fire(window, 'online');
    await fire(document, 'visibilitychange');
    expect(c.open.mock.calls.length).toBe(opened); // ya no escucha
  });

  it('retries after a failure on visibilitychange, only when the page becomes visible', async () => {
    let broken = true;
    global.fetch = vi.fn(async (url, ...rest) => {
      if (broken) throw new TypeError('offline');
      return fakeServer('new')(url, ...rest);
    });
    start();
    await settle();
    expect(await shellOf(c)).toBeUndefined();
    const calls = global.fetch.mock.calls.length;
    broken = false;

    setVisibility('hidden');
    await fire(document, 'visibilitychange');
    expect(global.fetch.mock.calls.length).toBe(calls);
    expect(await shellOf(c)).toBeUndefined();

    setVisibility('visible');
    await fire(document, 'visibilitychange');
    expect(await shellOf(c)).toBeDefined();
  });

  it('keeps retrying while it fails or is skipped, and stops at the first definitive answer', async () => {
    let broken = true;
    global.fetch = vi.fn(async (url, ...rest) => {
      if (broken) throw new TypeError('offline');
      return fakeServer('new')(url, ...rest);
    });
    setOnline(false);
    start();
    await settle(); // skipped
    setOnline(true);
    await fire(window, 'online'); // failed
    await fire(document, 'visibilitychange'); // failed otra vez
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(await shellOf(c)).toBeUndefined();
    broken = false;
    await fire(window, 'online'); // repaired
    expect(await shellOf(c)).toBeDefined();
    const calls = global.fetch.mock.calls.length;
    await fire(window, 'online');
    expect(global.fetch.mock.calls.length).toBe(calls);
  });

  it.each([
    ['ok', async () => { await (await c.open(APP_SHELL_CACHE)).put('/index.html', htmlRes('new')); return fakeServer('new'); }],
    ['server-differs', async () => fakeServer('newer')],
  ])('stops retrying after %s', async (_, setup) => {
    global.fetch = await setup();
    start();
    await settle();
    c.open.mockClear();
    await fire(window, 'online');
    await fire(document, 'visibilitychange');
    expect(c.open).not.toHaveBeenCalled();
  });

  it('never runs two attempts at once', async () => {
    const index = deferred();
    const server = fakeServer('new');
    global.fetch = vi.fn((url, ...rest) => (url === '/index.html' ? index.promise.then(() => server(url, ...rest)) : server(url, ...rest)));
    start();
    await settle();
    await fire(window, 'online');
    await fire(document, 'visibilitychange');
    await fire(window, 'online');
    expect(global.fetch.mock.calls.filter(([u]) => u === '/index.html')).toHaveLength(1);
    index.resolve();
    await settle();
    expect(await shellOf(c)).toBeDefined();
    expect(global.fetch.mock.calls.filter(([u]) => u === '/index.html')).toHaveLength(1);
  });

  it('never rejects, even when the caches break on every attempt, and uses no timers', async () => {
    const interval = vi.spyOn(global, 'setInterval');
    global.fetch = fakeServer('new');
    global.caches = { open: vi.fn(async () => { throw new Error('quota'); }) };
    start();
    await settle();
    await fire(window, 'online');
    await fire(window, 'online');
    expect(global.caches.open).toHaveBeenCalledTimes(3);
    expect(interval).not.toHaveBeenCalled();
  });

  it('the returned stop removes both listeners', async () => {
    global.fetch = fakeServer('new');
    setOnline(false);
    const stop = start();
    await settle();
    stop();
    setOnline(true);
    await fire(window, 'online');
    await fire(document, 'visibilitychange');
    expect(await shellOf(c)).toBeUndefined();
  });
});

// --- Los criterios copiados son los de public/sw.js: se evalúa el fichero real, como hace sw.test.js ---

const REAL_SW = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const SW_HELPERS = ['isGoodAsset', 'isGoodShell', 'shellAssets', 'hasEntryAssets', 'runtimeEvictions', 'cacheEvictions', 'isStaticAsset'];

function loadSw(caches, server) {
  const handlers = {};
  const state = { server, online: true, fail: () => false };
  const fetch = vi.fn(async (req) => {
    const p = keyOf(req);
    if (!state.online || state.fail(p)) throw new TypeError('Failed to fetch');
    const [body, contentType] = state.server[p] || state.server['/index.html'];
    return new FakeResponse(body, { contentType });
  });
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []) },
  };
  // eslint-disable-next-line no-new-func
  const api = new Function('self', 'caches', 'fetch', 'Request', 'Response', `${REAL_SW}\n;return { ${SW_HELPERS.join(', ')} };`)(self, caches, fetch, FakeRequest, FakeResponse);
  return { api, handlers, fetch, state };
}

// Dispara un evento y espera a todo lo que haya pedido con waitUntil/respondWith
async function dispatch(sw, type, init = {}) {
  const waits = [];
  const event = { ...init, waitUntil: (p) => { waits.push(p); }, respondWith: (p) => { event.response = Promise.resolve(p); } };
  for (const fn of sw.handlers[type] || []) fn(event);
  const response = event.response ? await event.response : undefined;
  for (let done = 0; done < waits.length; done++) await waits[done];
  return response;
}
const nav = (p) => ({ request: new FakeRequest(p, { mode: 'navigate', destination: 'document' }) });
const asset = (p) => ({ request: new FakeRequest(p, { destination: 'script' }) });

describe('parity with public/sw.js: the same inputs give the same answers', () => {
  const { api } = loadSw(fakeCaches(), {});
  const PATHS = [
    '/static/js/main.aaa.js', '/static/css/main.aaa.css', '/static/js/626.abc.chunk.js', '/static/js/main.aaa.js.map',
    '/static/js/a/b.js', '/static/css/x.css?v=1', '/static/media/foto.jpg', '/manifest.json', '/index.html', '',
    '/static/media/newsreader-latin-opsz-normal.2cfa2cdf.woff2', '/static/media/sub/a.woff2', '/static/media/a.woff', '/static/js/a.woff2',
  ];
  const TYPES = ['text/javascript; charset=utf-8', 'application/javascript', 'TEXT/CSS', 'text/html; charset=utf-8', 'application/json', 'text/plain', '',
    'font/woff2', 'application/font-woff2', 'application/octet-stream'];
  const VARIANTS = [{}, { status: 206 }, { status: 404 }, { redirected: true }, { status: 0, type: 'opaque' }, { type: 'cors' }];
  const RESPONSES = [null, undefined, ...TYPES.flatMap((contentType) => VARIANTS.map((v) => new FakeResponse('x', { contentType, ...v })))];
  const HTMLS = [
    html('aaa'),
    '<script defer src="/static/js/main.aaa.js"></script><link href="/static/css/main.aaa.css" rel="stylesheet">',
    '<link rel="modulepreload" href="/static/js/vendor.aaa.chunk.js?v=1"><script src=\'/static/js/main.aaa.js#x\'></script>',
    '<script src="/static/js/main.aaa.js.map"></script><img src="/static/media/foto.jpg">',
    '<script src="/static/js/main.aaa.js"></script><style>@font-face{src:url(/static/media/a.1.woff2)}</style>',
    '<script src="/static/js/a/b.js"></script><script src="/static/js/main.aaa.js"></script><script src="/static/js/main.aaa.js"></script>',
    '<script src="/static/js/main.aaa.mjs"></script><link href="/static/css/main.aaa.css">',
    'sin nada', '', null, undefined, 42,
  ];
  const URL_LISTS = [
    [], ['/static/js/main.a.js'], ['/static/css/main.a.css'], ['/static/js/main.a.js', '/static/css/main.a.css'],
    ['/static/js/vendor.a.chunk.js', '/static/css/main.a.css'], ['/static/js/x/main.a.js', '/static/css/main.a.css'],
    ['/static/js/main.a.js', '/static/css/other.css'],
  ];

  it('the table is not vacuous', () => {
    const good = PATHS.flatMap((p) => RESPONSES.map((r) => api.isGoodAsset(p, r)));
    expect(good).toContain(true);
    expect(good).toContain(false);
    expect(HTMLS.map((h) => api.shellAssets(h)).filter((l) => l.length).length).toBeGreaterThan(3);
    expect(URL_LISTS.map((u) => api.hasEntryAssets(u))).toEqual(expect.arrayContaining([true, false]));
  });

  it('isGoodAsset', () => {
    for (const p of PATHS) for (const r of RESPONSES) expect(isGoodAsset(p, r), `${p} ${r && r.status} ${r && r.type}`).toBe(api.isGoodAsset(p, r));
  });

  it('isGoodShell', () => {
    for (const r of RESPONSES) expect(isGoodShell(r)).toBe(api.isGoodShell(r));
  });

  it('isStaticAsset', () => {
    for (const p of PATHS) expect(isStaticAsset(p), p).toBe(api.isStaticAsset(p));
  });

  it('shellAssets', () => {
    for (const h of HTMLS) expect(shellAssets(h)).toEqual(api.shellAssets(h));
  });

  it('hasEntryAssets', () => {
    for (const u of URL_LISTS) expect(hasEntryAssets(u), u.join()).toBe(api.hasEntryAssets(u));
  });

  it('cacheEvictions, with js/css and fonts mixed', () => {
    const keeps = [[], ['/p0.js', '/f0.woff2']];
    for (let n = 0; n <= 9; n += 1) {
      for (let m = 0; m <= 9; m += 1) {
        const paths = [...Array.from({ length: m }, (_, i) => `/f${i}.woff2`), ...Array.from({ length: n }, (_, i) => `/p${i}.js`)];
        for (const keep of keeps) expect(cacheEvictions(paths, keep), `${n} ${m} ${keep}`).toEqual(api.cacheEvictions(paths, keep));
      }
    }
  });

  it('runtimeEvictions, with the default limit and with others', () => {
    const keeps = [[], ['/p0.js', '/p1.js'], ['/p8.js'], ['/nope.js']];
    for (let n = 0; n <= 9; n += 1) {
      const paths = Array.from({ length: n }, (_, i) => `/p${i}.js`);
      for (const keep of keeps) {
        for (const max of [undefined, 0, 2]) {
          expect(runtimeEvictions(paths, keep, max), `${n} ${keep} ${max}`).toEqual(api.runtimeEvictions(paths, keep, max));
        }
      }
    }
  });
});

describe('end to end with the real sw.js and shared caches', () => {
  const site = (hash) => ({
    '/index.html': [html(hash), 'text/html; charset=utf-8'],
    [`/static/js/main.${hash}.js`]: ['js', 'text/javascript'],
    [`/static/css/main.${hash}.css`]: ['css', 'text/css'],
  });

  it('storeShell fails, the guard repairs, and an offline navigation serves the new shell', async () => {
    const sw = loadSw(c, site('old'));
    await dispatch(sw, 'install');
    expect(shellAssets(await (await shellOf(c)).text())).toEqual(['/static/js/main.old.js', '/static/css/main.old.css']);

    // Llega un deploy y el navegador abre la página nueva, pero el SW no puede bajar sus ficheros
    sw.state.server = site('new');
    sw.state.fail = (p) => p.startsWith('/static/');
    const res = await dispatch(sw, 'fetch', nav('/'));
    expect(await res.text()).toBe(html('new'));
    expect(await (await shellOf(c)).text()).toBe(html('old'));

    // La página nueva ya corre: la guarda repone el shell con la red de vuelta
    sw.state.fail = () => false;
    loadPage('new');
    global.fetch = sw.fetch;
    expect(await ensureShell()).toBe('repaired');

    sw.state.online = false;
    const offline = await dispatch(sw, 'fetch', nav('/'));
    expect(await offline.text()).toBe(html('new'));
    expect(await runtimePaths(c)).toEqual(expect.arrayContaining(['/static/js/main.new.js', '/static/css/main.new.css']));
    const main = await dispatch(sw, 'fetch', asset('/static/js/main.new.js'));
    expect(main.body).toBe('js');
  });
});
