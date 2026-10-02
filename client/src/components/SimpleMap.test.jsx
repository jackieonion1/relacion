import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import SimpleMap from './SimpleMap';
import { geocodeCity } from '../lib/weather';

vi.mock('../lib/firebase', () => ({ db: null, whenAuthed: vi.fn(), listenWhenAuthed: vi.fn() }));
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
