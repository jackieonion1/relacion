import { normalizePairCode, isValidPairCode } from './pairCode';

describe('pairCode', () => {
  test('normaliza a mayúsculas y sin espacios', () => {
    expect(normalizePairCode('  seb1998 ')).toBe('SEB1998');
    expect(normalizePairCode(undefined)).toBe('');
  });

  test('acepta códigos de 4 a 12 letras o números', () => {
    expect(isValidPairCode('135790')).toBe(true);
    expect(isValidPairCode('seb1998')).toBe(true);
    expect(isValidPairCode('ABCD')).toBe(true);
    expect(isValidPairCode('ABCDEFGHIJKL')).toBe(true);
  });

  test('rechaza códigos parciales, largos o con símbolos', () => {
    expect(isValidPairCode('')).toBe(false);
    expect(isValidPairCode('ABC')).toBe(false);
    expect(isValidPairCode('ABCDEFGHIJKLM')).toBe(false);
    expect(isValidPairCode('AB-12')).toBe(false);
    expect(isValidPairCode('a/b12')).toBe(false);
    expect(isValidPairCode('AB 12')).toBe(false);
  });
});
