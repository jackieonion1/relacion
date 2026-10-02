import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import Album from './Album';
import { borrarAlbum, fotosDeAlbum, guardarAlbum, leerAlbum, quitarDeAlbum } from '../lib/albumes';

vi.mock('../lib/albumes', async (orig) => ({
  ...(await orig()), leerAlbum: vi.fn(), fotosDeAlbum: vi.fn(), quitarDeAlbum: vi.fn(), borrarAlbum: vi.fn(), guardarAlbum: vi.fn(),
}));

const PAIR = 'SEB1998';
const dia = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
const foto = (id) => ({ id, thumbUrl: `blob:${id}`, createdAt: dia(2026, 3, 13), takenAt: null });
const manual = { id: 'a1', titulo: 'Nuestro finde', emoji: '🏔️', tipo: 'manual', eventId: null, start: null, end: null, excluidas: [], virtual: false, creadoEn: 5 };
const viaje = { id: 'ev-roma', titulo: 'Roma', emoji: '✈️', tipo: 'evento', eventId: 'roma', start: dia(2026, 3, 12), end: dia(2026, 3, 15), excluidas: [], virtual: true, creadoEn: 0 };

function Destino() {
  const l = useLocation();
  return <p>destino {l.pathname}{l.search} volver {l.state?.volver}</p>;
}
const pinta = (id = 'a1', state = null) => render(
  <MemoryRouter initialEntries={[{ pathname: `/recuerdos/albumes/${id}`, state }]}>
    <Routes>
      <Route path="/recuerdos/albumes/:id" element={<Album />} />
      <Route path="/recuerdos/albumes" element={<Destino />} />
      <Route path="/gallery" element={<Destino />} />
      <Route path="/recuerdos" element={<Destino />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pairId', PAIR);
  localStorage.setItem('identity', 'ella');
  leerAlbum.mockResolvedValue(manual);
  fotosDeAlbum.mockResolvedValue({ items: [foto('p1'), foto('p2'), foto('p3')] });
  quitarDeAlbum.mockResolvedValue({ committed: Promise.resolve() });
  borrarAlbum.mockResolvedValue();
  guardarAlbum.mockImplementation(async (pairId, album, v) => ({ album: { ...album, ...v, virtual: false }, committed: Promise.resolve() }));
});

test('muestra el título con su icono, las fechas del viaje y cuántas fotos tiene', async () => {
  leerAlbum.mockResolvedValue(viaje);
  pinta('ev-roma');
  expect(await screen.findByRole('heading', { name: '✈️ Roma' })).not.toBeNull();
  expect(screen.getByText('12–15 mar 2026')).not.toBeNull();
  expect(await screen.findByText('3 fotos')).not.toBeNull();
  expect(fotosDeAlbum).toHaveBeenCalledWith(PAIR, viaje, expect.objectContaining({ max: 36 }));
});

test('tocar una foto abre la galería y «volver» regresa a este álbum', async () => {
  pinta('a1');
  fireEvent.click((await screen.findAllByRole('button', { name: /^Foto del/ }))[1]);
  expect(await screen.findByText('destino /gallery?photo=p2 volver /recuerdos/albumes/a1')).not.toBeNull();
});

test('la flecha de atrás vuelve a donde se vino, o a los álbumes', async () => {
  pinta('a1', { volver: '/recuerdos' });
  fireEvent.click(await screen.findByRole('link', { name: 'Volver' }));
  expect(await screen.findByText('destino /recuerdos volver')).not.toBeNull();
});

test('«Elegir» y «Quitar del álbum» saca esas fotos del álbum y lo recarga', async () => {
  pinta('a1');
  fireEvent.click(await screen.findByRole('button', { name: 'Elegir' }));
  expect(screen.getByRole('button', { name: 'Elige las que quitar' }).disabled).toBe(true);
  const fotos = screen.getAllByRole('button', { name: /^Foto del/ });
  fireEvent.click(fotos[0]);
  fireEvent.click(fotos[2]);
  expect(fotos[0].getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Quitar del álbum (2)' }));
  await waitFor(() => expect(quitarDeAlbum).toHaveBeenCalledWith(PAIR, manual, ['p1', 'p3'], 'ella'));
  await waitFor(() => expect(leerAlbum).toHaveBeenCalledTimes(2));
});

test('cancelar la selección no toca nada', async () => {
  pinta('a1');
  fireEvent.click(await screen.findByRole('button', { name: 'Elegir' }));
  fireEvent.click(screen.getAllByRole('button', { name: /^Foto del/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('button', { name: /Quitar del álbum/ })).toBeNull();
  expect(quitarDeAlbum).not.toHaveBeenCalled();
});

test('un álbum vacío explica cómo añadir fotos desde la galería', async () => {
  fotosDeAlbum.mockResolvedValue({ items: [] });
  pinta('a1');
  expect((await screen.findByRole('region', { name: 'Sin fotos' })).textContent).toContain('pulsa «Seleccionar»');
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la galería' }));
  expect(await screen.findByText(/destino \/gallery/)).not.toBeNull();
});

test('editar cambia el nombre y el icono', async () => {
  pinta('a1');
  fireEvent.click(await screen.findByRole('button', { name: 'Editar álbum' }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sierra' } });
  fireEvent.click(screen.getByRole('button', { name: '🫒' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByRole('heading', { name: '🫒 Sierra' })).not.toBeNull();
  expect(guardarAlbum).toHaveBeenCalledWith(PAIR, manual, { titulo: 'Sierra', emoji: '🫒' }, 'ella');
});

test('un álbum a mano se borra tras preguntar, y las fotos se quedan', async () => {
  pinta('a1');
  fireEvent.click(await screen.findByRole('button', { name: 'Editar álbum' }));
  fireEvent.click(screen.getByRole('button', { name: 'Borrar álbum' }));
  expect(screen.getByRole('dialog', { name: '¿Borrar «Nuestro finde»?' })).not.toBeNull();
  expect(screen.getByText(/Las fotos se quedan en la galería/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Borrar álbum' }));
  await waitFor(() => expect(borrarAlbum).toHaveBeenCalledWith(PAIR, manual));
  expect(await screen.findByText(/destino \/recuerdos\/albumes/)).not.toBeNull();
});

test('el álbum de un viaje no se puede borrar (volvería a salir del calendario)', async () => {
  leerAlbum.mockResolvedValue(viaje);
  pinta('ev-roma');
  fireEvent.click(await screen.findByRole('button', { name: 'Editar álbum' }));
  expect(screen.getByRole('dialog', { name: 'Editar álbum' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Borrar álbum' })).toBeNull();
});

test('un álbum que no existe lo dice', async () => {
  leerAlbum.mockResolvedValueOnce(null);
  pinta('zzz');
  expect(await screen.findByText('Este álbum ya no existe.')).not.toBeNull();
});

test('sin conexión al abrir el álbum, reintentar lo carga', async () => {
  leerAlbum.mockRejectedValueOnce(new Error('offline'));
  pinta('a1');
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('heading', { name: '🏔️ Nuestro finde' })).not.toBeNull();
});
