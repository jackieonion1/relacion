// The animated sky of the weather cards (CieloAnimado): which scene each WMO code draws and where its particles go.
// Pure, so the table and the placement are tested without a DOM
import { weatherType } from './weather';

// Most particles a card shows at rest; a tap adds up to as many again for two seconds
export const MAX_PARTICLES = 26;

const SCENES = {
  // Clear: sun by day, stars by night
  0: { sky: true },
  1: { sky: true, clouds: 1 },
  2: { sky: true, clouds: 2 },
  3: { clouds: 3 },
  45: { fog: true },
  48: { fog: true, frost: true },
  // Drizzle: thin and slow
  51: { drops: 8, fine: true, clouds: 1 },
  53: { drops: 12, fine: true, clouds: 1 },
  55: { drops: 16, fine: true, clouds: 1 },
  // Freezing drizzle and freezing rain: rain with a frosted edge
  56: { drops: 8, fine: true, frost: true, clouds: 1 },
  57: { drops: 14, fine: true, frost: true, clouds: 1 },
  66: { drops: 12, frost: true, clouds: 1 },
  67: { drops: 18, frost: true, clouds: 1 },
  61: { drops: 10, clouds: 1 },
  63: { drops: 16, clouds: 1 },
  65: { drops: 24, clouds: 2 },
  // Showers come in gusts: the layer fades in and out
  80: { drops: 10, gusts: true, clouds: 1 },
  81: { drops: 16, gusts: true, clouds: 1 },
  82: { drops: 24, gusts: true, clouds: 1 },
  71: { flakes: 8, clouds: 1 },
  73: { flakes: 14, clouds: 1 },
  75: { flakes: 20, clouds: 2 },
  // Snow grains: small, quick, no sway
  77: { flakes: 12, grains: true, clouds: 1 },
  85: { flakes: 10, gusts: true, clouds: 1 },
  86: { flakes: 16, gusts: true, clouds: 1 },
  95: { drops: 20, storm: true, clouds: 2 },
  96: { drops: 20, storm: true, hail: 6, clouds: 2 },
  97: { drops: 24, storm: true, clouds: 2 },
  98: { drops: 20, storm: true, clouds: 2 },
  99: { drops: 20, storm: true, hail: 6, clouds: 2 },
};

// Where an unknown (or missing) code lands, the same as weatherType() does: partly cloudy
const FALLBACK = SCENES[2];

// What to draw for a WMO code: { type, sky, clouds, drops, flakes, hail, fog, frost, fine, grains, gusts, storm }
export function sceneFor(code) {
  const s = SCENES[code] || FALLBACK;
  return {
    type: weatherType(code),
    sky: !!s.sky, clouds: s.clouds || 0, drops: s.drops || 0, flakes: s.flakes || 0, hail: s.hail || 0,
    fog: !!s.fog, frost: !!s.frost, fine: !!s.fine, grains: !!s.grains, gusts: !!s.gusts, storm: !!s.storm,
  };
}

// Sun by day and at the edges of it, stars at night, only when the scene has an open sky
export function skyKind(scene, phase) {
  if (!scene.sky) return null;
  return phase === 'night' ? 'estrellas' : 'sol';
}

// Rain slants with the wind: degrees to rotate the layer by, 0 with no wind and at most 20. Negative so the drops
// lean to the right, the way a west wind pushes them
export function windTilt(wind) {
  if (!(wind > 0)) return 0;
  return -Math.min(20, Math.round(wind / 3));
}

// Small deterministic generator (mulberry32) seeded from a string: the same sky draws the same every render
export function seeded(text) {
  const str = String(text);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// n particles spread over the card: x and y in %, a negative delay so they are mid-fall from the first frame,
// a duration in [t0, t1] seconds, an opacity in [o0, o1]. y is where the still frame (reduced motion) leaves them
export function particles(n, rand, { t0, t1, o0 = 0.5, o1 = 0.9 }) {
  return Array.from({ length: n }, (_, i) => {
    const t = t0 + rand() * (t1 - t0);
    return {
      i,
      x: round(2 + rand() * 96),
      y: round(8 + rand() * 78),
      t: round(t, 2),
      d: round(-rand() * t, 2),
      o: round(o0 + rand() * (o1 - o0), 2),
      s: round(0.7 + rand() * 0.6, 2),
    };
  });
}
