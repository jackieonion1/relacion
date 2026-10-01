import fs from 'fs';
import path from 'path';
import { ensureShell, shellAssets, APP_SHELL_CACHE, RUNTIME_CACHE, MAX_RUNTIME } from './shellGuard';

const ORIGIN = 'https://relacion.test';
const keyOf = (k) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).pathname;

class FakeResponse {
  constructor(body, { status = 200, type = 'basic', redirected = false, contentType = '' } = {}) {
    Object.assign(this, { body, status, type, redirected });
    this.headers = { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) };
  }
  clone() { return new FakeResponse(this.body, { ...this, contentType: this.headers.get('content-type') }); }
  async text() { return this.body; }
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
