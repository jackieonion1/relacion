import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import MapPage from './Map';
import { getMapState, subscribeToMapState } from '../lib/mapState';
import { RAIN } from '../lib/rain';

vi.mock('../lib/mapState', () => ({
  getMapState: vi.fn(),
  setMapState: vi.fn(),
  subscribeToMapState: vi.fn(),
}));
vi.mock('../components/SimpleMap', () => ({ default: () => null }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const rain = () => Array.from(document.querySelectorAll('[data-testid="heart-rain"] > div'));
const stopButton = () => screen.queryByRole('button', { name: 'Parar la fiesta' });

let emit;
beforeEach(() => {
  localStorage.clear();
  subscribeToMapState.mockImplementation((cb) => { emit = cb; return () => {}; });
});

async function mount(state) {
  getMapState.mockResolvedValue(state);
  render(<MapPage />);
  await act(flush);
}

test('en «Juntos» caen los fuegos', async () => {
  await mount('together');
  expect(screen.queryByText('¡Juntos!')).not.toBeNull();
  expect(rain().length).toBeGreaterThan(0);
  for (const p of rain()) {
    expect(p.className).toContain('heart-fireworks');
    expect(RAIN.fireworks.emoji).toContain(p.textContent);
  }
});

test('en casa no hay fuegos', async () => {
  await mount('home');
  expect(rain()).toHaveLength(0);
  expect(stopButton()).toBeNull();
});

test('si el otro cambia a «Juntos» estando en la página, caen', async () => {
  await mount('home');
  act(() => { emit('together'); });
  expect(rain().length).toBeGreaterThan(0);
});

test('«Parar la fiesta» los cierra y no vuelven en esa visita hasta salir de «Juntos» y regresar', async () => {
  await mount('together');
  fireEvent.click(stopButton());
  expect(rain()).toHaveLength(0);
  expect(stopButton()).toBeNull();
  expect(screen.queryByText('¡Juntos!')).not.toBeNull();
  // the snapshot repeats the same state: nothing relaunches it
  act(() => { emit('together'); });
  expect(rain()).toHaveLength(0);
  act(() => { emit('home'); });
  act(() => { emit('together'); });
  expect(rain().length).toBeGreaterThan(0);
});
