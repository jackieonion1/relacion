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

test('mientras gira no se pueden quitar ni añadir opciones', () => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1); // the spin never gets its next frame
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  render(<Roulette />);
  add('Pizza'); add('Sushi');
  fireEvent.click(screen.getByRole('button', { name: /Girar/ }));
  expect(screen.getByRole('button', { name: 'Eliminar Pizza' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Añadir' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pizza' }));
  const input = screen.getByPlaceholderText('Añadir opción');
  fireEvent.change(input, { target: { value: 'Tacos' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(saved().map((o) => o.label)).toEqual(['Pizza', 'Sushi']);
});

test('el color guardado de cada opción se pinta con la fuerza que da el tema (--rueda-op)', () => {
  render(<Roulette />);
  add('Pizza');
  const tint = chips()[0].parentElement.querySelector('span[aria-hidden="true"]');
  expect(tint.style.opacity).toBe('var(--rueda-op)');
  expect(saved()[0].color).toBe('hsl(0 85% 60% / 0.45)'); // the stored colour does not change
  expect(tint.style.background).toBe('rgba(240, 66, 66, 0.45)'); // jsdom writes it back as rgba
});

const rain = () => Array.from(document.querySelectorAll('[data-testid="heart-rain"] > div'));

// Each frame jumps 10 s, so the spin (5-8 s) ends on its second frame
function spinToResult() {
  let ts = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { ts += 10000; cb(ts); return ts; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  add('Pizza'); add('Sushi');
  fireEvent.click(screen.getByRole('button', { name: /Girar/ }));
}

test('el resultado lanza los fuegos de siempre, por encima del fondo y por debajo de la tarjeta', () => {
  render(<Roulette />);
  spinToResult();
  expect(screen.queryByRole('dialog', { name: 'Resultado' })).not.toBeNull();
  expect(rain().length).toBeGreaterThan(0);
  expect(document.querySelector('[data-testid="heart-rain"]').style.zIndex).toBe('10045');
  for (const p of rain()) {
    expect(p.className).toContain('heart-fireworks');
    expect(p.style.filter).toBe('opacity(0.55)');
  }
});

test('«Parar la fiesta» quita los fuegos y deja el resultado; tocar lo cierra todo', () => {
  render(<Roulette />);
  spinToResult();
  fireEvent.click(screen.getByRole('button', { name: 'Parar la fiesta' }));
  expect(rain()).toHaveLength(0);
  expect(screen.queryByRole('dialog', { name: 'Resultado' })).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Vale' }));
  expect(screen.queryByRole('dialog', { name: 'Resultado' })).toBeNull();
  // the next result rains again
  fireEvent.click(screen.getByRole('button', { name: /Girar/ }));
  expect(rain().length).toBeGreaterThan(0);
});

test('«Otra vez» cierra el resultado y gira de nuevo; tocar el fondo también lo cierra', () => {
  render(<Roulette />);
  spinToResult();
  fireEvent.click(screen.getByRole('button', { name: 'Otra vez' }));
  // the second spin ends on its own result, with its fireworks
  expect(screen.queryByRole('dialog', { name: 'Resultado' })).not.toBeNull();
  expect(rain().length).toBeGreaterThan(0);
  fireEvent.click(document.querySelector('.velo'));
  expect(screen.queryByRole('dialog', { name: 'Resultado' })).toBeNull();
  expect(rain()).toHaveLength(0);
});

// Records what the wheel writes
function recordingContext(texts) {
  const ctx = fakeContext();
  ctx.fillText = (t) => { texts.push(t); };
  ctx.measureText = (t) => ({ width: String(t).length * 8 });
  return ctx;
}

test('con 8 opciones o menos la rueda lleva sus etiquetas, truncadas con «…»; con 9 o más, ninguna', () => {
  const texts = [];
  HTMLCanvasElement.prototype.getContext.mockImplementation(() => recordingContext(texts));
  render(<Roulette />);
  add('Pizza');
  add('Una opción muy larga que no cabe en el gajo');
  texts.length = 0;
  add('Sushi');
  const drawn = texts.slice(-3);
  expect(drawn).toContain('Pizza');
  expect(drawn).toContain('Sushi');
  const long = drawn.find((t) => t.startsWith('Una'));
  expect(long.endsWith('…')).toBe(true);
  expect(long.length * 8).toBeLessThanOrEqual(140 - 14 - 46);
  for (let i = 4; i <= 9; i++) add(`Opción ${i}`);
  texts.length = 0;
  add('Opción 10');
  expect(texts).toHaveLength(0);
});

test('con «Reducir movimiento» el resultado sale al momento, sin esperar a la animación', () => {
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const raf = vi.spyOn(window, 'requestAnimationFrame');
  render(<Roulette />);
  add('Pizza'); add('Sushi');
  fireEvent.click(screen.getByRole('button', { name: /Girar/ }));
  expect(raf).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Resultado' })).not.toBeNull();
  delete window.matchMedia;
});

test('lo guardado se recorta a 15 al abrir', () => {
  localStorage.setItem('roulette:SEB1998', JSON.stringify(Array.from({ length: 20 }, (_, i) => `x${i}`)));
  render(<Roulette />);
  expect(chips()).toHaveLength(15);
  expect(new Set(saved().map((o) => o.color)).size).toBe(15);
});
