import { manifestEntrypoints, loadedEntrypoints, isNewer, checkForUpdate, applyUpdate, repairApp } from './appUpdate';

const manifest = (hash, cssHash = hash) => ({
  files: { 'main.js': `/static/js/main.${hash}.js`, 'main.css': `/static/css/main.${cssHash}.css` },
  entrypoints: [`static/css/main.${cssHash}.css`, `static/js/main.${hash}.js`],
});
const jsonRes = (body) => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => body });
const htmlRes = () => ({ ok: true, headers: { get: () => 'text/html; charset=utf-8' }, json: async () => { throw new Error('html'); } });

function loadPage(hash) {
  document.head.innerHTML = `<script defer src="/static/js/main.${hash}.js"></script><link href="/static/css/main.${hash}.css" rel="stylesheet">`;
}

function fakeSw({ waiting = null } = {}) {
  const listeners = {};
  const reg = { waiting, update: jest.fn(async () => {}), unregister: jest.fn(async () => true) };
  const sw = {
    controller: {},
    getRegistration: jest.fn(async () => reg),
    addEventListener: jest.fn((t, fn) => { listeners[t] = fn; }),
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return { reg, sw, listeners };
}

afterEach(() => {
  document.head.innerHTML = '';
  delete navigator.serviceWorker;
  delete global.caches;
  delete global.fetch;
});

describe('comparar versiones', () => {
  test('entrypoints del manifest y del DOM en el mismo formato', () => {
    loadPage('aaa');
    expect(manifestEntrypoints(manifest('aaa'))).toEqual(['static/css/main.aaa.css', 'static/js/main.aaa.js']);
    expect(loadedEntrypoints()).toEqual(['static/css/main.aaa.css', 'static/js/main.aaa.js']);
  });

  test('nuevo si cambia el JS o solo el CSS; nunca si falta un lado (desarrollo)', () => {
    const loaded = ['static/css/main.aaa.css', 'static/js/main.aaa.js'];
    expect(isNewer(manifestEntrypoints(manifest('aaa')), loaded)).toBe(false);
    expect(isNewer(manifestEntrypoints(manifest('bbb')), loaded)).toBe(true);
    expect(isNewer(manifestEntrypoints(manifest('aaa', 'ccc')), loaded)).toBe(true);
    expect(isNewer([], loaded)).toBe(false);
    document.head.innerHTML = '<script src="/static/js/bundle.js"></script>';
    expect(isNewer(manifestEntrypoints(manifest('bbb')), loadedEntrypoints())).toBe(false);
  });

  test('checkForUpdate pide el manifest sin caché y no se fía de un HTML', async () => {
    loadPage('aaa');
    global.fetch = jest.fn(async () => jsonRes(manifest('bbb')));
    await expect(checkForUpdate()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/asset-manifest.json', { cache: 'no-store' });
    global.fetch = jest.fn(async () => htmlRes());
    await expect(checkForUpdate()).resolves.toBe(false);
    global.fetch = jest.fn(async () => { throw new TypeError('offline'); });
    await expect(checkForUpdate()).resolves.toBe(false);
  });

  test('en desarrollo ni siquiera pide el manifest', async () => {
    global.fetch = jest.fn();
    await expect(checkForUpdate()).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('applyUpdate (botón Actualizar)', () => {
  test('con un SW esperando: SKIP_WAITING y recarga al cambiar de controlador', async () => {
    const reload = jest.fn();
    const waiting = { postMessage: jest.fn() };
    const { listeners } = fakeSw({ waiting });
    waiting.postMessage.mockImplementation(() => {
      expect(reload).not.toHaveBeenCalled();
      listeners.controllerchange();
    });
    await applyUpdate(reload);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('sin SW esperando: solo recarga (la navegación va a la red y trae el index nuevo)', async () => {
    const reload = jest.fn();
    fakeSw();
    await applyUpdate(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('si el SW no llega a cambiar, recarga igual a los 3 s', async () => {
    jest.useFakeTimers();
    const reload = jest.fn();
    fakeSw({ waiting: { postMessage: jest.fn() } });
    const done = applyUpdate(reload);
    await Promise.resolve(); await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3000);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('repairApp', () => {
  test('borra las cachés del SW y recarga; no desregistra ni toca localStorage', async () => {
    localStorage.setItem('pairId', 'SEB1998');
    localStorage.setItem('identity', 'ella');
    const reload = jest.fn();
    const { reg } = fakeSw();
    global.fetch = jest.fn(async () => htmlRes());
    global.caches = { keys: jest.fn(async () => ['app-shell-v2', 'runtime-v2']), delete: jest.fn(async () => true) };
    await repairApp(reload);
    expect(global.fetch).toHaveBeenCalledWith('/index.html', { cache: 'no-store' });
    expect(global.caches.delete.mock.calls.map((c) => c[0])).toEqual(['app-shell-v2', 'runtime-v2']);
    expect(reg.update).toHaveBeenCalled();
    expect(reg.unregister).not.toHaveBeenCalled();
    expect(localStorage.getItem('pairId')).toBe('SEB1998');
    expect(localStorage.getItem('identity')).toBe('ella');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('sin red no borra nada ni recarga', async () => {
    const reload = jest.fn();
    fakeSw();
    global.fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    global.caches = { keys: jest.fn(async () => ['app-shell-v2']), delete: jest.fn() };
    await expect(repairApp(reload)).rejects.toThrow();
    expect(global.caches.delete).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
