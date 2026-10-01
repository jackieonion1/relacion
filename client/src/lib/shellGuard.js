// Guarda del shell offline. public/sw.js responde a la página con el HTML de red ANTES de guardarlo en
// app-shell-v2 y, si guardarlo falla (o el sistema mata el SW), el shell cacheado sigue siendo el de la
// build anterior. Con Firebase 12 sobre una IndexedDB ya migrada eso es una bajada a la 10, que no puede
// abrirla: el siguiente arranque sin red sale sin persistencia. Aquí la página repone ella el shell si no
// apunta a los ficheros que está ejecutando. Nunca recarga, nunca borra cachés y nunca lanza.
// Los nombres y el tope de runtime son los de sw.js (src/lib/shellGuard.test.js comprueba que coinciden)
import { loadedEntrypoints } from './appUpdate';

export const APP_SHELL_CACHE = 'app-shell-v2';
export const RUNTIME_CACHE = 'runtime-v2';
export const MAX_RUNTIME = 6;

// --- Los mismos criterios que sw.js para decidir qué merece guardarse ---

const contentType = (resp) => (resp.headers.get('content-type') || '').toLowerCase();
const isHtml = (resp) => contentType(resp).includes('text/html');

export const isStaticAsset = (pathname) => /^\/static\/(js\/[^/]+\.js|css\/[^/]+\.css)$/.test(pathname);

export function isGoodAsset(pathname, resp) {
  if (!resp || resp.status !== 200 || resp.type === 'opaque' || resp.redirected || isHtml(resp)) return false;
  const type = contentType(resp);
  if (pathname.endsWith('.js')) return type.includes('javascript');
  if (pathname.endsWith('.css')) return type.includes('text/css');
  return false;
}

export const isGoodShell = (resp) => !!resp && resp.status === 200 && !resp.redirected && isHtml(resp);

export function shellAssets(html) {
  const found = String(html || '').match(/\/static\/(?:js|css)\/[^"'\s>?#]+\.(?:js|css)/g) || [];
  return [...new Set(found)].filter(isStaticAsset);
}

export function hasEntryAssets(urls) {
  return urls.some((u) => /^\/static\/js\/main\.[^/]+\.js$/.test(u))
    && urls.some((u) => /^\/static\/css\/main\.[^/]+\.css$/.test(u));
}

export function runtimeEvictions(paths, keep, max = MAX_RUNTIME) {
  const keepSet = new Set(keep);
  const extra = paths.length - max;
  if (extra <= 0) return [];
  return paths.filter((p) => !keepSet.has(p)).slice(0, extra);
}

// Un shell sirve si referencia todos los ficheros de arranque de esta página (main.js y main.css)
const pointsTo = (html, entries) => {
  const urls = shellAssets(html);
  return entries.every((p) => urls.includes(`/${p}`));
};

// Devuelve 'skipped' | 'ok' | 'repaired' | 'server-differs' | 'failed'; nunca rechaza
export async function ensureShell(doc = document) {
  try {
    if (typeof caches === 'undefined' || typeof fetch === 'undefined') return 'skipped';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'skipped';
    // En desarrollo (bundle.js sin hash) no hay main.<hash>.js y no se comprueba nada
    const entries = loadedEntrypoints(doc);
    if (!entries.some((p) => p.endsWith('.js'))) return 'skipped';

    const shellCache = await caches.open(APP_SHELL_CACHE);
    const cached = await shellCache.match('/index.html');
    if (cached && pointsTo(await cached.text(), entries)) return 'ok';

    const resp = await fetch('/index.html', { cache: 'no-store' });
    if (!isGoodShell(resp)) throw new Error(`bad-index ${resp && resp.status}`);
    const html = await resp.clone().text();
    // Si ya hay un deploy más nuevo, el aviso de actualización se encarga: aquí solo se repone el shell
    // de ESTA página, y guardar otro dejaría la bajada a medias
    if (!pointsTo(html, entries)) return 'server-differs';

    const urls = shellAssets(html);
    if (!hasEntryAssets(urls)) throw new Error('shell-without-entry-assets');
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.all(urls.map(async (u) => {
      if (await runtime.match(u)) return;
      const asset = await fetch(u, { cache: 'reload' });
      if (!isGoodAsset(u, asset)) throw new Error(`bad-asset ${u} ${asset.status}`);
      await runtime.put(u, asset);
    }));
    await shellCache.put('/index.html', resp);
    const paths = (await runtime.keys()).map((r) => new URL(r.url).pathname);
    await Promise.all(runtimeEvictions(paths, urls).map((p) => runtime.delete(p)));
    return 'repaired';
  } catch (err) {
    console.warn('Shell guard failed:', err);
    return 'failed';
  }
}

// Lanza la guarda y la reintenta mientras no haya podido (sin red, o error de red). Sin temporizadores:
// solo al volver la red o al volver la app a primer plano, y nunca dos intentos a la vez. Termina con
// 'ok', 'repaired' o 'server-differs' y entonces quita sus listeners. Devuelve `stop`.
// No espera a `load` ni a register(): ensureShell solo usa caches y fetch de la página. Arranca en cuanto
// el SW controla la página o, en la primera visita, cuando está listo (register() ya habrá instalado)
export function guardShell({ doc = document, win = window, sw = navigator.serviceWorker } = {}) {
  let running = false;
  let finished = false;

  const stop = () => {
    finished = true;
    win.removeEventListener('online', attempt);
    doc.removeEventListener('visibilitychange', onVisible);
  };

  async function attempt() {
    if (running || finished) return;
    running = true;
    let result;
    try {
      result = await ensureShell(doc);
    } catch {
      result = 'failed'; // ensureShell no rechaza; por si acaso
    } finally {
      running = false;
    }
    if (result !== 'skipped' && result !== 'failed') stop();
  }

  function onVisible() {
    if (doc.visibilityState === 'visible') attempt();
  }

  const start = () => {
    if (finished) return;
    win.addEventListener('online', attempt);
    doc.addEventListener('visibilitychange', onVisible);
    attempt();
  };

  if (sw && sw.controller) start();
  else if (sw && sw.ready) sw.ready.then(start, () => {});
  return stop;
}
