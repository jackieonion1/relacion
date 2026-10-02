import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import Campana, { ActividadHoja } from './ActividadHoja';
import { miniaturaFoto, NUNCA } from '../lib/actividad';
import { verActividad } from '../lib/actividadAvisos';

vi.mock('../lib/actividad', async (orig) => ({ ...(await orig()), miniaturaFoto: vi.fn() }));
vi.mock('../lib/actividadAvisos', () => ({ verActividad: vi.fn() }));

const now = new Date(2026, 9, 2, 18, 0);
const min = (m) => now.getTime() - m * 60_000;
const T = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });
const lista = [
  { id: 'a', tipo: 'comentario', quien: 'yo', para: 'ella', ref: { photoId: 'F1' }, texto: 'qué guapa', tuya: true, ms: min(5), ts: T(min(5)) },
  { id: 'b', tipo: 'fotos', quien: 'yo', para: 'ella', ref: { photoId: 'F2' }, n: 12, ms: min(30), ts: T(min(30)) },
  { id: 'c', tipo: 'capsula', quien: 'yo', para: 'ella', ref: { capsuleId: 'K1' }, ambos: true, ms: min(60 * 30), ts: T(min(60 * 30)) },
];

beforeEach(() => {
  miniaturaFoto.mockResolvedValue('blob:mini');
});

test('dos grupos, «Nuevas» y «Antes», con el emoji, el texto, el tiempo y la miniatura', async () => {
  render(<ActividadHoja isOpen onClose={() => {}} lista={lista} vistoHasta={T(min(20))} pairId="p1" onElegir={() => {}} now={now} />);
  await act(async () => {});
  const nuevas = screen.getByRole('heading', { name: 'Nuevas' }).closest('section');
  const antes = screen.getByRole('heading', { name: 'Antes' }).closest('section');
  expect(within(nuevas).getByRole('button', { name: '🫒 ha comentado tu foto: «qué guapa», hace 5 min' })).toBeTruthy();
  expect(within(antes).getByRole('button', { name: '🫒 ha subido 12 fotos, hace 30 min' })).toBeTruthy();
  expect(within(antes).getByRole('button', { name: '🫒 ha sellado una cápsula para los dos, ayer' })).toBeTruthy();
  expect(miniaturaFoto).toHaveBeenCalledWith('p1', 'F1');
  expect(document.querySelectorAll('img[src="blob:mini"]')).toHaveLength(2);
});

test('sin nada que contar, un estado vacío amable y sin grupos', () => {
  render(<ActividadHoja isOpen onClose={() => {}} lista={[]} vistoHasta={NUNCA} pairId="p1" onElegir={() => {}} />);
  expect(screen.getByText(/Aún no hay nada por aquí/)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Nuevas' })).toBeNull();
});

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{`${l.pathname}${l.search}|${l.state?.volver || ''}`}</p>;
}

function conCampana(actividad) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Campana actividad={actividad} />} />
        <Route path="*" element={<Donde />} />
      </Routes>
    </MemoryRouter>
  );
}

test('la campana lleva el número sin ver, y abrirla marca todo visto sin mover «Nuevas» mientras está abierta', async () => {
  const { rerender } = conCampana({ lista, vistoHasta: T(min(20)), noLeidas: 1 });
  const campana = screen.getByRole('button', { name: 'Avisos, 1 sin ver' });
  expect(campana.textContent).toBe('1');
  fireEvent.click(campana);
  expect(verActividad).toHaveBeenCalledTimes(1);
  // The store says seen now; the open sheet keeps «Nuevas» as it was
  rerender(
    <MemoryRouter>
      <Routes><Route path="/" element={<Campana actividad={{ lista, vistoHasta: T(min(5)), noLeidas: 0 }} />} /></Routes>
    </MemoryRouter>
  );
  await act(async () => {});
  expect(screen.getByRole('heading', { name: 'Nuevas' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Avisos' }).textContent).toBe('');
});

test('más de nueve: 9+', () => {
  conCampana({ lista, vistoHasta: NUNCA, noLeidas: 14 });
  expect(screen.getByRole('button', { name: 'Avisos, 14 sin ver' }).textContent).toBe('9+');
});

test('tocar una entrada lleva a lo suyo y cierra la hoja', async () => {
  conCampana({ lista, vistoHasta: NUNCA, noLeidas: 3 });
  fireEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /ha comentado tu foto/ }));
  expect(screen.getByTestId('donde').textContent).toBe('/gallery?photo=F1|/');
  expect(screen.queryByRole('dialog')).toBeNull();
});
