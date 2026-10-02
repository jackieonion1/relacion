import { MAX_PARTICLES, particles, sceneFor, seeded, skyKind, windTilt } from './escena';
import { weatherType } from './weather';

// Every WMO code Open-Meteo documents, with the scene it must draw (the table of the animated weather)
const WMO = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 98, 99];

describe('sceneFor', () => {
  test('cada código WMO tiene escena y su tipo es el de weatherType', () => {
    for (const code of WMO) {
      const s = sceneFor(code);
      expect(s.type, String(code)).toBe(weatherType(code));
      expect(s.sky || s.fog || s.clouds + s.drops + s.flakes > 0, String(code)).toBe(true);
      expect(s.drops + s.flakes + s.hail, String(code)).toBeLessThanOrEqual(MAX_PARTICLES);
    }
  });

  test('despejado y poco nuboso abren cielo; cubierto y niebla no', () => {
    expect([0, 1, 2].map((c) => sceneFor(c).sky)).toEqual([true, true, true]);
    expect(sceneFor(0).clouds).toBe(0);
    expect([1, 2].map((c) => sceneFor(c).clouds)).toEqual([1, 2]);
    expect(sceneFor(3)).toMatchObject({ sky: false, clouds: 3 });
    expect([45, 48].map((c) => sceneFor(c).fog)).toEqual([true, true]);
    expect([45, 48].map((c) => sceneFor(c).frost)).toEqual([false, true]);
  });

  test('llovizna 8 / 12 / 16 gotas finas y lluvia 10 / 16 / 24', () => {
    expect([51, 53, 55].map((c) => sceneFor(c).drops)).toEqual([8, 12, 16]);
    expect([51, 53, 55].map((c) => sceneFor(c).fine)).toEqual([true, true, true]);
    expect([61, 63, 65].map((c) => sceneFor(c).drops)).toEqual([10, 16, 24]);
    expect([61, 63, 65].map((c) => sceneFor(c).fine)).toEqual([false, false, false]);
  });

  test('la lluvia o llovizna helada suma escarcha, y los chubascos van a rachas', () => {
    expect([56, 57, 66, 67].map((c) => sceneFor(c).frost)).toEqual([true, true, true, true]);
    expect([61, 63, 65].map((c) => sceneFor(c).frost)).toEqual([false, false, false]);
    expect([80, 81, 82, 85, 86].map((c) => sceneFor(c).gusts)).toEqual([true, true, true, true, true]);
    expect([61, 71, 95].map((c) => sceneFor(c).gusts)).toEqual([false, false, false]);
  });

  test('nieve 8 / 14 / 20 copos; los granos (77) son rápidos y sin vaivén', () => {
    expect([71, 73, 75].map((c) => sceneFor(c).flakes)).toEqual([8, 14, 20]);
    expect(sceneFor(77)).toMatchObject({ grains: true });
    expect(sceneFor(71).grains).toBe(false);
  });

  test('toda tormenta lleva destello y solo 96 y 99 granizo; la 97 ya no sale «parcial»', () => {
    for (const c of [95, 96, 97, 98, 99]) expect(sceneFor(c)).toMatchObject({ type: 'tormenta', storm: true });
    expect([95, 96, 97, 99].map((c) => sceneFor(c).hail > 0)).toEqual([false, true, false, true]);
    expect(sceneFor(97).drops).toBeGreaterThanOrEqual(sceneFor(95).drops);
  });

  test('un código desconocido o sin dato cae en poco nuboso, como weatherType', () => {
    for (const c of [999, null, undefined, -1]) {
      expect(sceneFor(c)).toMatchObject({ type: 'parcial', sky: true, clouds: 2, drops: 0, flakes: 0 });
    }
  });
});

describe('skyKind (día y noche)', () => {
  test('sol de día, al amanecer y al atardecer; estrellas de noche; nada si el cielo está cerrado', () => {
    const clear = sceneFor(0);
    expect(['dawn', 'day', 'dusk'].map((p) => skyKind(clear, p))).toEqual(['sol', 'sol', 'sol']);
    expect(skyKind(clear, 'night')).toBe('estrellas');
    expect(skyKind(sceneFor(2), 'night')).toBe('estrellas');
    for (const c of [3, 45, 61, 71, 95]) expect(skyKind(sceneFor(c), 'day')).toBeNull();
    expect(skyKind(sceneFor(61), 'night')).toBeNull();
  });
});

describe('windTilt', () => {
  test('inclina un tercio de la velocidad, como mucho 20°, y 0 sin viento o sin dato', () => {
    expect(windTilt(0)).toBe(0);
    expect(windTilt(null)).toBe(0);
    expect(windTilt(NaN)).toBe(0);
    expect(windTilt(12)).toBe(-4);
    expect(windTilt(200)).toBe(-20);
  });
});

describe('seeded y particles', () => {
  test('la misma semilla da las mismas partículas, otra semilla otras', () => {
    const a = particles(8, seeded('61|Ciudad A'), { t0: 0.7, t1: 0.9 });
    const b = particles(8, seeded('61|Ciudad A'), { t0: 0.7, t1: 0.9 });
    const c = particles(8, seeded('61|Ciudad B'), { t0: 0.7, t1: 0.9 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test('caen dentro del rango: posición en la tarjeta, duración, opacidad y retraso negativo', () => {
    const list = particles(40, seeded('x'), { t0: 4, t1: 7, o0: 0.65, o1: 1 });
    expect(list).toHaveLength(40);
    for (const p of list) {
      expect(p.x).toBeGreaterThanOrEqual(2);
      expect(p.x).toBeLessThanOrEqual(98);
      expect(p.y).toBeGreaterThanOrEqual(8);
      expect(p.y).toBeLessThanOrEqual(86);
      expect(p.t).toBeGreaterThanOrEqual(4);
      expect(p.t).toBeLessThanOrEqual(7);
      expect(p.o).toBeGreaterThanOrEqual(0.65);
      expect(p.o).toBeLessThanOrEqual(1);
      expect(p.d).toBeLessThanOrEqual(0);
      expect(p.d).toBeGreaterThanOrEqual(-p.t);
    }
    expect(particles(0, seeded('x'), { t0: 1, t1: 2 })).toEqual([]);
  });
});
