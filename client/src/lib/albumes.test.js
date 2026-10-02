import { albumDeEvento, combinarAlbumes, diasDeAlbum, idDeEvento, rangoDeAlbum } from './albumes';

const iso = (ms) => new Date(ms).toISOString();
// Noon in Madrid of y-m-d (Nov-Mar are CET, so UTC+1)
const dia = (y, m, d, h = 11) => Date.UTC(y, m - 1, d, h);
const evento = (id, start, end = null) => ({ id, title: `Evento ${id}`, start, end });
const doc = (id, extra = {}) => ({ id, titulo: id, emoji: '🩷', tipo: 'manual', eventId: null, start: null, end: null, excluidas: [], virtual: false, creadoEn: 0, ...extra });

describe('diasDeAlbum', () => {
  test('cuenta los días naturales de Madrid, el primero y el último incluidos', () => {
    expect(diasDeAlbum({ start: dia(2026, 3, 12), end: dia(2026, 3, 15, 22) })).toBe(4);
    expect(diasDeAlbum({ start: dia(2026, 3, 12), end: null })).toBe(1);
    expect(diasDeAlbum({ start: null, end: null })).toBe(0);
  });

  test('un fin a las 23:59 del último día no suma otro día', () => {
    expect(diasDeAlbum({ start: dia(2026, 2, 14), end: dia(2026, 2, 14, 22) + 3599000 })).toBe(1);
  });
});

describe('rangoDeAlbum', () => {
  test('va del primer día a 3 días después del último, [desde, hasta) en hora de Madrid', () => {
    const { desde, hasta } = rangoDeAlbum({ start: dia(2026, 1, 12), end: dia(2026, 1, 15) });
    expect(iso(desde)).toBe('2026-01-11T23:00:00.000Z'); // 00:00 del 12-ene
    expect(iso(hasta)).toBe('2026-01-18T23:00:00.000Z'); // 00:00 del 19-ene: el 15 + 3 días de margen
  });

  test('un evento sin fin es un día con su margen', () => {
    const { desde, hasta } = rangoDeAlbum({ start: dia(2026, 1, 12), end: null });
    expect(iso(desde)).toBe('2026-01-11T23:00:00.000Z');
    expect(iso(hasta)).toBe('2026-01-15T23:00:00.000Z');
  });
});

describe('albumDeEvento', () => {
  test('es virtual, con el id determinista ev-<id> y las fechas del evento', () => {
    const a = albumDeEvento(evento('abc', 5, 9));
    expect(a).toMatchObject({ id: 'ev-abc', eventId: 'abc', tipo: 'evento', virtual: true, start: 5, end: 9, titulo: 'Evento abc' });
    expect(idDeEvento('abc')).toBe('ev-abc');
  });
});

describe('combinarAlbumes', () => {
  const ahora = dia(2026, 10, 2);

  test('los eventos de más de un día son viajes (el más reciente primero) y los de un día van a «cortos»', () => {
    const { viajes, cortos, manuales } = combinarAlbumes([], [
      evento('a', dia(2025, 6, 2), dia(2025, 6, 5)),
      evento('b', dia(2026, 3, 12), dia(2026, 3, 15)),
      evento('c', dia(2026, 2, 14), dia(2026, 2, 14, 22)),
      evento('d', dia(2026, 5, 1)),
    ], ahora);
    expect(viajes.map((a) => a.eventId)).toEqual(['b', 'a']);
    expect(cortos.map((a) => a.eventId)).toEqual(['d', 'c']);
    expect(manuales).toEqual([]);
  });

  test('los eventos que aún no han llegado no son álbumes', () => {
    const { viajes, cortos } = combinarAlbumes([], [evento('f', dia(2026, 12, 20), dia(2026, 12, 24))], ahora);
    expect(viajes).toEqual([]);
    expect(cortos).toEqual([]);
  });

  test('un álbum con doc gana al virtual del mismo evento (conserva su título y sus excluidas)', () => {
    const real = doc('ev-a', { tipo: 'evento', eventId: 'a', start: dia(2025, 6, 2), end: dia(2025, 6, 5), titulo: 'Lisboa', excluidas: ['x'] });
    const { viajes } = combinarAlbumes([real], [evento('a', dia(2025, 6, 2), dia(2025, 6, 5))], ahora);
    expect(viajes).toHaveLength(1);
    expect(viajes[0]).toMatchObject({ titulo: 'Lisboa', virtual: false, excluidas: ['x'] });
  });

  test('si el evento se borra, su álbum con doc se queda', () => {
    const real = doc('ev-a', { tipo: 'evento', eventId: 'a', start: dia(2025, 6, 2), end: dia(2025, 6, 5) });
    expect(combinarAlbumes([real], [], ahora).viajes.map((a) => a.id)).toEqual(['ev-a']);
  });

  test('los álbumes a mano van aparte, el último creado primero', () => {
    const { manuales } = combinarAlbumes([doc('a', { creadoEn: 1 }), doc('b', { creadoEn: 3 }), doc('c', { creadoEn: 2 })], [], ahora);
    expect(manuales.map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });
});
