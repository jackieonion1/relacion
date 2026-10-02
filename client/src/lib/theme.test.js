import { applyDevTheme, devTheme } from './theme';

afterEach(() => {
  vi.unstubAllEnvs();
  delete document.documentElement.dataset.tema;
  localStorage.clear();
});

test('?tema= manda sobre localStorage.tema y cualquier otro valor es claro', () => {
  expect(devTheme('?tema=oscuro', null)).toBe('oscuro');
  expect(devTheme('?tema=claro', 'oscuro')).toBe('claro');
  expect(devTheme('', 'oscuro')).toBe('oscuro');
  expect(devTheme('', null)).toBe('claro');
  expect(devTheme('?tema=dark', null)).toBe('claro');
});

test('en desarrollo pone el oscuro en <html> y lo quita al volver a claro', () => {
  localStorage.setItem('tema', 'oscuro');
  applyDevTheme(window);
  expect(document.documentElement.dataset.tema).toBe('oscuro');
  localStorage.setItem('tema', 'claro');
  applyDevTheme(window);
  expect(document.documentElement.dataset.tema).toBeUndefined();
});

test('en producción se ignora: siempre claro', () => {
  vi.stubEnv('DEV', false);
  localStorage.setItem('tema', 'oscuro');
  applyDevTheme(window);
  expect(document.documentElement.dataset.tema).toBeUndefined();
});
