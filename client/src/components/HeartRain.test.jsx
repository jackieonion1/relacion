import React from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import HeartRainAnimation from './HeartRainAnimation';
import { RAIN, MAX_PARTICLES, PARTICLE_TTL, addBurst, burst } from '../lib/rain';

const particles = () => Array.from(document.querySelectorAll('[data-testid="heart-rain"] > div'));
const stopButton = () => screen.queryByRole('button', { name: 'Parar la fiesta' });

function reducedMotion(matches) {
  window.matchMedia = vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete window.matchMedia;
});

test('los emoji y los ritmos de las tres lluvias son los de siempre', () => {
  expect(RAIN.rain).toEqual({ emoji: ['💖', '💕', '💗', '❤️', '💝'], every: 800 });
  expect(RAIN.birthday).toEqual({ emoji: ['🎂', '🍰', '🎉', '🎊', '🎈', '🎁', '🥳', '🎀', '🍾', '🎵', '🎶', '⭐', '✨'], every: 700 });
  expect(RAIN.fireworks).toEqual({ emoji: ['💖', '💕', '💗', '❤️', '💝', '🎆', '✨', '🎇'], every: 2000 });
});

test('inactiva no pinta nada ni deja temporizadores', () => {
  render(<HeartRainAnimation isActive={false} />);
  expect(particles()).toHaveLength(0);
  expect(stopButton()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test.each([
  ['rain', 800],
  ['birthday', 700],
  ['fireworks', 2000],
])('la lluvia %s cae al momento y sigue cayendo cada %i ms mientras está activa', (type, every) => {
  render(<HeartRainAnimation isActive type={type} />);
  const first = particles().length;
  expect(first).toBeGreaterThan(0);
  for (const p of particles()) expect(RAIN[type].emoji).toContain(p.textContent);
  act(() => { vi.advanceTimersByTime(every); });
  expect(particles().length).toBeGreaterThan(first);
  // a minute later it is still falling: the loop has no end of its own
  act(() => { vi.advanceTimersByTime(60 * 1000); });
  expect(particles().length).toBeGreaterThan(0);
  expect(vi.getTimerCount()).toBe(1);
});

test('un tipo desconocido cae como la lluvia de corazones', () => {
  render(<HeartRainAnimation isActive type="nope" />);
  for (const p of particles()) expect(RAIN.rain.emoji).toContain(p.textContent);
});

test('los fuegos respetan la opacidad del efecto', () => {
  render(<HeartRainAnimation isActive type="fireworks" intensity={0.4} effectOpacity={0.55} zIndex={10045} />);
  expect(document.querySelector('[data-testid="heart-rain"]').style.zIndex).toBe('10045');
  expect(particles()[0].style.filter).toBe('opacity(0.55)');
});

test.each(['rain', 'birthday', 'fireworks'])('la lluvia %s, infinita, no se acumula en el DOM', (type) => {
  render(<HeartRainAnimation isActive type={type} />);
  act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
  expect(particles().length).toBeGreaterThan(0);
  expect(particles().length).toBeLessThanOrEqual(MAX_PARTICLES);
});

test('addBurst tira las caducadas y se queda con las MAX_PARTICLES más nuevas', () => {
  let id = 0;
  const nextId = () => id++;
  const old = burst('rain', 1, nextId).map((p) => ({ ...p, createdAt: 0 }));
  expect(addBurst(old, [], PARTICLE_TTL)).toEqual([]);
  const many = Array.from({ length: MAX_PARTICLES + 40 }, (_, i) => ({ id: i, createdAt: 1000 }));
  const kept = addBurst(many, [{ id: 'new', createdAt: 1000 }], 1000);
  expect(kept).toHaveLength(MAX_PARTICLES);
  expect(kept[kept.length - 1].id).toBe('new');
  expect(kept[0].id).toBe(41);
});

test('«Parar la fiesta» es un botón accesible de 44 px como poco', () => {
  render(<HeartRainAnimation isActive />);
  expect(stopButton().getAttribute('type')).toBe('button');
  // jsdom does not load the stylesheet, so the size is checked in the file
  const css = readFileSync(path.join(__dirname, 'HeartRain.css'), 'utf8');
  const rule = css.match(/\.heart-rain-stop \{([^}]*)\}/)[1];
  expect(rule).toMatch(/min-height: 44px/);
  expect(rule).toMatch(/min-width: 44px/);
  expect(rule).toMatch(/pointer-events: auto/);
});

test('«Parar la fiesta» llama a onStop, quita la lluvia y su intervalo', () => {
  const onStop = vi.fn();
  render(<HeartRainAnimation isActive type="fireworks" onStop={onStop} />);
  fireEvent.click(stopButton());
  expect(onStop).toHaveBeenCalledTimes(1);
  expect(particles()).toHaveLength(0);
  expect(stopButton()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test('sin onStop se queda parada hasta que la página la apaga y la vuelve a encender', () => {
  const { rerender } = render(<HeartRainAnimation isActive type="rain" />);
  fireEvent.click(stopButton());
  act(() => { vi.advanceTimersByTime(5000); });
  expect(particles()).toHaveLength(0);
  rerender(<HeartRainAnimation isActive type="rain" />);
  expect(particles()).toHaveLength(0);
  rerender(<HeartRainAnimation isActive={false} type="rain" />);
  rerender(<HeartRainAnimation isActive type="rain" />);
  expect(particles().length).toBeGreaterThan(0);
  expect(stopButton()).not.toBeNull();
});

test('otra celebración vuelve a caer aunque se parara la anterior', () => {
  const { rerender } = render(<HeartRainAnimation isActive type="rain" />);
  fireEvent.click(stopButton());
  rerender(<HeartRainAnimation isActive type="birthday" />);
  expect(particles().length).toBeGreaterThan(0);
});

test('con reducir movimiento no cae nada, pero queda la señal quieta y «Parar»', () => {
  reducedMotion(true);
  render(<HeartRainAnimation isActive type="birthday" />);
  expect(document.querySelector('[data-testid="heart-rain"]')).toBeNull();
  expect(screen.queryByText('🎂🍰🎉')).not.toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(stopButton());
  expect(screen.queryByText('🎂🍰🎉')).toBeNull();
});

test('sin reducir movimiento sí cae', () => {
  reducedMotion(false);
  render(<HeartRainAnimation isActive />);
  expect(particles().length).toBeGreaterThan(0);
  expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
});

test('al desmontar o apagarla no queda ningún intervalo vivo', () => {
  const { rerender, unmount } = render(<HeartRainAnimation isActive type="fireworks" />);
  expect(vi.getTimerCount()).toBe(1);
  rerender(<HeartRainAnimation isActive={false} type="fireworks" />);
  expect(vi.getTimerCount()).toBe(0);
  expect(particles()).toHaveLength(0);
  rerender(<HeartRainAnimation isActive type="birthday" />);
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(stopButton()).toBeNull();
});

// Delayed particles must sit at their first keyframe while they wait, not at their resting spot
test('las animaciones con retraso usan fill-mode both', () => {
  const css = readFileSync(path.resolve(__dirname, 'HeartRain.css'), 'utf8');
  for (const name of ['heartFall', 'heartFireworks']) {
    const rule = css.match(new RegExp(`animation:\\s*${name}[^;]*;`));
    expect(rule && rule[0]).toMatch(/\bboth\b/);
  }
});
