import { shouldTouch } from './photoCache';

describe('shouldTouch (toque del LRU de originales)', () => {
  const now = 1_000_000_000;

  test('tocado hace menos de 10 minutos: no se reescribe', () => {
    expect(shouldTouch({ ts: now - 60 * 1000 }, now)).toBe(false);
    expect(shouldTouch({ ts: now - 10 * 60 * 1000 }, now)).toBe(false);
  });

  test('más de 10 minutos o sin ts: se toca', () => {
    expect(shouldTouch({ ts: now - 10 * 60 * 1000 - 1 }, now)).toBe(true);
    expect(shouldTouch({}, now)).toBe(true);
  });
});
