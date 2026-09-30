import { ANNIVERSARY, timeBetween } from './together';

describe('ANNIVERSARY', () => {
  test('es el 24 de noviembre a medianoche local, en cualquier huso', () => {
    // new Date('2024-11-24') sería medianoche UTC: en América caería el 23
    expect([ANNIVERSARY.getFullYear(), ANNIVERSARY.getMonth(), ANNIVERSARY.getDate()]).toEqual([2024, 10, 24]);
    expect([ANNIVERSARY.getHours(), ANNIVERSARY.getMinutes()]).toEqual([0, 0]);
  });
});

describe('timeBetween', () => {
  test('el mismo día del aniversario son años exactos', () => {
    expect(timeBetween(ANNIVERSARY, new Date(2026, 10, 24, 0, 1))).toEqual({ years: 2, months: 0, days: 0 });
  });

  test('la víspera del mesiversario aún no suma el mes', () => {
    expect(timeBetween(ANNIVERSARY, new Date(2026, 8, 30, 23, 59))).toEqual({ years: 1, months: 10, days: 6 });
  });

  test('pasado fin de mes pide prestados los días del mes anterior', () => {
    expect(timeBetween(ANNIVERSARY, new Date(2025, 2, 1))).toEqual({ years: 0, months: 3, days: 5 });
  });
});
