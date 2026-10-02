// "Apariencia" in Ajustes: Claro by default (plan Q5), Oscuro, or Sistema (follows prefers-color-scheme). The choice
// is localStorage.tema; the inline script of index.html paints it before the first frame with these same rules
export const THEME_KEY = 'tema';
export const THEMES = ['sistema', 'claro', 'oscuro'];
// The paper of each theme (index.css), so the status bar continues the page
export const THEME_COLOR = { claro: '#fdf5f3', oscuro: '#191010' };
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readTheme(storage) {
  let stored = null;
  try { stored = storage.getItem(THEME_KEY); } catch {}
  return THEMES.includes(stored) ? stored : 'claro';
}

export function resolveTheme(pref, systemDark) {
  return pref === 'oscuro' || (pref === 'sistema' && systemDark) ? 'oscuro' : 'claro';
}

function systemDark(win) {
  try { return !!win.matchMedia?.(DARK_QUERY).matches; } catch { return false; }
}

export function applyTheme(win = window) {
  const theme = resolveTheme(readTheme(win.localStorage), systemDark(win));
  const root = win.document.documentElement;
  if (theme === 'oscuro') root.dataset.tema = 'oscuro';
  else delete root.dataset.tema;
  const meta = win.document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
  return theme;
}

export function setTheme(pref, win = window) {
  try { win.localStorage.setItem(THEME_KEY, pref); } catch {}
  return applyTheme(win);
}

// With Sistema, follow the phone when it switches between light and dark while the app is open
export function watchSystemTheme(win = window) {
  let mq = null;
  try { mq = win.matchMedia?.(DARK_QUERY); } catch {}
  if (!mq?.addEventListener) return () => {};
  const onChange = () => { if (readTheme(win.localStorage) === 'sistema') applyTheme(win); };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
