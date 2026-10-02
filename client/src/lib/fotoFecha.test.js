import { fechaEfectiva, madridMediodia, rangoDiaMadrid, rangoMesMadrid, unirPorFechaEfectiva } from './fotoFecha';

const iso = (ms) => new Date(ms).toISOString();

describe('fechaEfectiva', () => {
  test('takenAt manda sobre createdAt', () => {
    expect(fechaEfectiva({ createdAt: 500, takenAt: 100 })).toBe(100);
  });

  test('sin takenAt (ausente o null) cae en createdAt', () => {
    expect(fechaEfectiva({ createdAt: 500 })).toBe(500);
    expect(fechaEfectiva({ createdAt: 500, takenAt: null })).toBe(500);
  });
});

describe('días y meses en Madrid', () => {
  test('en invierno el día empieza a las 23:00 UTC del anterior', () => {
    const { desde, hasta } = rangoDiaMadrid(2026, 0, 15);
    expect(iso(desde)).toBe('2026-01-14T23:00:00.000Z');
    expect(iso(hasta)).toBe('2026-01-15T23:00:00.000Z');
  });

  test('en verano empieza a las 22:00 UTC del anterior', () => {
    expect(iso(rangoDiaMadrid(2026, 6, 1).desde)).toBe('2026-06-30T22:00:00.000Z');
  });

  test('el día del cambio de hora dura 23 h (marzo) o 25 h (octubre)', () => {
    const marzo = rangoDiaMadrid(2026, 2, 29);
    expect((marzo.hasta - marzo.desde) / 3600000).toBe(23);
    const octubre = rangoDiaMadrid(2026, 9, 25);
    expect((octubre.hasta - octubre.desde) / 3600000).toBe(25);
  });

  test('el mes enlaza con el siguiente, también al pasar de año', () => {
    expect(rangoMesMadrid(2026, 10).hasta).toBe(rangoMesMadrid(2026, 11).desde);
    expect(rangoMesMadrid(2026, 11).hasta).toBe(rangoMesMadrid(2027, 0).desde);
    expect(iso(rangoMesMadrid(2026, 1).hasta)).toBe('2026-02-28T23:00:00.000Z');
  });

  test('el mediodía de Madrid cae dentro de su día', () => {
    const t = madridMediodia('2025-11-24');
    expect(iso(t)).toBe('2025-11-24T11:00:00.000Z');
    const { desde, hasta } = rangoDiaMadrid(2025, 10, 24);
    expect(t >= desde && t < hasta).toBe(true);
    expect(iso(madridMediodia('2026-07-24'))).toBe('2026-07-24T10:00:00.000Z');
  });
});

describe('unirPorFechaEfectiva', () => {
  const foto = (id, createdAt, takenAt) => ({ id, createdAt, ...(takenAt !== undefined ? { takenAt } : {}) });

  test('quita de la consulta por createdAt lo que se hizo en otro día, y no repite ids', () => {
    const porCreated = [foto('a', 150), foto('b', 160, 5000), foto('c', 170, 120)];
    const porTaken = [foto('c', 170, 120), foto('d', 9000, 140)];
    const out = unirPorFechaEfectiva(porCreated, porTaken, 100, 200);
    expect(out.map((f) => f.id)).toEqual(['a', 'd', 'c']);
  });

  test('el rango es [desde, hasta)', () => {
    const out = unirPorFechaEfectiva([foto('a', 100), foto('b', 200)], [], 100, 200);
    expect(out.map((f) => f.id)).toEqual(['a']);
  });
});
