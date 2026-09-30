// Aviso de «nueva versión» y «Reparar app». El aviso no depende del SW: compara los ficheros de arranque
// de /asset-manifest.json con los que ha cargado esta página (sw.js solo cambia cuando cambia el SW)

const ENTRY = /^static\/(js\/main\.[^/]+\.js|css\/main\.[^/]+\.css)$/;
const toPath = (u) => {
  try { return new URL(u, window.location.origin).pathname.replace(/^\//, ''); } catch { return ''; }
};

// "static/js/main.<hash>.js" y "static/css/main.<hash>.css", ordenados
export function manifestEntrypoints(manifest) {
  const list = Array.isArray(manifest && manifest.entrypoints) ? manifest.entrypoints : [];
  return list.map(toPath).filter((p) => ENTRY.test(p)).sort();
}

// Los mismos, sacados del DOM. En desarrollo (bundle.js sin hash) sale vacío y no se comprueba nada
export function loadedEntrypoints(doc = document) {
  const urls = [
    ...[...doc.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
    ...[...doc.querySelectorAll('link[rel="stylesheet"][href]')].map((l) => l.getAttribute('href')),
  ];
  return [...new Set(urls.map(toPath))].filter((p) => ENTRY.test(p)).sort();
}

// Distintos en JS o en CSS (un deploy que solo cambia estilos también cuenta)
export function isNewer(manifestList, loadedList) {
  if (!manifestList.length || !loadedList.length) return false;
  return manifestList.join('|') !== loadedList.join('|');
}

export async function checkForUpdate(doc = document) {
  const loaded = loadedEntrypoints(doc);
  if (!loaded.length) return false;
  try {
    const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return false;
    return isNewer(manifestEntrypoints(await res.json()), loaded);
  } catch {
    return false;
  }
}

export async function getRegistration() {
  try {
    if (!('serviceWorker' in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

const reloadPage = () => window.location.reload();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Solo desde el botón «Actualizar»: si hay un SW nuevo esperando, se activa y después se recarga.
// Nunca se recarga por un controllerchange que no venga de aquí (cortaría la música)
export async function applyUpdate(reload = reloadPage) {
  await activateWaiting(await getRegistration());
  reload();
}

// Activa el SW nuevo que espera (si lo hay) y vuelve cuando toma el control, o a los 3 s
async function activateWaiting(reg) {
  const waiting = reg && reg.waiting;
  if (!waiting) return;
  await new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 3000);
    try {
      navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch { done(); }
  });
}

// Borra las cachés del SW y recarga. No hace unregister (se perdería la suscripción push) ni toca
// localStorage ni IndexedDB (código de pareja, identidad, fotos pendientes, música).
// Sin red no se toca nada: borrar el shell dejaría una pantalla de error sin botón
export async function repairApp(reload = reloadPage) {
  const res = await fetch('/index.html', { cache: 'no-store' });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) throw new Error('offline');
  const reg = await getRegistration();
  // Un SW nuevo que espera se activa ANTES de borrar: si no, se activaría luego sin shell (sus cachés
  // también se borran y activate no las rehace) y el primer arranque sin red daría error. La recarga
  // con red de abajo le hace guardar el shell de nuevo
  await activateWaiting(reg);
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if (reg && typeof reg.update === 'function') {
    await Promise.race([reg.update().catch(() => {}), delay(5000)]);
  }
  reload();
}
