import { authorEmoji, noteMillis, notePlain, noteWhen } from './noteText';

const at = (dt) => ({ createdAt: { toMillis: () => dt.getTime() } });
const NOW = new Date(2026, 9, 2, 12, 0);

describe('noteWhen', () => {
  test('hoy y ayer llevan la hora', () => {
    expect(noteWhen(at(new Date(2026, 9, 2, 8, 2)), NOW)).toBe('hoy, 08:02');
    expect(noteWhen(at(new Date(2026, 9, 1, 23, 20)), NOW)).toBe('ayer, 23:20');
  });

  test('antes, el día y el mes; el año solo si no es este', () => {
    expect(noteWhen(at(new Date(2026, 8, 12, 10, 0)), NOW)).toBe('12 sep');
    expect(noteWhen(at(new Date(2025, 11, 31, 10, 0)), NOW)).toBe('31 dic 2025');
  });

  test('la nota propia que aún no tiene hora del servidor es de ahora', () => {
    expect(noteWhen({ createdAt: null }, NOW)).toBe('ahora');
    expect(noteMillis({ createdAt: { seconds: 2 } })).toBe(2000);
  });
});

test('el autor: 🫒 él, 🍪 ella, nada si no se sabe', () => {
  expect([authorEmoji('yo'), authorEmoji('ella'), authorEmoji(undefined)]).toEqual(['🫒', '🍪', '']);
});

test('el extracto de una nota rica es su texto plano', () => {
  expect(notePlain({ html: '<p>uno</p><p>dos</p>' })).toBe('uno\ndos');
  expect(notePlain({ plain: 'ya calculado', html: '<p>x</p>' })).toBe('ya calculado');
  expect(notePlain({ body: '# antigua' })).toBe('');
});
