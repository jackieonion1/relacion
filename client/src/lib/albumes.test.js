import { albumDeDoc, albumDeEvento, combinarAlbumes, diasDeAlbum, guardarAlbum, idDeEvento, quitarDeAlbum, rangoDeAlbum } from './albumes';
import { arrayUnion, doc as docRef, collection, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

vi.mock('./firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {}, storage: null, whenAuthed: () => Promise.resolve({ uid: 'u1' }) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), writeBatch: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
  serverTimestamp: vi.fn(), Timestamp: { fromMillis: vi.fn() },
}));

const iso = (ms) => new Date(ms).toISOString();
// Noon in Madrid of y-m-d (Nov-Mar are CET, so UTC+1)
const dia = (y, m, d, h = 11) => Date.UTC(y, m - 1, d, h);
const evento = (id, start, end = null) => ({ id, title: `Evento ${id}`, start, end });
const doc = (id, extra = {}) => ({ id, titulo: id, emoji: '🩷', tipo: 'manual', eventId: null, start: null, end: null, excluidas: [], virtual: false, creadoEn: 0, ...extra });

describe('diasDeAlbum', () => {
  test('cuenta los días naturales de Madrid, el primero y el último incluidos', () => {
    expect(diasDeAlbum({ start: dia(2026, 3, 12), end: dia(2026, 3, 15, 22) })).toBe(4);
    expect(diasDeAlbum({ start: dia(2026, 3, 12), end: null })).toBe(1);
    expect(diasDeAlbum({ start: null, end: null })).toBe(0);
  });

  test('un fin a las 23:59 del último día no suma otro día', () => {
    expect(diasDeAlbum({ start: dia(2026, 2, 14), end: dia(2026, 2, 14, 22) + 3599000 })).toBe(1);
  });
});

describe('rangoDeAlbum', () => {
  test('va del primer día a 3 días después del último, [desde, hasta) en hora de Madrid', () => {
    const { desde, hasta } = rangoDeAlbum({ start: dia(2026, 1, 12), end: dia(2026, 1, 15) });
    expect(iso(desde)).toBe('2026-01-11T23:00:00.000Z'); // 00:00 del 12-ene
    expect(iso(hasta)).toBe('2026-01-18T23:00:00.000Z'); // 00:00 del 19-ene: el 15 + 3 días de margen
  });

  test('un evento sin fin es un día con su margen', () => {
    const { desde, hasta } = rangoDeAlbum({ start: dia(2026, 1, 12), end: null });
    expect(iso(desde)).toBe('2026-01-11T23:00:00.000Z');
    expect(iso(hasta)).toBe('2026-01-15T23:00:00.000Z');
  });
});

describe('albumDeEvento', () => {
  test('es virtual, con el id determinista ev-<id> y las fechas del evento', () => {
    const a = albumDeEvento(evento('abc', 5, 9));
    expect(a).toMatchObject({ id: 'ev-abc', eventId: 'abc', tipo: 'evento', virtual: true, start: 5, end: 9, titulo: 'Evento abc' });
    expect(idDeEvento('abc')).toBe('ev-abc');
  });
});

describe('combinarAlbumes', () => {
  const ahora = dia(2026, 10, 2);

  test('los eventos de más de un día son viajes (el más reciente primero) y los de un día van a «cortos»', () => {
    const { viajes, cortos, manuales } = combinarAlbumes([], [
      evento('a', dia(2025, 6, 2), dia(2025, 6, 5)),
      evento('b', dia(2026, 3, 12), dia(2026, 3, 15)),
      evento('c', dia(2026, 2, 14), dia(2026, 2, 14, 22)),
      evento('d', dia(2026, 5, 1)),
    ], ahora);
    expect(viajes.map((a) => a.eventId)).toEqual(['b', 'a']);
    expect(cortos.map((a) => a.eventId)).toEqual(['d', 'c']);
    expect(manuales).toEqual([]);
  });

  test('los eventos que aún no han llegado no son álbumes', () => {
    const { viajes, cortos } = combinarAlbumes([], [evento('f', dia(2026, 12, 20), dia(2026, 12, 24))], ahora);
    expect(viajes).toEqual([]);
    expect(cortos).toEqual([]);
  });

  test('un álbum con doc gana al virtual del mismo evento (conserva su título y sus excluidas)', () => {
    const real = doc('ev-a', { tipo: 'evento', eventId: 'a', start: dia(2025, 6, 2), end: dia(2025, 6, 5), titulo: 'Lisboa', excluidas: ['x'] });
    const { viajes } = combinarAlbumes([real], [evento('a', dia(2025, 6, 2), dia(2025, 6, 5))], ahora);
    expect(viajes).toHaveLength(1);
    expect(viajes[0]).toMatchObject({ titulo: 'Lisboa', virtual: false, excluidas: ['x'] });
  });

  test('si el evento se borra, su álbum con doc se queda', () => {
    const real = doc('ev-a', { tipo: 'evento', eventId: 'a', start: dia(2025, 6, 2), end: dia(2025, 6, 5) });
    expect(combinarAlbumes([real], [], ahora).viajes.map((a) => a.id)).toEqual(['ev-a']);
  });

  test('los álbumes a mano van aparte, el último creado primero', () => {
    const { manuales } = combinarAlbumes([doc('a', { creadoEn: 1 }), doc('b', { creadoEn: 3 }), doc('c', { creadoEn: 2 })], [], ahora);
    expect(manuales.map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  test('un álbum de evento con doc pero sin título (lo creó una foto quitada) usa el título del evento', () => {
    const real = doc('ev-a', { tipo: 'evento', eventId: 'a', start: dia(2025, 6, 2), end: dia(2025, 6, 5), titulo: 'Álbum', sinTitulo: true });
    const { viajes } = combinarAlbumes([real], [evento('a', dia(2025, 6, 2), dia(2025, 6, 5))], ahora);
    expect(viajes[0].titulo).toBe('Evento a');
  });
});

describe('albumDeDoc', () => {
  const snap = (data) => ({ id: 'ev-a', data: () => data });

  test('sin title en el doc, avisa de que no tiene título propio', () => {
    expect(albumDeDoc(snap({ kind: 'evento', eventId: 'a' }))).toMatchObject({ titulo: 'Álbum', sinTitulo: true });
    expect(albumDeDoc(snap({ kind: 'evento', eventId: 'a', title: 'Roma' }))).toMatchObject({ titulo: 'Roma', sinTitulo: false });
  });
});

describe('el fin de un evento creado en otro huso', () => {
  // The calendar stores the end as 23:59:59.999 of the day in the phone that made the event
  const finLocal = (y, m, d, offset) => Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offset * 3600000;
  const medioDia = (y, m, d, offset) => Date.UTC(y, m - 1, d, 12) - offset * 3600000;
  const ts = (ms) => ({ toMillis: () => ms });
  const deDoc = (inicio, fin) => albumDeDoc({ id: 'ev-a', data: () => ({ kind: 'evento', eventId: 'a', start: ts(inicio), end: ts(fin) }) });

  test.each([['Madrid', 1], ['Londres', 0], ['Bogotá', -5], ['Hawái', -10], ['Tokio', 9], ['Nueva Zelanda', 12]])(
    'un día desde %s es un día, no dos; un viaje de tres, tres', (_, offset) => {
      const uno = deDoc(medioDia(2026, 3, 15, offset), finLocal(2026, 3, 15, offset));
      expect(diasDeAlbum(uno)).toBe(1);
      const tres = deDoc(medioDia(2026, 3, 14, offset), finLocal(2026, 3, 16, offset));
      expect(diasDeAlbum(tres)).toBe(3);
      // Its range ends 3 days of margin after the 16th (00:00 of the 20th in Madrid)
      expect(iso(rangoDeAlbum(tres).hasta)).toBe('2026-03-19T23:00:00.000Z');
    },
  );

  test('el fin de un evento ya leído no se corrige dos veces', () => {
    const una = deDoc(medioDia(2026, 3, 15, -5), finLocal(2026, 3, 15, -5));
    const otra = deDoc(una.start, una.end);
    expect(otra.end).toBe(una.end);
  });
});

describe('escritura de un álbum de evento sin doc', () => {
  const viaje = { id: 'ev-a', titulo: 'Roma', emoji: '✈️', tipo: 'evento', eventId: 'a', start: dia(2026, 3, 12), end: dia(2026, 3, 15), excluidas: [], virtual: true, creadoEn: 0 };
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  let lote;

  beforeEach(() => {
    collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
    docRef.mockImplementation((c, ...p) => ({ path: p.length ? p.join('/') : `${c.path}/NEW`, id: p[p.length - 1] }));
    arrayUnion.mockImplementation((...x) => ({ union: x }));
    serverTimestamp.mockReturnValue('<ahora>');
    Timestamp.fromMillis.mockImplementation((ms) => ({ ms }));
    setDoc.mockResolvedValue();
    updateDoc.mockResolvedValue();
    lote = { update: vi.fn(), commit: vi.fn().mockResolvedValue() };
    writeBatch.mockReturnValue(lote);
  });

  test('quitar una foto no escribe el título ni el icono: no pisa un renombrado del otro móvil', async () => {
    await quitarDeAlbum('SEB1998', viaje, ['p1']);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, datos, opciones] = setDoc.mock.calls[0];
    expect(ref.path).toBe('pairs/SEB1998/albums/ev-a');
    expect(opciones).toEqual({ merge: true });
    expect(datos).toMatchObject({ kind: 'evento', eventId: 'a', excludedIds: { union: ['p1'] } });
    expect(datos).not.toHaveProperty('title');
    expect(datos).not.toHaveProperty('emoji');
  });

  test('quitar una foto encola el doc y las fotos sin esperar al servidor (sin conexión también se ve)', async () => {
    setDoc.mockReturnValue(new Promise(() => {})); // offline: never settles
    const r = await quitarDeAlbum('SEB1998', viaje, ['p1']);
    await flush();
    expect(r.committed).toBeInstanceOf(Promise);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(lote.commit).toHaveBeenCalledTimes(1);
  });

  test('con el doc ya hecho, quitar solo actualiza las excluidas', async () => {
    await quitarDeAlbum('SEB1998', { ...viaje, virtual: false }, ['p1']);
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/albums/ev-a', id: 'ev-a' }, { excludedIds: { union: ['p1'] } });
  });

  test('renombrarlo le da el doc sin título y luego escribe el nombre nuevo', async () => {
    await guardarAlbum('SEB1998', viaje, { titulo: 'Roma 🍕', emoji: '🍕' });
    await flush();
    expect(setDoc.mock.calls[0][1]).not.toHaveProperty('title');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/albums/ev-a', id: 'ev-a' }, { title: 'Roma 🍕', emoji: '🍕' });
  });
});
