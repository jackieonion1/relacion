import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import NuestroAno, { Historias } from './NuestroAno';
import { analizar, cargarNuestroAno, construirHistorias, ventanaAniversario } from '../lib/nuestroAno';
import { getPhotoThumbUrl } from '../lib/photos';

vi.mock('../lib/photos', async (orig) => ({ ...(await orig()), getPhotoThumbUrl: vi.fn() }));
vi.mock('../lib/nuestroAno', async (orig) => ({ ...(await orig()), cargarNuestroAno: vi.fn() }));

const V = ventanaAniversario(new Date('2026-12-01T10:00:00Z'));
const dia = (m, d) => Date.UTC(2026, m - 1, d, 11);
const stats = (extra = {}) => analizar({
  fotos: [{ id: 'f1', createdAt: dia(3, 2), takenAt: null, identity: 'yo', reactions: { yo: '💖' }, favBy: ['ella'] }],
  notas: [{ identity: 'ella' }],
  ...extra,
}, V);
const historias = (s = stats()) => construirHistorias(s, new Date('2026-11-24T10:00:00Z'));

const rutas = (url) => (
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/recuerdos/nuestro-ano" element={<NuestroAno />} />
      <Route path="/recuerdos" element={<p>hub</p>} />
    </Routes>
  </MemoryRouter>
);
const siguiente = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
  localStorage.clear();
  localStorage.setItem('pairId', 'SEB1998');
  vi.clearAllMocks();
  cargarNuestroAno.mockResolvedValue(stats());
  getPhotoThumbUrl.mockResolvedValue('https://fotos.test/f1.jpg');
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Historias', () => {
  test('arranca en la portada, y tocar pasa de una a otra, hasta el cierre', () => {
    const hs = historias();
    render(<Historias historias={hs} fotoUrl="https://fotos.test/f1.jpg" onCerrar={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Nuestro segundo año' })).not.toBeNull();
    const visto = [];
    for (let k = 1; k < hs.length; k += 1) {
      siguiente();
      visto.push(document.querySelector('.ano-escena').className.replace('ano-escena ano-en-', ''));
    }
    expect(visto).toEqual(hs.slice(1).map((h) => h.id));
    expect(screen.getByRole('heading', { name: 'Y los que vengan.' })).not.toBeNull();
    // Nothing after the last one
    expect(screen.getByRole('button', { name: 'Siguiente' }).getAttribute('aria-disabled')).toBe('true');
  });

  test('Anterior vuelve, y en la primera no hace nada', () => {
    render(<Historias historias={historias()} onCerrar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('heading', { level: 1 })).not.toBeNull();
    siguiente();
    expect(screen.getByText('Juntos')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('heading', { level: 1 })).not.toBeNull();
  });

  test('las flechas pasan, Escape y ✕ y «Volver» cierran', () => {
    const onCerrar = vi.fn();
    render(<Historias historias={historias()} onCerrar={onCerrar} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Juntos')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { level: 1 })).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // to the last one
    for (let k = 0; k < 9; k += 1) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onCerrar).toHaveBeenCalledTimes(3);
  });

  test('un swipe a la izquierda pasa, a la derecha vuelve, y uno corto o vertical no es nada', () => {
    window.PointerEvent ??= class extends MouseEvent {};
    render(<Historias historias={historias()} onCerrar={() => {}} />);
    const raiz = screen.getByRole('dialog');
    const swipe = (de, a, yDe = 400, yA = 400) => {
      fireEvent.pointerDown(raiz, { clientX: de, clientY: yDe });
      fireEvent.pointerUp(raiz, { clientX: a, clientY: yA });
    };
    swipe(300, 120);
    expect(screen.getByText('Juntos')).not.toBeNull();
    swipe(300, 280); // short
    swipe(300, 100, 200, 500); // more down than across
    expect(screen.getByText('Juntos')).not.toBeNull();
    swipe(120, 300);
    expect(screen.getByRole('heading', { level: 1 })).not.toBeNull();
  });

  test('la barra de progreso tiene una pieza por historia y llena hasta la actual', () => {
    const hs = historias();
    render(<Historias historias={hs} onCerrar={() => {}} />);
    const llenas = () => document.querySelectorAll('.ano-barras li.hecha').length;
    expect(document.querySelectorAll('.ano-barras li')).toHaveLength(hs.length);
    expect(llenas()).toBe(1);
    siguiente();
    siguiente();
    expect(llenas()).toBe(3);
  });

  test('la foto favorita lleva alt, sus corazones y quién la marcó; sin url, un hueco', () => {
    const hs = historias();
    const { unmount } = render(<Historias historias={hs} fotoUrl="https://fotos.test/f1.jpg" inicial={hs.findIndex((h) => h.id === 'foto')} onCerrar={() => {}} />);
    expect(screen.getByRole('img', { name: 'La foto con más corazones del año' }).getAttribute('src')).toBe('https://fotos.test/f1.jpg');
    expect(screen.getByText('🫒 💖')).not.toBeNull();
    expect(screen.getByText('Favorita de 🍪')).not.toBeNull();
    unmount();
    render(<Historias historias={hs} inicial={hs.findIndex((h) => h.id === 'foto')} onCerrar={() => {}} />);
    expect(screen.queryByRole('img', { name: 'La foto con más corazones del año' })).toBeNull();
  });

  test('el gráfico de meses se lee entero para el lector de pantalla', () => {
    const hs = historias();
    render(<Historias historias={hs} inicial={hs.findIndex((h) => h.id === 'meses')} onCerrar={() => {}} />);
    expect(screen.getByRole('img', { name: /^Fotos por mes: noviembre 0, diciembre 0, enero 0, febrero 0, marzo 1,/ })).not.toBeNull();
    expect(screen.getByText('Marzo fue el mes con más fotos')).not.toBeNull();
  });
});

describe('NuestroAno', () => {
  test('antes de que abra la primera ventana no lee nada y dice cuándo abre', () => {
    render(rutas('/recuerdos/nuestro-ano'));
    expect(screen.getByText('Se abre el 17 de noviembre.')).not.toBeNull();
    expect(cargarNuestroAno).not.toHaveBeenCalled();
  });

  test('con ?ensayo=1 carga en modo ensayo y enseña las historias', async () => {
    render(rutas('/recuerdos/nuestro-ano?ensayo=1'));
    expect(await screen.findByRole('dialog', { name: 'Nuestro año' })).not.toBeNull();
    expect(cargarNuestroAno).toHaveBeenCalledWith('SEB1998', { ensayo: true });
    expect(getPhotoThumbUrl).toHaveBeenCalledWith('SEB1998', 'f1');
  });

  test('en la ventana, sin ensayo, y Escape vuelve al hub', async () => {
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
    render(rutas('/recuerdos/nuestro-ano'));
    await screen.findByRole('dialog');
    expect(cargarNuestroAno).toHaveBeenCalledWith('SEB1998', { ensayo: false });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('hub')).not.toBeNull();
  });

  test('sin miniatura de la favorita, esa historia no sale', async () => {
    getPhotoThumbUrl.mockResolvedValue('');
    render(rutas('/recuerdos/nuestro-ano?ensayo=1'));
    await screen.findByRole('dialog');
    expect(document.querySelectorAll('.ano-barras li')).toHaveLength(historias(stats()).length - 1);
  });

  test('sin conexión pide reintentar, y reintentar carga', async () => {
    cargarNuestroAno.mockRejectedValueOnce(new Error('unavailable'));
    render(rutas('/recuerdos/nuestro-ano?ensayo=1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('dialog')).not.toBeNull());
    expect(cargarNuestroAno).toHaveBeenCalledTimes(2);
  });
});
