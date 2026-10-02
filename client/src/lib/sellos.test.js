import { mesiversarios, nombreSello, porAnio, sello } from './sellos';

const iso = (ms) => new Date(ms).toISOString();

describe('sello', () => {
  test('el mes 1 va del día en que empezasteis (24-nov-2024) al 24-dic-2024 incluido, en hora de Madrid', () => {
    const s = sello(1);
    expect(iso(s.fecha)).toBe('2024-12-23T23:00:00.000Z');
    expect(iso(s.desde)).toBe('2024-11-23T23:00:00.000Z');
    expect(iso(s.hasta)).toBe('2024-12-24T23:00:00.000Z'); // 00:00 del 25-dic
  });

  test('los meses se siguen sin hueco ni solape: cada foto cae en un solo sello', () => {
    for (let n = 1; n < 30; n += 1) expect(sello(n + 1).desde).toBe(sello(n).hasta);
    // y con el cambio de hora de por medio (abril es verano: UTC+2)
    expect(iso(sello(5).fecha)).toBe('2025-04-23T22:00:00.000Z');
    expect(iso(sello(5).desde)).toBe('2025-03-24T23:00:00.000Z'); // 00:00 del 25-mar, aún invierno
  });

  test('cada 12.º es un aniversario, con sus años y el año juntos al que pertenece', () => {
    expect(sello(11)).toMatchObject({ aniversario: false, anio: 1 });
    expect(sello(12)).toMatchObject({ aniversario: true, anios: 1, anio: 1 });
    expect(sello(13)).toMatchObject({ aniversario: false, anio: 2 });
    expect(sello(24)).toMatchObject({ aniversario: true, anios: 2, anio: 2 });
    expect(iso(sello(12).fecha)).toBe('2025-11-23T23:00:00.000Z'); // 24-nov-2025
  });
});

describe('mesiversarios', () => {
  test('el 2-oct-2026 hay 22 sellos, el último el del 24-sep, y el 23 llega en 22 días', () => {
    const { sellos, proximo } = mesiversarios(new Date('2026-10-02T10:00:00Z'));
    expect(sellos).toHaveLength(22);
    expect(sellos[0].n).toBe(22);
    expect(sellos.at(-1).n).toBe(1);
    expect(proximo.n).toBe(23);
    expect(proximo.faltan).toBe(22);
  });

  test('el sello de un 24 entra a las 00:00 de Madrid, ni un segundo antes', () => {
    // 24-sep-2026 00:00 Madrid (verano) = 23-sep 22:00 UTC
    expect(mesiversarios(new Date('2026-09-23T21:59:59Z')).sellos[0].n).toBe(21);
    const hoy = mesiversarios(new Date('2026-09-23T22:00:00Z'));
    expect(hoy.sellos[0].n).toBe(22);
    expect(hoy.proximo.faltan).toBe(30); // el del 24-oct
  });

  test('la víspera, el siguiente sello llega mañana', () => {
    expect(mesiversarios(new Date('2026-10-23T10:00:00Z')).proximo.faltan).toBe(1);
  });

  test('antes del primer mesiversario no hay sellos', () => {
    const { sellos, proximo } = mesiversarios(new Date('2024-12-01T10:00:00Z'));
    expect(sellos).toEqual([]);
    expect(proximo.n).toBe(1);
  });
});

describe('porAnio', () => {
  test('agrupa por año juntos, el más reciente primero y cada grupo con su último sello primero', () => {
    const grupos = porAnio(mesiversarios(new Date('2026-10-02T10:00:00Z')).sellos);
    expect(grupos.map((g) => [g.anio, g.sellos[0].n, g.sellos.at(-1).n])).toEqual([[2, 22, 13], [1, 12, 1]]);
  });
});

describe('nombreSello', () => {
  test('«Mes 5», y «1 año» / «2 años» en los aniversarios', () => {
    expect(nombreSello(sello(5))).toBe('Mes 5');
    expect(nombreSello(sello(12))).toBe('1 año');
    expect(nombreSello(sello(24))).toBe('2 años');
  });
});
