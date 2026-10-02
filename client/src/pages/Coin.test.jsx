import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Coin from './Coin';

afterEach(() => {
  vi.restoreAllMocks();
  delete window.matchMedia;
  delete HTMLElement.prototype.animate;
});

// jsdom has no WAAPI: the coin's animation finishes when the test says so
function fakeAnimate() {
  const anims = [];
  HTMLElement.prototype.animate = vi.fn(function animate(frames, opts) {
    const a = { frames, opts, cancel: vi.fn() };
    anims.push(a);
    return a;
  });
  return anims;
}

test('lanza la moneda 3,6 s hasta 1,7 de escala y al caer dice qué ha salido', () => {
  const anims = fakeAnimate();
  vi.spyOn(Math, 'random').mockReturnValue(0.9); // 🫒
  render(<Coin />);
  expect(screen.getByRole('heading', { name: 'Moneda' })).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Lanzar' }));
  expect(screen.getByRole('button', { name: 'Lanzando…' }).disabled).toBe(true);
  expect(screen.getByRole('status').textContent.trim()).toBe('');
  const coin = anims[0];
  expect(coin.opts.duration).toBe(3600);
  expect(coin.frames[1].transform).toContain('scale(1.7)');
  act(() => coin.onfinish());
  expect(screen.getByRole('status').textContent).toBe('Sale 🫒');
  expect(screen.getByRole('button', { name: 'Lanzar' }).disabled).toBe(false);
});

test('con «Reducir movimiento» no hay giro y el resultado sale al momento', () => {
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const anims = fakeAnimate();
  vi.spyOn(Math, 'random').mockReturnValue(0.1); // 🍪
  render(<Coin />);
  fireEvent.click(screen.getByRole('button', { name: 'Lanzar' }));
  expect(anims).toHaveLength(0);
  expect(screen.getByRole('status').textContent).toBe('Sale 🍪');
});

test('con «Reducir movimiento», si repite cara lo dice', () => {
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  fakeAnimate();
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.1); // 🍪
  render(<Coin />);
  const lanzar = () => fireEvent.click(screen.getByRole('button', { name: 'Lanzar' }));
  const status = () => screen.getByRole('status').textContent;
  lanzar();
  expect(status()).toBe('Sale 🍪');
  lanzar();
  expect(status()).toBe('Sale 🍪 otra vez');
  lanzar();
  expect(status()).toBe('Sale 🍪 3 veces seguidas');
  random.mockReturnValue(0.9); // 🫒
  lanzar();
  expect(status()).toBe('Sale 🫒');
});
