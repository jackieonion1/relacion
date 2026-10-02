import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import Music from './Music';
import { listMusic, getOriginal, getSubtitles, renameMusic, deleteMusic } from '../lib/music';

vi.mock('../lib/music', () => ({
  listMusic: vi.fn(),
  uploadMusic: vi.fn(),
  deleteMusic: vi.fn(),
  renameMusic: vi.fn(),
  getOriginal: vi.fn(),
  getSubtitles: vi.fn(),
  uploadSubtitles: vi.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Music is mounted once next to the routes, as in App: it only changes what it shows per route
let nav;
let path;
function Probe() {
  nav = useNavigate();
  path = useLocation().pathname;
  return null;
}

let play;
let pause;
beforeEach(() => {
  localStorage.setItem('pairId', 'SEB1998');
  listMusic.mockResolvedValue([
    { id: 'A', name: 'Canción A', duration: 120, createdAt: 2 },
    { id: 'B', name: 'Canción B', duration: 90, createdAt: 1 },
  ]);
  getOriginal.mockImplementation(async (pairId, id) => new Blob([id]));
  getSubtitles.mockResolvedValue(null);
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  URL.createObjectURL = vi.fn((b) => `blob:${b.size}-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function playFirst() {
  render(<MemoryRouter initialEntries={['/music']}><Probe /><Music /></MemoryRouter>);
  await act(flush);
  await act(async () => { fireEvent.click(screen.getByText('Canción A')); await flush(); await frame(); });
}

const audio = () => document.querySelector('audio');
const miniBar = () => screen.queryByText(/^0:00 \/ /);
const pill = () => screen.queryByRole('button', { name: 'Ir a Música' });

test('en /music suena con la barra mini y sin la píldora', async () => {
  await playFirst();
  expect(getOriginal).toHaveBeenCalledWith('SEB1998', 'A');
  expect(play).toHaveBeenCalledTimes(1);
  expect(miniBar().textContent).toBe('0:00 / 2:00');
  expect(pill()).toBeNull();
});

test('al cambiar de ruta sigue sonando: no se pausa ni cambia el audio, y sale la píldora en lugar de la barra', async () => {
  await playFirst();
  const el = audio();
  const src = el.src;
  pause.mockClear(); // playItem pauses the element once before loading the track
  await act(async () => { nav('/notes'); await flush(); });
  expect(audio()).toBe(el);
  expect(el.src).toBe(src);
  expect(pause).not.toHaveBeenCalled();
  expect(miniBar()).toBeNull();
  expect(pill().textContent).toContain('Canción A');
});

test('la píldora vuelve a /music', async () => {
  await playFirst();
  await act(async () => { nav('/'); await flush(); });
  await act(async () => { fireEvent.click(pill()); await flush(); });
  expect(path).toBe('/music');
  expect(miniBar()).not.toBeNull();
});

test('al acabar una canción pasa a la siguiente, también fuera de /music', async () => {
  await playFirst();
  await act(async () => { nav('/calendar'); await flush(); });
  await act(async () => { audio().dispatchEvent(new Event('ended')); await flush(); await frame(); });
  expect(getOriginal).toHaveBeenLastCalledWith('SEB1998', 'B');
  expect(play).toHaveBeenCalledTimes(2);
  expect(pill().textContent).toContain('Canción B');
});

test('C18: si la lista no carga, «Reintentar» la vuelve a pedir', async () => {
  listMusic.mockRejectedValueOnce(new Error('red'));
  render(<MemoryRouter initialEntries={['/music']}><Music /></MemoryRouter>);
  await act(flush);
  expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las canciones');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await flush(); });
  expect(listMusic).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Canción B')).toBeTruthy();
});

test('el menú ⋯ cambia el nombre y borra con confirmación', async () => {
  render(<MemoryRouter initialEntries={['/music']}><Music /></MemoryRouter>);
  await act(flush);
  fireEvent.click(screen.getAllByRole('button', { name: 'Más opciones' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre' }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'La nuestra' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); await flush(); });
  expect(renameMusic).toHaveBeenCalledWith('SEB1998', 'A', 'La nuestra');
  expect(screen.getByText('La nuestra')).toBeTruthy();

  fireEvent.click(screen.getAllByRole('button', { name: 'Más opciones' })[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Borrar canción' }));
  expect(deleteMusic).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Borrar canción' })); await flush(); });
  expect(deleteMusic).toHaveBeenCalledWith('SEB1998', 'B');
  expect(screen.queryByText('Canción B')).toBeNull();
});

test('la fila dice quién la subió, cuándo y cuánto dura', async () => {
  const year = new Date().getFullYear();
  listMusic.mockResolvedValue([
    { id: 'A', name: 'Canción A', duration: 220, createdAt: new Date(year, 2, 12, 12).getTime(), identity: 'ella' },
    { id: 'B', name: 'Canción B', duration: 90, createdAt: new Date(2024, 0, 5, 12).getTime() },
  ]);
  render(<MemoryRouter initialEntries={['/music']}><Music /></MemoryRouter>);
  await act(flush);
  expect(screen.getByText('Subida por 🍪 · 12 mar · 3:40')).toBeTruthy();
  expect(screen.getByText('5 ene 2024 · 1:30')).toBeTruthy();
});

// Web Audio double: it only keeps which node is wired to which
function fakeAudioContext() {
  const links = new Set();
  const node = (name, extra = {}) => ({
    name,
    ...extra,
    connect: (to) => { links.add(`${name}>${to.name}`); },
    disconnect: (to) => {
      for (const l of [...links]) if (l.startsWith(`${name}>`) && (!to || l === `${name}>${to.name}`)) links.delete(l);
    },
  });
  window.AudioContext = class {
    state = 'running';
    destination = { name: 'destination' };
    resume() { return Promise.resolve(); }
    createMediaElementSource() { return node('source'); }
    createAnalyser() { return node('analyser', { fftSize: 0, getByteTimeDomainData() {} }); }
  };
  return links;
}

test('al salir de Visual la canción sigue conectada a destination: al cerrar, al pasar a Letra y al bloquear', async () => {
  const links = fakeAudioContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  try {
    await playFirst();
    const openVisual = async () => {
      if (!screen.queryByRole('dialog', { name: 'Reproductor' })) {
        fireEvent.click(screen.getByRole('button', { name: 'Abrir el reproductor: Canción A' }));
      }
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Visual' })); await flush(); });
      expect([...links].sort()).toEqual(['source>analyser', 'source>destination']);
    };
    const onlyDestination = () => {
      expect([...links]).toEqual(['source>destination']);
      expect(audio().muted).toBe(false);
    };

    await openVisual();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Letra' })); await flush(); });
    onlyDestination();

    await openVisual();
    await act(async () => { setVisibility('hidden'); await flush(); });
    onlyDestination();
    await act(async () => { setVisibility('visible'); await flush(); });

    await openVisual();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar reproductor' }));
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByRole('dialog', { name: 'Reproductor' })).toBeNull();
    onlyDestination();
  } finally {
    delete window.AudioContext;
    delete document.visibilityState;
  }
});

test('tras la última vuelve a la primera', async () => {
  await playFirst();
  await act(async () => { audio().dispatchEvent(new Event('ended')); await flush(); await frame(); });
  await act(async () => { audio().dispatchEvent(new Event('ended')); await flush(); await frame(); });
  expect(getOriginal.mock.calls.map((c) => c[1])).toEqual(['A', 'B', 'A']);
});
