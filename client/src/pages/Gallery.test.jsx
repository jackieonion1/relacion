import React from 'react';
import { render, act, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import Gallery from './Gallery';
import { whenAuthed } from '../lib/firebase';
import { listPhotosPage, listPendingPhotos, getPendingIds, retryPendingPhotos, getOriginal, getOriginalUrl, deletePhoto } from '../lib/photos';

// The real module underneath: a name that lib/photos gains later is there without touching this mock (a closed list
// would throw «no "x" export is defined» for the modules Gallery pulls in, e.g. lib/recuerdos). Only what the tests
// drive is stubbed
vi.mock('../lib/photos', async (orig) => ({
  ...(await orig()),
  listPhotosBy: vi.fn(async () => ({ items: [] })),
  listPhotosPage: vi.fn(),
  listPendingPhotos: vi.fn(),
  getPendingIds: vi.fn(),
  retryPendingPhotos: vi.fn(),
  confirmQueued: vi.fn(),
  uploadPhoto: vi.fn(),
  getOriginal: vi.fn(),
  getOriginalUrl: vi.fn(),
  deletePhoto: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({ whenAuthed: vi.fn() }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `D${i}`, thumbUrl: '', createdAt: 100 - i }));

let onThumb;
beforeEach(() => {
  localStorage.setItem('pairId', 'SEB1998');
  onThumb = null;
  listPhotosPage.mockImplementation(async (pairId, opts) => {
    onThumb = opts.onThumb;
    return { items: items(3), cursor: null, hasMore: false, thumbsDone: Promise.resolve() };
  });
  whenAuthed.mockResolvedValue({ uid: 'u1' });
  listPendingPhotos.mockResolvedValue([]);
  getPendingIds.mockReturnValue([]);
  retryPendingPhotos.mockResolvedValue({ sent: 0, failed: 0, lost: 0, offline: false, queued: [] });
  URL.revokeObjectURL = vi.fn();
});

async function mount() {
  const utils = render(<MemoryRouter><Gallery /></MemoryRouter>);
  await act(flush);
  return utils;
}

// Celdas de foto de la cuadrícula (botones «Foto del …»), en el orden en que se pintan
const cells = () => screen.queryAllByRole('button', { name: /^Foto del / });

test('la cuadrícula sale con huecos y cada miniatura rellena el suyo al llegar, en orden', async () => {
  await mount();
  expect(cells()).toHaveLength(3);
  expect(cells().filter((c) => c.querySelector('img'))).toHaveLength(0);
  await act(async () => { onThumb('D1', 'blob:d1'); await flush(); });
  expect(cells()[1].querySelector('img').getAttribute('src')).toBe('blob:d1');
  expect(cells()[0].querySelector('img')).toBeNull();
});

test('una miniatura que llega tras salir de la galería se revoca al momento', async () => {
  const { unmount } = await mount();
  const late = onThumb;
  unmount();
  late('D2', 'blob:late');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
});

test('la que llega antes de que la página esté en la cuadrícula no se pierde', async () => {
  listPhotosPage.mockImplementation(async (pairId, opts) => {
    opts.onThumb('D0', 'blob:early'); // resuelta antes de que load() pinte la lista
    return { items: items(2), cursor: null, hasMore: false, thumbsDone: Promise.resolve() };
  });
  await mount();
  expect(cells()[0].querySelector('img').getAttribute('src')).toBe('blob:early');
});

test('C9: las fotos se agrupan por mes de createdAt y el cambio de mes abre otro grupo', async () => {
  const at = (y, m, d) => new Date(y, m, d, 12).getTime();
  listPhotosPage.mockResolvedValue({
    items: [
      { id: 'A', thumbUrl: '', createdAt: at(2026, 9, 1) },
      { id: 'B', thumbUrl: '', createdAt: at(2026, 8, 30) },
      { id: 'C', thumbUrl: '', createdAt: at(2026, 8, 1) },
    ],
    cursor: null, hasMore: false, thumbsDone: Promise.resolve(),
  });
  await mount();
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
  expect(headings).toEqual(['Octubre 2026', 'Septiembre 2026']);
  const sept = screen.getByRole('heading', { name: 'Septiembre 2026' }).parentElement;
  expect(within(sept).getAllByRole('button', { name: /^Foto del / })).toHaveLength(2);
});

test('C11: el visor dice quién la subió solo si la foto lo guarda', async () => {
  listPhotosPage.mockResolvedValue({
    items: [
      { id: 'N', thumbUrl: '', createdAt: new Date(2025, 2, 12, 12).getTime(), identity: 'ella' },
      { id: 'O', thumbUrl: '', createdAt: new Date(2025, 2, 11, 12).getTime(), identity: '' },
    ],
    cursor: null, hasMore: false, thumbsDone: Promise.resolve(),
  });
  getOriginal.mockResolvedValue(null);
  getOriginalUrl.mockResolvedValue('https://example.test/orig.jpg');
  await mount();
  await act(async () => { fireEvent.click(cells()[0]); await flush(); });
  expect(screen.getByText('La subió 🍪')).toBeTruthy();
  expect(screen.getByText('12 mar 2025')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cerrar' })); await flush(); });
  await act(async () => { fireEvent.click(cells()[1]); await flush(); });
  expect(screen.queryByText(/La subió/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Borrar foto' })).toBeTruthy();
});

test('O4: «Cerrar» mientras carga la foto no deja que el visor se abra solo al llegar', async () => {
  let llega;
  getOriginal.mockReturnValue(new Promise((res) => { llega = res; }));
  getOriginalUrl.mockResolvedValue('');
  URL.createObjectURL = vi.fn(() => 'blob:tarde');
  await mount();
  await act(async () => { fireEvent.click(cells()[0]); await flush(); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cerrar' })); await flush(); });
  expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  await act(async () => { llega({ size: 1000 }); await flush(); });
  expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tarde');
});

// 3.1: Recuerdos abre la foto con state.volver; al cerrar se vuelve allí, y sin él se queda en la Galería
describe('cerrar el visor abierto con ?photo=', () => {
  function Ruta() {
    const loc = useLocation();
    return <span data-testid="ruta">{loc.pathname + loc.search}</span>;
  }
  async function abrir(entry) {
    getOriginal.mockResolvedValue(null);
    getOriginalUrl.mockResolvedValue('https://example.test/orig.jpg');
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/gallery" element={<><Gallery /><Ruta /></>} />
          <Route path="*" element={<Ruta />} />
        </Routes>
      </MemoryRouter>
    );
    await act(flush);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cerrar' })); await flush(); });
    return screen.getByTestId('ruta').textContent;
  }

  test('vuelve a state.volver si lo trae', async () => {
    expect(await abrir({ pathname: '/gallery', search: '?photo=D1', state: { volver: '/recuerdos/albumes/a1' } })).toBe('/recuerdos/albumes/a1');
  });

  test('sin state.volver se queda en la Galería, sin el ?photo=', async () => {
    expect(await abrir('/gallery?photo=D1')).toBe('/gallery');
  });
});

// C3: deslizar en el visor. Cada original es un blob distinto (blob:A, blob:B…) para ver cuál se revoca
describe('C3: pasar de foto en el visor', () => {
  const photo = (id, identity) => ({ id, thumbUrl: '', createdAt: new Date(2025, 2, 12, 12).getTime(), identity });
  beforeEach(() => {
    listPhotosPage.mockResolvedValue({ items: [photo('A', 'ella'), photo('B', 'yo')], cursor: null, hasMore: false, thumbsDone: Promise.resolve() });
    getOriginal.mockImplementation(async (pairId, id) => ({ id, size: 1000 }));
    getOriginalUrl.mockResolvedValue('');
    URL.createObjectURL = vi.fn((blob) => `blob:${blob.id}`);
  });
  const shown = () => document.querySelector('img[src^="blob:"]')?.getAttribute('src');
  const swipe = async (from, to, y = 300) => {
    const img = document.querySelector('img[src^="blob:"]');
    await act(async () => {
      fireEvent.touchStart(img, { touches: [{ clientX: from, clientY: y }] });
      fireEvent.touchMove(img, { touches: [{ clientX: to, clientY: y + 5 }] });
      fireEvent.touchEnd(img, { touches: [] });
      await flush();
    });
  };
  async function openFirst() {
    await mount();
    await act(async () => { fireEvent.click(cells()[0]); await flush(); });
    expect(shown()).toBe('blob:A');
  }

  test('a la izquierda pasa a la siguiente, revoca la anterior y el pie y el borrado siguen a la de ahora', async () => {
    deletePhoto.mockResolvedValue();
    await openFirst();
    expect(screen.getByText('La subió 🍪')).toBeTruthy();
    await swipe(600, 300);
    expect(shown()).toBe('blob:B');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:A');
    expect(screen.getByText('La subió 🫒')).toBeTruthy();
    await swipe(300, 600);
    expect(shown()).toBe('blob:A');
    await swipe(600, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Borrar foto' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Borrar foto' })); await flush(); });
    expect(deletePhoto).toHaveBeenCalledWith('SEB1998', 'B');
  });

  test('en la última se para, y no cuenta ni el pellizco ni el que empieza en el borde', async () => {
    await openFirst();
    await swipe(10, 400); // desde el borde izquierdo: es el «atrás» del sistema
    await swipe(1015, 700);
    expect(shown()).toBe('blob:A');
    const img = document.querySelector('img[src^="blob:"]');
    await act(async () => {
      fireEvent.touchStart(img, { touches: [{ clientX: 600, clientY: 300 }] });
      fireEvent.touchStart(img, { touches: [{ clientX: 600, clientY: 300 }, { clientX: 700, clientY: 300 }] });
      fireEvent.touchMove(img, { touches: [{ clientX: 300, clientY: 300 }, { clientX: 700, clientY: 300 }] });
      fireEvent.touchEnd(img, { touches: [{ clientX: 300, clientY: 300 }] });
      fireEvent.touchMove(img, { touches: [{ clientX: 100, clientY: 300 }] });
      fireEvent.touchEnd(img, { touches: [] });
      await flush();
    });
    expect(shown()).toBe('blob:A');
    await swipe(600, 300);
    await swipe(600, 300);
    expect(shown()).toBe('blob:B');
    expect(screen.getByRole('button', { name: 'Foto siguiente' }).disabled).toBe(true);
  });

  test('las flechas de pantalla y del teclado hacen lo mismo', async () => {
    await openFirst();
    expect(screen.getByRole('button', { name: 'Foto anterior' }).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' })); await flush(); });
    expect(shown()).toBe('blob:B');
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeNull();
    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowLeft' }); await flush(); });
    expect(shown()).toBe('blob:A');
  });

  test('desde la última de la página cargada pide la siguiente y sigue', async () => {
    listPhotosPage.mockImplementation(async (pairId, opts) => (opts.cursor
      ? { items: [photo('C', 'yo')], cursor: 'c2', hasMore: false, thumbsDone: Promise.resolve() }
      : { items: [photo('A', 'ella'), photo('B', 'yo')], cursor: 'c1', hasMore: true, thumbsDone: Promise.resolve() }));
    await openFirst();
    await swipe(600, 300);
    await swipe(600, 300);
    expect(listPhotosPage).toHaveBeenLastCalledWith('SEB1998', expect.objectContaining({ cursor: 'c1' }));
    expect(shown()).toBe('blob:C');
  });
});

// Le pasó en el iPhone: falló la primera página y decía «Aún no hay fotos»
test('si no se puede cargar la galería lo dice, con Reintentar, y no la da por vacía', async () => {
  listPhotosPage.mockRejectedValueOnce(Object.assign(new Error('no-auth'), { code: 'no-auth' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await mount();
  expect(screen.queryByText('Aún no hay fotos')).toBeNull();
  expect(screen.getByRole('alert').textContent).toMatch('No se pudieron cargar las fotos');
  expect(screen.getByText('no-auth')).toBeTruthy(); // el código, para distinguir sesión de red
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await flush(); });
  expect(cells()).toHaveLength(3);
});

test('con Firestore inalcanzable el aviso lleva su código', async () => {
  listPhotosPage.mockRejectedValueOnce(Object.assign(new Error('Failed to get documents'), { code: 'unavailable' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await mount();
  expect(screen.getByRole('alert').textContent).toMatch('unavailable');
});

test('si Firestore se cuelga sin fallar, a los 20 s lo dice con Reintentar y su código', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    listPhotosPage.mockImplementationOnce(() => new Promise(() => {}));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    expect(screen.getByRole('status', { name: 'Cargando fotos' })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(20000); await flush(); });
    expect(screen.getByRole('alert').textContent).toMatch('No se pudieron cargar las fotos');
    expect(screen.getByText('timeout')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await flush(); });
    expect(cells()).toHaveLength(3);
  } finally {
    vi.useRealTimers();
  }
});

test('el tope de 20 s cuenta desde que hay sesión, no antes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    let authed;
    whenAuthed.mockImplementationOnce(() => new Promise((resolve) => { authed = resolve; }));
    listPhotosPage.mockImplementationOnce(() => new Promise(() => {}));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    // Esperando la sesión (hasta 15 s) más de 20 s no es un timeout de Firestore
    await act(async () => { vi.advanceTimersByTime(25000); await flush(); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(listPhotosPage).not.toHaveBeenCalled();
    await act(async () => { authed({ uid: 'u1' }); await flush(); });
    await act(async () => { vi.advanceTimersByTime(19000); await flush(); });
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1000); await flush(); });
    expect(screen.getByText('timeout')).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('vacía de verdad sí dice «Aún no hay fotos»', async () => {
  listPhotosPage.mockResolvedValue({ items: [], cursor: null, hasMore: false, thumbsDone: Promise.resolve() });
  await mount();
  expect(screen.getByText('Aún no hay fotos')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
