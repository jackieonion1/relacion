// Dark theme, development only until R10 brings "Apariencia" (Claro by default): ?tema=oscuro|claro wins over
// localStorage.tema. Only reads the key; production ignores both and always paints the light theme
const KEY = 'tema';

export function devTheme(search, stored) {
  let fromUrl = null;
  try { fromUrl = new URLSearchParams(search).get(KEY); } catch {}
  const wanted = fromUrl || stored;
  return wanted === 'oscuro' ? 'oscuro' : 'claro';
}

export function applyDevTheme(win = window) {
  if (!import.meta.env.DEV) return;
  let stored = null;
  try { stored = win.localStorage.getItem(KEY); } catch {}
  const root = win.document.documentElement;
  if (devTheme(win.location.search, stored) === 'oscuro') root.dataset.tema = 'oscuro';
  else delete root.dataset.tema;
}
