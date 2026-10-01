import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Roulette from './Roulette';

// jsdom has no 2D canvas: every call is a no-op that returns the same fake context
function fakeContext() {
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => ctx),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return ctx;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pairId', 'SEB1998');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeContext);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function add(label) {
  fireEvent.change(screen.getByPlaceholderText('Añadir opción'), { target: { value: label } });
  fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
}

const saved = () => JSON.parse(localStorage.getItem('roulette:SEB1998'));
const chips = () => screen.queryAllByRole('button', { name: /^Eliminar / });

test('admite 15 opciones como mucho, cada una con un color distinto de los 15', () => {
  render(<Roulette />);
  for (let i = 1; i <= 16; i++) add(`Opción ${i}`);
  expect(chips()).toHaveLength(15);
  expect(screen.queryByText('Opción 16')).toBeNull();
  expect(screen.queryByText('Máximo 15 opciones')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Añadir' }).disabled).toBe(true);
  // Enter skips the disabled button: only the cap inside addOption stops a 16th option
  const input = screen.getByPlaceholderText('Añadir opción');
  fireEvent.change(input, { target: { value: 'Opción 16' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(chips()).toHaveLength(15);
  expect(saved()).toHaveLength(15);
  const colors = saved().map((o) => o.color);
  expect(new Set(colors).size).toBe(15);
  // 15 hues every 24 degrees, from red to rose
  expect(colors.map((c) => Number(c.match(/^hsl\((\d+) /)[1]))).toEqual(Array.from({ length: 15 }, (_, i) => i * 24));
});

test('al quitar una, la siguiente reutiliza el color libre', () => {
  render(<Roulette />);
  add('a'); add('b'); add('c');
  const before = saved().map((o) => o.color);
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar b' }));
  add('d');
  expect(saved().map((o) => [o.label, o.color])).toEqual([['a', before[0]], ['c', before[2]], ['d', before[1]]]);
});

test('no repite una opción aunque cambien las mayúsculas', () => {
  render(<Roulette />);
  add('Pizza');
  add('  pizza ');
  expect(chips()).toHaveLength(1);
});

test('lo guardado se recorta a 15 al abrir', () => {
  localStorage.setItem('roulette:SEB1998', JSON.stringify(Array.from({ length: 20 }, (_, i) => `x${i}`)));
  render(<Roulette />);
  expect(chips()).toHaveLength(15);
  expect(new Set(saved().map((o) => o.color)).size).toBe(15);
});
