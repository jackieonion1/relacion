// The three celebrations: emoji and how often a new burst starts, in ms (the same as the 2.x engine)
export const RAIN = {
  rain: { emoji: ['💖', '💕', '💗', '❤️', '💝'], every: 800 },
  birthday: { emoji: ['🎂', '🍰', '🎉', '🎊', '🎈', '🎁', '🥳', '🎀', '🍾', '🎵', '🎶', '⭐', '✨'], every: 700 },
  fireworks: { emoji: ['💖', '💕', '💗', '❤️', '💝', '🎆', '✨', '🎇'], every: 2000 },
};

// Most particles on screen at once: past it the oldest go first, so an endless rain never piles up in the DOM
export const MAX_PARTICLES = 160;

// Every particle has finished by then: the longest is a 600 ms delay plus the 4 s fall
export const PARTICLE_TTL = 5000;

export function rainKind(type) {
  return RAIN[type] ? type : 'rain';
}

const clamp = (v) => Math.max(0.2, Math.min(1, v));
const pick = (list, rand) => list[Math.floor(rand() * list.length)];

// One burst of particles. nextId() gives unique keys; rand is injectable for tests
export function burst(type, intensity = 1, nextId, rand = Math.random) {
  const kind = rainKind(type);
  const { emoji } = RAIN[kind];
  const now = Date.now();

  if (kind === 'fireworks') {
    // 2-4 explosions 300 ms apart (staggered with animation-delay instead of timers), scaled by intensity
    const k = clamp(intensity);
    const explosions = Math.max(1, Math.round((Math.floor(rand() * 3) + 2) * k));
    const perExplosion = Math.max(6, Math.round(15 * (0.4 + 0.6 * k)));
    const out = [];
    for (let e = 0; e < explosions; e++) {
      const centerX = rand() * 80 + 10;
      const centerY = rand() * 60 + 20;
      for (let i = 0; i < perExplosion; i++) {
        const angle = (i / perExplosion) * 2 * Math.PI;
        const distance = (100 + rand() * 150) * (0.7 + 0.3 * k);
        out.push({
          id: `fireworks-${nextId()}`,
          kind,
          left: centerX,
          top: centerY,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          delay: e * 300 + rand() * 200,
          size: rand() + 1.2,
          emoji: pick(emoji, rand),
          createdAt: now,
        });
      }
    }
    return out;
  }

  // Falling rain: 3-7 hearts, or 4-9 slightly larger party elements on a birthday
  const party = kind === 'birthday';
  const count = party ? Math.floor(rand() * 6) + 4 : Math.floor(rand() * 5) + 3;
  return Array.from({ length: count }, () => ({
    id: `${kind}-${nextId()}`,
    kind,
    left: rand() * 100,
    delay: rand() * (party ? 600 : 500),
    size: rand() * 0.8 + (party ? 1.2 : 1),
    emoji: pick(emoji, rand),
    createdAt: now,
  }));
}

// Adds a burst, drops the expired ones and keeps at most MAX_PARTICLES (the newest)
export function addBurst(particles, fresh, now = Date.now()) {
  const alive = particles.filter((p) => now - p.createdAt < PARTICLE_TTL).concat(fresh);
  return alive.length > MAX_PARTICLES ? alive.slice(alive.length - MAX_PARTICLES) : alive;
}
