import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlbumPicker from './AlbumPicker';
import { asignarAlbum, crearAlbum, listarAlbumes, listarEncuentros } from '../lib/albumes';

vi.mock('../lib/albumes', async (orig) => ({
  ...(await orig()), listarAlbumes: vi.fn(), listarEncuentros: vi.fn(), asignarAlbum: vi.fn(), crearAlbum: vi.fn(),
}));

const PAIR = 'SEB1998';
const IDS = ['f1', 'f2', 'f3'];
const manual = { id: 'a1', titulo: 'Nuestro finde', emoji: '🏔️', tipo: 'manual', eventId: null, start: null, end: null, excluidas: [], virtual: false, creadoEn: 5 };
// Mar 12-15 2026 (a trip) and a one-day encounter, both in the past
const dia = (m, d) => new Date(2026, m - 1, d, 12).getTime();
const eventos = [
  { id: 'roma', title: 'Roma', start: dia(3, 12), end: dia(3, 15) },
  { id: 'cena', title: 'Cena', start: dia(2, 14), end: null },
];

beforeEach(() => {
  listarAlbumes.mockResolvedValue([manual]);
  listarEncuentros.mockResolvedValue(eventos);
  asignarAlbum.mockResolvedValue({ committed: Promise.resolve() });
  crearAlbum.mockImplementation(async (pairId, { titulo, emoji }) => ({ album: { ...manual, id: 'nuevo', titulo, emoji }, committed: Promise.resolve() }));
});

test('lista los álbumes a mano, luego los viajes (no los encuentros de un día) y «Nuevo álbum»', async () => {
  render(<AlbumPicker pairId={PAIR} ids={IDS} onDone={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Añadir 3 fotos a…' })).not.toBeNull();
  await screen.findByText('Nuestro finde');
  expect(screen.getByText('Roma')).not.toBeNull();
  expect(screen.queryByText('Cena')).toBeNull();
  expect(screen.getByText('Nuevo álbum')).not.toBeNull();
});

test('elegir un álbum le pone las fotos y avisa con el álbum y cuántas son', async () => {
  const onDone = vi.fn();
  render(<AlbumPicker pairId={PAIR} ids={IDS} onDone={onDone} />);
  fireEvent.click(await screen.findByText('Nuestro finde'));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(asignarAlbum).toHaveBeenCalledWith(PAIR, manual, IDS);
  expect(onDone).toHaveBeenCalledWith({ album: manual, n: 3 });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('un viaje del calendario se puede elegir sin que tenga doc', async () => {
  const onDone = vi.fn();
  render(<AlbumPicker pairId={PAIR} ids={['f1']} onDone={onDone} />);
  fireEvent.click(await screen.findByText('Roma'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(asignarAlbum).toHaveBeenCalledWith(PAIR, expect.objectContaining({ id: 'ev-roma', virtual: true }), ['f1']);
});

test('cerrar sin elegir avisa con null y no escribe nada', async () => {
  const onDone = vi.fn();
  render(<AlbumPicker pairId={PAIR} ids={IDS} onDone={onDone} />);
  await screen.findByText('Nuestro finde');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onDone).toHaveBeenCalledWith(null);
  expect(asignarAlbum).not.toHaveBeenCalled();
});

test('«Nuevo álbum» crea el álbum con su nombre y le pone las fotos', async () => {
  const onDone = vi.fn();
  render(<AlbumPicker pairId={PAIR} ids={IDS} onDone={onDone} />);
  fireEvent.click(await screen.findByText('Nuevo álbum'));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Verano' } });
  fireEvent.click(screen.getByRole('button', { name: '✈️' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(crearAlbum).toHaveBeenCalledWith(PAIR, { titulo: 'Verano', emoji: '✈️' }, 'yo');
  expect(asignarAlbum).toHaveBeenCalledWith(PAIR, expect.objectContaining({ id: 'nuevo' }), IDS);
});

test('un álbum nuevo sin nombre no se crea', async () => {
  render(<AlbumPicker pairId={PAIR} ids={IDS} onDone={() => {}} />);
  fireEvent.click(await screen.findByText('Nuevo álbum'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Ponle un nombre al álbum.')).not.toBeNull();
  expect(crearAlbum).not.toHaveBeenCalled();
});

test('si no se pueden poner las fotos, lo dice y se puede volver a intentar', async () => {
  asignarAlbum.mockRejectedValueOnce(new Error('no-auth'));
  const onDone = vi.fn();
  render(<AlbumPicker pairId={PAIR} ids={IDS} onDone={onDone} />);
  fireEvent.click(await screen.findByText('Nuestro finde'));
  expect((await screen.findByRole('alert')).textContent).toContain('No se han podido añadir las fotos');
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Nuestro finde'));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});

test('sin conexión se puede crear un álbum igualmente', async () => {
  listarAlbumes.mockRejectedValue(new Error('offline'));
  render(<AlbumPicker pairId={PAIR} ids={IDS} onDone={() => {}} />);
  expect(await screen.findByText(/No hemos podido cargar los álbumes/)).not.toBeNull();
  expect(screen.getByText('Nuevo álbum')).not.toBeNull();
});
