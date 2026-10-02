import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import NuestroAno, { Historias } from './NuestroAno';
import { analizar, cargarNuestroAno, construirHistorias, ventanaAniversario } from '../lib/nuestroAno';
import { getPhotoThumbUrl, thumbDeItem } from '../lib/photos';

vi.mock('../lib/photos', async (orig) => ({ ...(await orig()), getPhotoThumbUrl: vi.fn(), thumbDeItem: vi.fn() }));
vi.mock('../lib/nuestroAno', async (orig) => ({ ...(await orig()), cargarNuestroAno: vi.fn() }));

const V = ventanaAniversario(new Date('2026-12-01T10:00:00Z'));
const dia = (m, d) => Date.UTC(2026, m - 1, d, 11);
const stats = (extra = {}) => analizar({
  fotos: [{ id: 'f1', createdAt: dia(3, 2), takenAt: null, identity: 'yo', reactions: { yo: '💖' }, favBy: ['ella'], thumbDoc: 'https://doc/f1' }],
  notas: [{ identity: 'ella' }],
  ...extra,
}, V, 'SEB1998');
// A year with photos in February and none in March or April, for the chapters
const conCapitulo = () => stats({
  fotos: [
    { id: 'a', createdAt: dia(2, 3), takenAt: null, identity: 'yo', reactions: {}, favBy: [], thumbDoc: '' },
    { id: 'b', createdAt: dia(2, 9), takenAt: null, identity: 'ella', reactions: {}, favBy: [], thumbDoc: '' },
    { id: 'c', createdAt: dia(2, 20), takenAt: null, identity: 'ella', reactions: {}, favBy: [], thumbDoc: '' },
  ],
});
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
  thumbDeItem.mockImplementation(async (_, f) => `https://fotos.test/${f.id}.jpg`);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Historias', () => {
  test('arranca en la portada, y tocar pasa de una a otra, hasta el cierre', () => {
    const hs = historias();
    render(<Historias historias={hs} thumbs={{ f1: 'https://fotos.test/f1.jpg' }} onCerrar={() => {}} />);
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

  test('la foto favorita lleva alt, sus corazones y quién la marcó; mientras llega, un hueco; sin ella, un sello', () => {
    const hs = historias();
    const en = hs.findIndex((h) => h.id === 'foto');
    const { unmount } = render(<Historias historias={hs} thumbs={{ f1: 'https://fotos.test/f1.jpg' }} inicial={en} onCerrar={() => {}} />);
    expect(screen.getByRole('img', { name: 'La foto con más corazones del año' }).getAttribute('src')).toBe('https://fotos.test/f1.jpg');
    expect(screen.getByText('🫒 💖')).not.toBeNull();
    expect(screen.getByText('Favorita de 🍪')).not.toBeNull();
    unmount();
    const { unmount: fuera } = render(<Historias historias={hs} inicial={en} onCerrar={() => {}} />);
    expect(screen.queryByRole('img', { name: 'La foto con más corazones del año' })).toBeNull();
    expect(document.querySelector('.ano-polaroid .ano-hueco')).not.toBeNull();
    fuera();
    render(<Historias historias={hs} thumbs={{ f1: '' }} inicial={en} onCerrar={() => {}} />);
    expect(document.querySelector('.ano-polaroid .ano-sello-postal').textContent).toBe('2mar');
  });

  test('una miniatura que no carga se cambia por el sello de su día', () => {
    const hs = historias();
    render(<Historias historias={hs} thumbs={{ f1: 'https://fotos.test/rota.jpg' }} inicial={hs.findIndex((h) => h.id === 'foto')} onCerrar={() => {}} />);
    fireEvent.error(screen.getByRole('img', { name: 'La foto con más corazones del año' }));
    expect(screen.queryByRole('img', { name: 'La foto con más corazones del año' })).toBeNull();
    expect(document.querySelector('.ano-polaroid .ano-sello-postal')).not.toBeNull();
  });

  test('un capítulo: cada mes con su nombre y su número, y el que no tiene fotos con el sello de su 24', () => {
    const hs = construirHistorias(conCapitulo(), new Date('2026-11-24T10:00:00Z'));
    const thumbs = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, `https://fotos.test/${id}.jpg`]));
    render(<Historias historias={hs} thumbs={thumbs} inicial={hs.findIndex((h) => h.id === 'capitulo-2')} onCerrar={() => {}} />);
    expect(screen.getByText('Capítulo II')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'De febrero a abril' })).not.toBeNull();
    expect(screen.getByText('Febrero:')).not.toBeNull();
    expect(screen.getByText('3 fotos')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Una foto de febrero' })).not.toBeNull();
    expect(screen.getAllByText('sin fotos, pero con sello')).toHaveLength(2);
    const sellos = [...document.querySelectorAll('.ano-mini.sin-foto .ano-sello-postal')].map((s) => s.textContent);
    expect(sellos).toEqual(['Mes 1624mar', 'Mes 1724abr']);
  });

  test('el collage pinta sus fotos según llegan, y las que faltan quedan en papel', () => {
    const fotos = Array.from({ length: 8 }, (_, k) => ({ id: `f${k}`, createdAt: dia(1 + k, 3), takenAt: null, identity: 'yo', reactions: {}, favBy: [], thumbDoc: '' }));
    const hs = construirHistorias(stats({ fotos }), new Date('2026-11-24T10:00:00Z'));
    const h = hs.find((x) => x.id === 'collage');
    const thumbs = { [h.fotos[0].id]: 'https://fotos.test/0.jpg', [h.fotos[1].id]: '' };
    render(<Historias historias={hs} thumbs={thumbs} inicial={hs.indexOf(h)} onCerrar={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Y todo esto.' })).not.toBeNull();
    expect(document.querySelectorAll('.ano-collage li')).toHaveLength(8);
    expect(document.querySelectorAll('.ano-collage img')).toHaveLength(1);
    expect(document.querySelectorAll('.ano-collage .ano-collage-papel')).toHaveLength(1);
    expect(document.querySelectorAll('.ano-collage .ano-hueco')).toHaveLength(6);
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
  });

  test('las miniaturas se piden por la URL de su doc (thumbDeItem), una vez cada una y sin leer el doc', async () => {
    cargarNuestroAno.mockResolvedValue(conCapitulo());
    render(rutas('/recuerdos/nuestro-ano?ensayo=1'));
    await screen.findByRole('dialog');
    await waitFor(() => expect(thumbDeItem).toHaveBeenCalledTimes(3));
    expect(thumbDeItem).toHaveBeenCalledWith('SEB1998', expect.objectContaining({ id: 'a', thumbDoc: '' }));
    expect(getPhotoThumbUrl).not.toHaveBeenCalled();
  });

  test('en la ventana, sin ensayo, y Escape vuelve al hub', async () => {
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
    render(rutas('/recuerdos/nuestro-ano'));
    await screen.findByRole('dialog');
    expect(cargarNuestroAno).toHaveBeenCalledWith('SEB1998', { ensayo: false });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('hub')).not.toBeNull();
  });

  test('las historias se abren sin esperar a las fotos, y una que no llega deja su sello', async () => {
    let soltar;
    thumbDeItem.mockImplementation(() => new Promise((r) => { soltar = r; }));
    render(rutas('/recuerdos/nuestro-ano?ensayo=1'));
    await screen.findByRole('dialog');
    expect(document.querySelectorAll('.ano-barras li')).toHaveLength(historias(stats()).length);
    for (let k = 0; k < historias().findIndex((h) => h.id === 'foto'); k += 1) siguiente();
    expect(document.querySelector('.ano-polaroid .ano-hueco')).not.toBeNull();
    soltar('');
    await waitFor(() => expect(document.querySelector('.ano-polaroid .ano-sello-postal')).not.toBeNull());
  });

  test('sin conexión pide reintentar, y reintentar carga', async () => {
    cargarNuestroAno.mockRejectedValueOnce(new Error('unavailable'));
    render(rutas('/recuerdos/nuestro-ano?ensayo=1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('dialog')).not.toBeNull());
    expect(cargarNuestroAno).toHaveBeenCalledTimes(2);
  });
});
