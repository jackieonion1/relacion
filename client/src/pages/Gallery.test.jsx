import React from 'react';
import { render, act, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import Gallery from './Gallery';
import { whenAuthed } from '../lib/firebase';
import { listPhotosPage, listPendingPhotos, getPendingIds, retryPendingPhotos, getOriginal, getOriginalUrl, deletePhoto } from '../lib/photos';
import { listPhotosBy, madridDayKey } from '../lib/photos';
import { escucharFoto, setReaccion, setFavorita } from '../lib/fotoSocial';
import { escucharComentarios, addComentario, deleteComentario, marcarLeidos } from '../lib/fotoComentarios';
import { useNoLeidos, useNoLeidosConfirmados } from '../lib/fotoAvisos';
import { ponerFecha, ponerFavorita } from '../lib/fotoSeleccion';
import { madridMediodia } from '../lib/fotoFecha';

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

// 3.1: what the viewer listens to and writes in Firestore, as doubles (their own tests are in lib/)
vi.mock('../lib/fotoSocial', async (orig) => ({
  ...(await orig()),
  escucharFoto: vi.fn(),
  setReaccion: vi.fn(),
  setFavorita: vi.fn(),
}));
vi.mock('../lib/fotoComentarios', async (orig) => ({
  ...(await orig()),
  escucharComentarios: vi.fn(),
  addComentario: vi.fn(),
  deleteComentario: vi.fn(),
  marcarLeidos: vi.fn(),
}));
vi.mock('../lib/fotoAvisos', () => ({ useNoLeidos: vi.fn(), useNoLeidosConfirmados: vi.fn(), useGaleriaBadge: vi.fn() }));
vi.mock('../lib/fotoSeleccion', async (orig) => ({ ...(await orig()), ponerFecha: vi.fn(), ponerFavorita: vi.fn() }));
const NADA_SIN_LEER = new Map();
beforeEach(() => {
  escucharFoto.mockReturnValue(() => {});
  setReaccion.mockResolvedValue({ committed: Promise.resolve() });
  setFavorita.mockResolvedValue({ committed: Promise.resolve() });
  listPhotosBy.mockResolvedValue({ items: [], thumbsDone: Promise.resolve() });
  escucharComentarios.mockReturnValue(() => {});
  addComentario.mockResolvedValue({ id: 'C1', committed: Promise.resolve() });
  deleteComentario.mockResolvedValue();
  marcarLeidos.mockResolvedValue();
  useNoLeidos.mockReturnValue(NADA_SIN_LEER);
  useNoLeidosConfirmados.mockReturnValue(true);
  ponerFecha.mockImplementation(async (pairId, ids) => ({ hechas: ids.length, borradas: [], fallidas: [] }));
  ponerFavorita.mockImplementation(async (pairId, ids) => ({ hechas: ids.length, borradas: [], fallidas: [] }));
});

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

const rest = () => act(() => new Promise((r) => setTimeout(r, 350))); // the viewer listens once the swipe rests

describe('3.1: reacciones en el visor', () => {
  beforeEach(() => {
    localStorage.setItem('identity', 'yo');
    listPhotosPage.mockResolvedValue({
      items: [{ id: 'R', thumbUrl: '', createdAt: new Date(2025, 2, 12, 12).getTime(), identity: 'ella', reactions: {} }],
      cursor: null, hasMore: false, thumbsDone: Promise.resolve(),
    });
    getOriginal.mockResolvedValue(null);
    getOriginalUrl.mockResolvedValue('https://example.test/orig.jpg');
  });
  afterEach(() => localStorage.removeItem('identity'));

  test('la mía se pinta al tocar, se quita tocándola otra vez, y la del otro llega del doc observado', async () => {
    await mount();
    await act(async () => { fireEvent.click(cells()[0]); await flush(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '🥹' })); await flush(); });
    expect(setReaccion).toHaveBeenLastCalledWith('SEB1998', 'R', 'yo', '🥹');
    expect(screen.getByRole('button', { name: '🥹' }).getAttribute('aria-pressed')).toBe('true');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '🥹' })); await flush(); });
    expect(setReaccion).toHaveBeenLastCalledWith('SEB1998', 'R', 'yo', null);
    expect(screen.getByRole('button', { name: '🥹' }).getAttribute('aria-pressed')).toBe('false');

    await rest();
    expect(escucharFoto).toHaveBeenCalledWith('SEB1998', 'R', expect.any(Function), expect.any(Function));
    const live = escucharFoto.mock.calls.at(-1)[2];
    await act(async () => { live({ id: 'R', createdAt: new Date(2025, 2, 12, 12).getTime(), identity: 'ella', reactions: { ella: '💖' }, favBy: [], takenAt: null }); await flush(); });
    expect(screen.getByRole('button', { name: '💖, también 🍪' })).toBeTruthy();
  });

  test('una foto que solo está en este móvil no tiene reacciones todavía', async () => {
    getPendingIds.mockReturnValue(['R']);
    await mount();
    await act(async () => { fireEvent.click(cells()[0]); await flush(); });
    expect(screen.queryByRole('group', { name: 'Reacciones' })).toBeNull();
    expect(screen.getByText('La subió 🍪')).toBeTruthy();
  });
});

describe('3.1: comentarios en el visor', () => {
  const foto = { id: 'K', thumbUrl: '', createdAt: new Date(2025, 2, 12, 12).getTime(), identity: 'ella', commentCount: 1 };
  const suyo = { id: 'c1', photoId: 'K', text: 'Qué guapos', identity: 'ella', createdAt: null, unreadFor: ['yo'] };
  beforeEach(() => {
    localStorage.setItem('identity', 'yo');
    listPhotosPage.mockResolvedValue({ items: [foto], cursor: null, hasMore: false, thumbsDone: Promise.resolve() });
    getOriginal.mockResolvedValue(null);
    getOriginalUrl.mockResolvedValue('https://example.test/orig.jpg');
  });
  afterEach(() => localStorage.removeItem('identity'));

  test('la hoja los enseña, los marca leídos al verlos y envía el nuestro', async () => {
    await mount();
    await act(async () => { fireEvent.click(cells()[0]); await flush(); });
    await rest();
    const llega = escucharComentarios.mock.calls.at(-1)[2];
    await act(async () => { llega([suyo]); await flush(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Comentarios: 1' })); await flush(); });
    const hoja = screen.getByRole('dialog');
    expect(within(hoja).getByText('Qué guapos')).toBeTruthy();
    expect(marcarLeidos).toHaveBeenCalledWith('SEB1998', [suyo], 'yo');
    fireEvent.change(within(hoja).getByRole('textbox', { name: 'Escribe un comentario' }), { target: { value: '  Mucho  ' } });
    await act(async () => { fireEvent.click(within(hoja).getByRole('button', { name: 'Enviar' })); await flush(); });
    expect(addComentario).toHaveBeenCalledWith('SEB1998', 'K', '  Mucho  ', 'yo');
    expect(within(hoja).getByRole('textbox').value).toBe('');
    // Con la hoja abierta, las flechas escriben: no pasan de foto
    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowRight' }); await flush(); });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  test('desde la push (?photo=) con algo sin leer, los comentarios se abren solos', async () => {
    useNoLeidos.mockReturnValue(new Map([['K', 1]]));
    render(<MemoryRouter initialEntries={['/gallery?photo=K']}><Gallery /></MemoryRouter>);
    await act(flush);
    expect(screen.getByRole('heading', { name: 'Comentarios' })).toBeTruthy();
    expect(cells()[0].getAttribute('aria-label')).toMatch('con comentarios sin leer');
  });

  test('en frío el no leído llega tarde: la apertura sola espera al primer dato del servidor', async () => {
    useNoLeidosConfirmados.mockReturnValue(false);
    const arbol = () => <MemoryRouter initialEntries={['/gallery?photo=K']}><Gallery /></MemoryRouter>;
    const { rerender } = render(arbol());
    await act(flush);
    await rest();
    expect(screen.queryByRole('heading', { name: 'Comentarios' })).toBeNull();
    useNoLeidos.mockReturnValue(new Map([['K', 1]]));
    useNoLeidosConfirmados.mockReturnValue(true);
    rerender(arbol());
    await act(flush);
    expect(screen.getByRole('heading', { name: 'Comentarios' })).toBeTruthy();
  });

  test('si el servidor confirma que no hay nada sin leer, la hoja no se abre después', async () => {
    useNoLeidosConfirmados.mockReturnValue(false);
    const arbol = () => <MemoryRouter initialEntries={['/gallery?photo=K']}><Gallery /></MemoryRouter>;
    const { rerender } = render(arbol());
    await act(flush);
    await rest();
    useNoLeidosConfirmados.mockReturnValue(true);
    rerender(arbol());
    await act(flush);
    useNoLeidos.mockReturnValue(new Map([['K', 1]]));
    rerender(arbol());
    await act(flush);
    expect(screen.queryByRole('heading', { name: 'Comentarios' })).toBeNull();
  });
});

describe('3.1: favoritas', () => {
  const at = (y, m, d) => new Date(y, m, d, 12).getTime();
  beforeEach(() => {
    localStorage.setItem('identity', 'yo');
    getOriginal.mockImplementation(async (pairId, id) => ({ id, size: 1000 }));
    getOriginalUrl.mockResolvedValue('');
    URL.createObjectURL = vi.fn((blob) => `blob:${blob.id}`);
  });
  afterEach(() => localStorage.removeItem('identity'));
  const filtro = (name) => within(screen.getByRole('group', { name: 'Qué fotos ver' })).getByRole('button', { name });

  test('el filtro pide las favoritas sin limit, las agrupa por la fecha de la foto y el visor pasa entre ellas', async () => {
    listPhotosBy.mockResolvedValue({
      items: [
        { id: 'F2', thumbUrl: '', createdAt: at(2026, 9, 1), takenAt: at(2025, 2, 12), favBy: ['yo', 'ella'] },
        { id: 'F1', thumbUrl: '', createdAt: at(2026, 9, 1), takenAt: null, favBy: ['ella'] },
      ],
      thumbsDone: Promise.resolve(),
    });
    await mount();
    await act(async () => { fireEvent.click(filtro('Favoritas')); await flush(); });
    const build = listPhotosBy.mock.calls.at(-1)[1];
    const fake = { query: (...a) => a, where: (...a) => ['where', ...a] };
    expect(build(fake, 'col')).toEqual(['col', ['where', 'favBy', 'array-contains-any', ['yo', 'ella']]]);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Octubre 2026', 'Marzo 2025']);
    expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(['Foto del 1 oct 2026', 'Foto del 12 mar 2025']);
    await act(async () => { fireEvent.click(cells()[0]); await flush(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' })); await flush(); });
    expect(document.querySelector('img[src="blob:F2"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Foto siguiente' }).disabled).toBe(true);
  });

  test('el corazón del visor la marca como mía, y sin favoritas lo dice', async () => {
    await mount();
    await act(async () => { fireEvent.click(cells()[0]); await flush(); });
    const corazon = screen.getByRole('button', { name: 'Favorita' });
    expect(corazon.getAttribute('aria-pressed')).toBe('false');
    await act(async () => { fireEvent.click(corazon); await flush(); });
    expect(setFavorita).toHaveBeenCalledWith('SEB1998', 'D0', 'yo', true);
    expect(corazon.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cerrar' })); await flush(); });
    await act(async () => { fireEvent.click(filtro('Favoritas')); await flush(); });
    expect(screen.getByText('Aún no hay favoritas')).toBeTruthy();
    await act(async () => { fireEvent.click(filtro('Todas')); await flush(); });
    expect(cells()).toHaveLength(3);
  });

  test('«Hace un año» agrupa por años atrás', async () => {
    const hoy = new Date();
    const haceUno = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate(), 12).getTime();
    listPhotosBy.mockResolvedValueOnce({ items: [{ id: 'H1', thumbUrl: '', createdAt: haceUno, takenAt: null }], thumbsDone: Promise.resolve() });
    await mount();
    await act(async () => { fireEvent.click(filtro('Hace un año')); await flush(); });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Hace un año']);
    expect(cells()).toHaveLength(1);
  });
});

describe('3.1: ir a un mes', () => {
  const at = (y, m, d) => new Date(y, m, d, 12).getTime();
  const fake = { query: (...a) => a, where: (...a) => ['where', ...a], orderBy: (...a) => ['orderBy', ...a], limit: (n) => ['limit', n] };
  // The first photo (createdAt and takenAt asked apart, by orderBy) and the photos dated in March 2025
  beforeEach(() => {
    listPhotosBy.mockImplementation(async (pairId, build, opts = {}) => {
      const q = JSON.stringify(build(fake, 'col'));
      if (q.includes('orderBy')) {
        const first = q.includes('takenAt') ? { id: 'T', createdAt: at(2026, 9, 1), takenAt: at(2024, 10, 20) } : { id: 'C', createdAt: at(2025, 1, 3), takenAt: null };
        if (opts.keep) opts.keep(first);
        return { items: [] };
      }
      if (q.includes('"takenAt",">="')) return { items: [{ id: 'M1', thumbUrl: '', createdAt: at(2026, 9, 1), takenAt: at(2025, 2, 8) }], thumbsDone: Promise.resolve() };
      return { items: [], thumbsDone: Promise.resolve() };
    });
  });

  test('por la fecha de la foto: desde la más antigua, y el mes abre su propia lista', async () => {
    await mount();
    await act(async () => { fireEvent.click(within(screen.getAllByRole('heading', { level: 2 })[0]).getByRole('button')); await flush(); });
    const hoja = screen.getByRole('dialog');
    expect(within(hoja).getByRole('button', { name: 'Octubre 2024' }).disabled).toBe(true);
    expect(within(hoja).getByRole('button', { name: 'Noviembre 2024' }).disabled).toBe(false);
    await act(async () => { fireEvent.click(within(hoja).getByRole('button', { name: 'Marzo 2025' })); await flush(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Marzo 2025']);
    expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(['Foto del 8 mar 2025']);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Todas' })); await flush(); });
    expect(cells()).toHaveLength(3);
  });
});

describe('3.1: selección y fecha en bloque', () => {
  beforeEach(() => localStorage.setItem('identity', 'yo'));
  afterEach(() => localStorage.removeItem('identity'));
  const barra = () => screen.getByRole('toolbar', { name: 'Fotos seleccionadas' });
  async function elegir(...n) {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' })); await flush(); });
    for (const i of n) await act(async () => { fireEvent.click(cells()[i]); await flush(); });
  }
  async function ponerDia(dia) {
    await act(async () => { fireEvent.click(within(barra()).getByRole('button', { name: 'Fecha' })); await flush(); });
    const hoja = screen.getByRole('dialog');
    fireEvent.change(within(hoja).getByLabelText('Día de la foto'), { target: { value: dia } });
    await act(async () => { fireEvent.click(within(hoja).getByRole('button', { name: 'Poner fecha' })); await flush(); });
  }

  test('tocar una foto la elige en vez de abrirla, y la fecha va a todas con confirmación', async () => {
    await mount();
    await elegir(0, 2);
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull(); // no abrió el visor
    expect(cells()[0].getAttribute('aria-pressed')).toBe('true');
    expect(within(barra()).getByText('2 fotos')).toBeTruthy();
    await ponerDia('2025-03-12');
    expect(ponerFecha).toHaveBeenCalledWith('SEB1998', ['D0', 'D2'], madridMediodia('2025-03-12'));
    expect(screen.getByRole('status').textContent).toMatch('Del 12 mar 2025: 2 fotos');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(cells()[0].getAttribute('aria-pressed')).toBeNull();
  });

  test('al fechar fotos se olvida que «Hace un año» estaba vacío hoy, para que las enseñe ya', async () => {
    const hoy = `hace-un-ano:SEB1998:${madridDayKey(new Date())}:3`;
    const otroDia = 'hace-un-ano:SEB1998:2020-01-01:3';
    localStorage.setItem(hoy, '0');
    localStorage.setItem(otroDia, '0');
    await mount();
    await elegir(0, 2);
    await ponerDia('2025-03-12');
    expect(localStorage.getItem(hoy)).toBeNull();
    expect(localStorage.getItem(otroDia)).toBe('0');
    localStorage.removeItem(otroDia);
  });

  test('con red que no responde la hoja se cierra al encolar, y el resultado llega después como aviso', async () => {
    let responde;
    ponerFecha.mockReturnValueOnce(new Promise((res) => { responde = res; }));
    await mount();
    await elegir(0, 2);
    await ponerDia('2025-03-12');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    await act(async () => { responde({ hechas: 2, borradas: [], fallidas: [] }); await flush(); });
    expect(screen.getByRole('status').textContent).toMatch('Del 12 mar 2025: 2 fotos');
  });

  test('si el servidor falla tras cerrar la hoja, el aviso ofrece Reintentar con las que fallaron', async () => {
    ponerFecha.mockResolvedValueOnce({ hechas: 1, borradas: [], fallidas: ['D2'] });
    await mount();
    await elegir(0, 2);
    await ponerDia('2025-03-12');
    const aviso = screen.getByRole('alert');
    await act(async () => { fireEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' })); await flush(); });
    expect(ponerFecha).toHaveBeenLastCalledWith('SEB1998', ['D2'], madridMediodia('2025-03-12'));
    expect(screen.getByRole('status').textContent).toMatch('Del 12 mar 2025: 1 foto');
  });

  test('F2: lo que no se guarda lo dice y sigue elegido para reintentar; lo borrado no cuenta como fallo', async () => {
    ponerFecha.mockResolvedValueOnce({ hechas: 1, borradas: ['D1'], fallidas: ['D2'] });
    await mount();
    await elegir(0, 1, 2);
    await ponerDia('2025-03-12');
    const aviso = screen.getByRole('alert');
    expect(aviso.textContent).toMatch('No se pudo en 1 foto');
    expect(aviso.textContent).toMatch('Una ya no estaba');
    expect(cells()).toHaveLength(2); // la borrada sale de la cuadrícula
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' })); await flush(); });
    expect(within(barra()).getByText('1 foto')).toBeTruthy();
    expect(cells()[1].getAttribute('aria-pressed')).toBe('true');
  });

  test('«Todas» elige el mes entero y el corazón de la barra las marca como mías', async () => {
    await mount();
    await elegir();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Elegir todas las de / })); await flush(); });
    expect(within(barra()).getByText('3 fotos')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Quitar todas las de / })).toBeTruthy();
    await act(async () => { fireEvent.click(within(barra()).getByRole('button', { name: 'Favoritas' })); await flush(); });
    expect(ponerFavorita).toHaveBeenCalledWith('SEB1998', ['D0', 'D1', 'D2'], 'yo', true);
    expect(screen.getByRole('status').textContent).toMatch('En tus favoritas: 3 fotos');
  });

  test('si se subieron 15 o más el mismo día sin fecha, ofrece ponérsela de una vez', async () => {
    const dia = new Date(2024, 10, 30, 12).getTime();
    listPhotosPage.mockResolvedValue({
      items: Array.from({ length: 16 }, (_, i) => ({ id: `G${i}`, thumbUrl: '', createdAt: dia - i * 1000, takenAt: null })),
      cursor: null, hasMore: false, thumbsDone: Promise.resolve(),
    });
    await mount();
    const aviso = screen.getByRole('region', { name: 'Fotos subidas el mismo día' });
    expect(aviso.textContent).toMatch('16 fotos se subieron el 30 nov 2024');
    await act(async () => { fireEvent.click(within(aviso).getByRole('button', { name: 'Ponerles fecha' })); await flush(); });
    expect(within(screen.getByRole('dialog')).getByText(/^16 fotos/)).toBeTruthy();
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' })); await flush(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Listo' })); await flush(); });
    await act(async () => { fireEvent.click(within(screen.getByRole('region', { name: 'Fotos subidas el mismo día' })).getByRole('button', { name: 'Ahora no' })); await flush(); });
    expect(screen.queryByRole('region', { name: 'Fotos subidas el mismo día' })).toBeNull();
    localStorage.removeItem('galeria:golpe-visto:SEB1998');
  });
});
