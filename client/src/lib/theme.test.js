import fs from 'fs';
import path from 'path';
import { applyTheme, readTheme, resolveTheme, setTheme, watchSystemTheme } from './theme';

const meta = () => document.querySelector('meta[name="theme-color"]');

function mockSystem(dark) {
  const listeners = new Set();
  const mq = { matches: dark, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) };
  window.matchMedia = vi.fn(() => mq);
  return { mq, listeners, flip(to) { mq.matches = to; listeners.forEach((f) => f()); } };
}

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#fdf5f3">';
});
afterEach(() => {
  delete window.matchMedia;
  delete document.documentElement.dataset.tema;
  localStorage.clear();
});

test('Claro por defecto: sin clave, o con un valor que no es de Apariencia', () => {
  expect(readTheme(localStorage)).toBe('claro');
  localStorage.setItem('tema', 'dark');
  expect(readTheme(localStorage)).toBe('claro');
  localStorage.setItem('tema', 'sistema');
  expect(readTheme(localStorage)).toBe('sistema');
});

test('Sistema sigue al móvil; Claro y Oscuro no', () => {
  expect(resolveTheme('sistema', true)).toBe('oscuro');
  expect(resolveTheme('sistema', false)).toBe('claro');
  expect(resolveTheme('claro', true)).toBe('claro');
  expect(resolveTheme('oscuro', false)).toBe('oscuro');
});

test('aunque el móvil esté en oscuro, sin elegir nada se pinta claro (también en producción)', () => {
  vi.stubEnv('DEV', false);
  mockSystem(true);
  expect(applyTheme(window)).toBe('claro');
  expect(document.documentElement.dataset.tema).toBeUndefined();
  expect(meta().getAttribute('content')).toBe('#fdf5f3');
  vi.unstubAllEnvs();
});

test('elegir Oscuro lo guarda en tema, lo pone en <html> y cambia theme-color; ?tema= ya no cuenta', () => {
  mockSystem(false);
  window.history.replaceState(null, '', '/?tema=claro');
  setTheme('oscuro', window);
  expect(localStorage.getItem('tema')).toBe('oscuro');
  expect(document.documentElement.dataset.tema).toBe('oscuro');
  expect(meta().getAttribute('content')).toBe('#191010');
  setTheme('claro', window);
  expect(document.documentElement.dataset.tema).toBeUndefined();
  expect(meta().getAttribute('content')).toBe('#fdf5f3');
  window.history.replaceState(null, '', '/');
});

test('el script de index.html pinta antes del primer frame lo mismo que applyTheme', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const inline = new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  for (const stored of [null, 'claro', 'oscuro', 'sistema', 'dark']) {
    for (const dark of [false, true]) {
      localStorage.clear();
      if (stored) localStorage.setItem('tema', stored);
      mockSystem(dark);
      document.head.innerHTML = '<meta name="theme-color" content="#fdf5f3">';
      delete document.documentElement.dataset.tema;
      inline();
      const painted = [document.documentElement.dataset.tema, meta().getAttribute('content')];
      applyTheme(window);
      expect(painted).toEqual([document.documentElement.dataset.tema, meta().getAttribute('content')]);
    }
  }
});

test('con Sistema, el cambio del móvil se aplica al momento; con Claro, no', () => {
  const sys = mockSystem(false);
  const stop = watchSystemTheme(window);
  setTheme('sistema', window);
  sys.flip(true);
  expect(document.documentElement.dataset.tema).toBe('oscuro');
  setTheme('claro', window);
  sys.flip(true);
  expect(document.documentElement.dataset.tema).toBeUndefined();
  stop();
  expect(sys.listeners.size).toBe(0);
});
