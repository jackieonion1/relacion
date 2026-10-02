import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import SimpleMap from './SimpleMap';
import { geocodeCity } from '../lib/weather';
import { listenWhenAuthed } from '../lib/firebase';

// Without db the listener does not start; the listener test switches it on and keeps the snapshot callback
const fire = vi.hoisted(() => ({ db: null, onSnapshot: null }));
vi.mock('../lib/firebase', () => ({ get db() { return fire.db; }, whenAuthed: vi.fn(), listenWhenAuthed: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'locations'),
  onSnapshot: vi.fn((col, cb) => { fire.onSnapshot = cb; return () => {}; }),
}));
vi.mock('../lib/weather', () => ({ geocodeCity: vi.fn() }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const KEY = (role) => `pair_default_${role}_location`;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(KEY('novio'), JSON.stringify({ city: 'Madrid', addr1: 'Calle Mayor 1' }));
  localStorage.setItem(KEY('novia'), JSON.stringify({ city: 'Barcelona' }));
  geocodeCity.mockReset();
});

test('cada uno edita solo su ciudad: la fila ajena es de solo lectura', async () => {
  localStorage.setItem('identity', 'ella');
  geocodeCity.mockResolvedValue({ lat: 40, lon: -3 });
  render(<SimpleMap />);
  await act(flush);
  const edit = screen.getByRole('button', { name: /Editar tu ciudad/ });
  expect(edit.textContent).toContain('Barcelona');
  expect(screen.getAllByRole('button').filter((b) => b.textContent.includes('Madrid'))).toHaveLength(0);
  expect(screen.getByText('Calle Mayor 1')).not.toBeNull();
  fireEvent.click(edit);
  expect(screen.getByLabelText('Ciudad').value).toBe('Barcelona');
});

test('si falla la geocodificación sale «Reintentar», que vuelve a calcular la distancia', async () => {
  geocodeCity.mockResolvedValue(null);
  render(<SimpleMap />);
  await act(flush);
  expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar dónde estáis');
  expect(screen.getByText('🏠 — km')).not.toBeNull();
  geocodeCity.mockResolvedValue({ lat: 40, lon: -3 });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await act(flush);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('🏠 0 km')).not.toBeNull();
});

test('una primera respuesta vacía de la caché de Firestore no borra las ciudades guardadas', async () => {
  const PAIR_KEY = (role) => `pair_SEB1998_${role}_location`;
  localStorage.setItem('pairId', 'SEB1998');
  localStorage.setItem(PAIR_KEY('novio'), JSON.stringify({ city: 'Madrid' }));
  localStorage.setItem(PAIR_KEY('novia'), JSON.stringify({ city: 'Barcelona' }));
  geocodeCity.mockResolvedValue({ lat: 40, lon: -3 });
  listenWhenAuthed.mockImplementation((start) => { start(); return () => {}; });
  fire.db = {};
  const snap = (fromCache) => ({ metadata: { fromCache }, empty: true, forEach: () => {} });
  try {
    render(<SimpleMap />);
    await waitFor(() => expect(fire.onSnapshot).toBeTypeOf('function'));
    await act(async () => { fire.onSnapshot(snap(true)); await flush(); });
    expect(JSON.parse(localStorage.getItem(PAIR_KEY('novio')))).toEqual({ city: 'Madrid' });
    expect(screen.getAllByText(/Barcelona/).length).toBeGreaterThan(0);
    // The server's answer counts even when empty: then nobody has a city
    await act(async () => { fire.onSnapshot(snap(false)); await flush(); });
    expect(JSON.parse(localStorage.getItem(PAIR_KEY('novio')))).toEqual({});
    expect(screen.queryAllByText(/Barcelona/)).toHaveLength(0);
  } finally {
    fire.db = null;
    fire.onSnapshot = null;
  }
});
