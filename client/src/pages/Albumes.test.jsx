import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import Albumes from './Albumes';
import { crearAlbum, listarAlbumes, listarEncuentros, portadaDeAlbum } from '../lib/albumes';

vi.mock('../lib/albumes', async (orig) => ({
  ...(await orig()), listarAlbumes: vi.fn(), listarEncuentros: vi.fn(), portadaDeAlbum: vi.fn(), crearAlbum: vi.fn(),
}));

const PAIR = 'SEB1998';
const dia = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
const manual = { id: 'a1', titulo: 'Nuestro finde', emoji: '🏔️', tipo: 'manual', eventId: null, start: null, end: null, excluidas: [], virtual: false, creadoEn: 5 };
const eventos = [
  { id: 'roma', title: 'Roma', start: dia(2026, 3, 12), end: dia(2026, 3, 15) },
  { id: 'cena', title: 'Cena', start: dia(2026, 2, 14), end: null },
  { id: 'luego', title: 'Aún no', start: dia(2099, 1, 1), end: dia(2099, 1, 4) },
];

function Destino() {
  const l = useLocation();
  return <p>álbum {decodeURIComponent(l.pathname)} volver {l.state?.volver}</p>;
}
const pinta = () => render(
  <MemoryRouter initialEntries={['/recuerdos/albumes']}>
    <Routes>
      <Route path="/recuerdos/albumes" element={<Albumes />} />
      <Route path="/recuerdos/albumes/:id" element={<Destino />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pairId', PAIR);
  localStorage.setItem('identity', 'ella');
  listarAlbumes.mockResolvedValue([manual]);
  listarEncuentros.mockResolvedValue(eventos);
  portadaDeAlbum.mockResolvedValue('');
  crearAlbum.mockImplementation(async (pairId, { titulo, emoji }) => ({ album: { ...manual, id: 'nuevo', titulo, emoji }, committed: Promise.resolve() }));
});

test('los viajes salen de los «nos vemos» de más de un día, y los álbumes a mano van aparte', async () => {
  pinta();
  const viajes = await screen.findByRole('region', { name: 'Viajes' });
  expect(viajes.textContent).toContain('Roma');
  expect(viajes.textContent).toContain('12–15 mar 2026');
  expect(screen.getByRole('region', { name: 'Vuestros álbumes' }).textContent).toContain('Nuestro finde');
});

test('los encuentros de un día quedan plegados bajo «Más encuentros», y los que aún no han llegado no salen', async () => {
  pinta();
  await screen.findByRole('region', { name: 'Viajes' });
  expect(screen.getByText('Más encuentros (1)')).not.toBeNull();
  expect(screen.getByText('Cena').closest('a').getAttribute('href')).toBe('/recuerdos/albumes/ev-cena');
  expect(screen.queryByText('Aún no')).toBeNull();
});

test('cada tarjeta es un enlace al álbum y le pide su portada', async () => {
  portadaDeAlbum.mockResolvedValue('blob:portada');
  const { container } = pinta();
  const enlace = (await screen.findByText('Roma')).closest('a');
  expect(enlace.getAttribute('href')).toBe('/recuerdos/albumes/ev-roma');
  await waitFor(() => expect(container.querySelectorAll('.album-portada img')).toHaveLength(2));
  expect(portadaDeAlbum).toHaveBeenCalledWith(PAIR, expect.objectContaining({ id: 'ev-roma' }));
});

test('sin viajes ni álbumes cuenta qué va a aparecer aquí', async () => {
  listarAlbumes.mockResolvedValue([]);
  listarEncuentros.mockResolvedValue([]);
  pinta();
  expect((await screen.findByRole('region', { name: 'Sin álbumes' })).textContent).toContain('Aquí aparecerán vuestros viajes');
});

test('sin conexión se puede reintentar', async () => {
  listarAlbumes.mockRejectedValueOnce(new Error('offline'));
  pinta();
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Nuestro finde')).not.toBeNull();
});

test('«Nuevo» crea un álbum a mano con su nombre y lleva a él', async () => {
  pinta();
  await screen.findByRole('region', { name: 'Viajes' });
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo' }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Verano' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText(/álbum \/recuerdos\/albumes\/nuevo volver \/recuerdos\/albumes/)).not.toBeNull();
  expect(crearAlbum).toHaveBeenCalledWith(PAIR, { titulo: 'Verano', emoji: '🩷' }, 'ella');
});
