import { versionLabel } from './buildInfo';

describe('versionLabel', () => {
  test('versión y fecha de build en hora de Madrid', () => {
    expect(versionLabel('2.3.0', '2026-09-30T16:42:00.000Z', 'Europe/Madrid')).toBe('Versión 2.3.0 · 30/09/2026 18:42');
  });

  test('sin fecha válida muestra solo la versión; sin versión, nada', () => {
    expect(versionLabel('2.3.0', '')).toBe('Versión 2.3.0');
    expect(versionLabel('2.3.0', 'no-es-fecha')).toBe('Versión 2.3.0');
    expect(versionLabel('', '2026-09-30T16:42:00.000Z')).toBe('');
  });

  test('craco inyecta la versión del package.json', () => {
    expect(process.env.REACT_APP_VERSION).toBe(require('../../package.json').version);
    expect(versionLabel()).toMatch(/^Versión \d+\.\d+\.\d+ · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});
