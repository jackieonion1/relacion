import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import Sellos from './Sellos';
import { fotosEnRangoTope, portadaDeRango } from '../lib/recuerdos';
import { mesiversarios } from '../lib/sellos';

vi.mock('../lib/recuerdos', async (orig) => ({ ...(await orig()), portadaDeRango: vi.fn(), fotosEnRangoTope: vi.fn() }));

const PAIR = 'SEB1998';
const foto = (id) => ({ id, thumbUrl: `blob:${id}`, createdAt: Date.UTC(2025, 3, 10), takenAt: null });

// Where a tap on a photo leaves the screen
function Galeria() {
  const l = useLocation();
  return <p>galería {l.search} volver {l.state?.volver}</p>;
}
const pinta = (url = '/recuerdos/sellos') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/recuerdos/sellos" element={<Sellos />} />
      <Route path="/gallery" element={<Galeria />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
  localStorage.clear();
  localStorage.setItem('pairId', PAIR);
  portadaDeRango.mockResolvedValue('');
  fotosEnRangoTope.mockResolvedValue({ items: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

test('un sello por cada 24, los más recientes primero y por año juntos, y el siguiente con los días que faltan', () => {
  const { container } = pinta();
  expect(container.querySelectorAll('.mes-sello')).toHaveLength(22);
  expect(screen.getByRole('region', { name: 'Segundo año' })).not.toBeNull();
  expect(screen.getByRole('region', { name: 'Primer año' })).not.toBeNull();
  expect(screen.getByText('Mes 23 · 24 oct 2026')).not.toBeNull();
  expect(screen.getByText(/Dentro de 22 días/)).not.toBeNull();
  const nombres = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
  expect(nombres[0]).toBe('Mes 22, 24 sept 2026');
  expect(nombres.at(-1)).toBe('Mes 1, 24 dic 2024');
});

test('el del 24-nov es un aniversario: «1 año»', () => {
  pinta();
  const sello = screen.getByRole('button', { name: '1 año, 24 nov 2025' });
  expect(sello.className).toContain('aniversario');
});

test('cada sello pide la portada de su mes, y la pinta si la hay', async () => {
  portadaDeRango.mockImplementation(async (pairId, desde) => (desde === 0 ? '' : 'blob:portada'));
  const { container } = pinta();
  expect(portadaDeRango).toHaveBeenCalledTimes(22);
  expect(portadaDeRango).toHaveBeenCalledWith(PAIR, expect.any(Number), expect.any(Number));
  await waitFor(() => expect(container.querySelectorAll('.mes-foto img')).toHaveLength(22));
  expect(container.querySelector('.mes-foto img').getAttribute('src')).toBe('blob:portada');
});

test('un mes sin fotos es un sello grabado: sin hueco de foto, con su número, y no se abre', async () => {
  portadaDeRango.mockImplementation(async (pairId, desde, hasta) => (hasta === mesiversarios(new Date()).sellos.find((s) => s.n === 5).hasta ? '' : 'blob:portada'));
  const { container } = pinta();
  await waitFor(() => expect(container.querySelectorAll('.mes-grabado')).toHaveLength(1));
  const grabado = screen.getByRole('img', { name: 'Mes 5, 24 abr 2025, sin fotos' });
  expect(grabado.querySelector('.mes-centro b').textContent).toBe('5');
  expect(grabado.textContent).toContain('2025');
  expect(grabado.querySelector('.mes-foto, img')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Mes 5, 24 abr 2025' })).toBeNull();
  fireEvent.click(grabado);
  expect(screen.queryByRole('dialog')).toBeNull();
  // The rest keep their photo and open as before
  await waitFor(() => expect(container.querySelectorAll('.mes-foto img')).toHaveLength(21));
  expect(screen.getByRole('button', { name: 'Mes 6, 24 may 2025' })).not.toBeNull();
});

test('el sello grabado del aniversario conserva «1 año 🎉»', async () => {
  const { container } = pinta();
  await waitFor(() => expect(container.querySelectorAll('.mes-grabado')).toHaveLength(22));
  const sello = screen.getByRole('img', { name: '1 año, 24 nov 2025, sin fotos' });
  expect(sello.className).toContain('aniversario');
  expect(sello.textContent).toContain('1 año 🎉');
});

test('si no se puede mirar la portada del mes no se dice que no tenga fotos', async () => {
  portadaDeRango.mockRejectedValue(new Error('sin red'));
  const { container } = pinta();
  await waitFor(() => expect(portadaDeRango).toHaveBeenCalledTimes(22));
  await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
  expect(container.querySelector('.mes-grabado')).toBeNull();
});

test('tocar un sello abre la hoja de su mes con las fotos de ese mes', async () => {
  fotosEnRangoTope.mockResolvedValue({ items: [foto('p1'), foto('p2')] });
  pinta();
  fireEvent.click(screen.getByRole('button', { name: 'Mes 5, 24 abr 2025' }));
  expect(screen.getByRole('dialog', { name: 'Mes 5' })).not.toBeNull();
  expect(screen.getByText('25 mar – 24 abr 2025')).not.toBeNull();
  await screen.findAllByRole('button', { name: /^Foto del/ });
  // Thumbs asked for in a bounded number, not one for every photo of the month
  expect(fotosEnRangoTope).toHaveBeenCalledWith(PAIR, expect.any(Number), expect.any(Number), expect.objectContaining({ max: 24 }));
});

test('un mes sin fotos lo dice con ternura y apunta a la galería', async () => {
  pinta('/recuerdos/sellos?mes=3');
  expect((await screen.findByText(/Este mes no hay fotos todavía/)).textContent).toContain('desde la galería');
});

test('abrir una foto la lleva a la galería y «volver» regresa a esa misma hoja', async () => {
  fotosEnRangoTope.mockResolvedValue({ items: [foto('p1')] });
  pinta('/recuerdos/sellos?mes=5');
  fireEvent.click(await screen.findByRole('button', { name: /^Foto del/ }));
  expect(await screen.findByText(/galería \?photo=p1 volver \/recuerdos\/sellos\?mes=5/)).not.toBeNull();
});

test('un fallo al cargar las fotos del mes se puede reintentar', async () => {
  fotosEnRangoTope.mockRejectedValueOnce(new Error('sin red'));
  pinta('/recuerdos/sellos?mes=5');
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(fotosEnRangoTope).toHaveBeenCalledTimes(2));
});
