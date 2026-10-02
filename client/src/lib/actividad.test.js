import {
  entradaActividad, registrarActividad, textoActividad, lineaActividad, tiempoRelativo, paraMi, noLeidas, insignia,
  agruparActividad, destinoActividad, escucharActividad, escucharVisto, marcarVisto, MOSTRADAS, NUNCA,
  registrarTanda, resolverTandas,
} from './actividad';
import { collection, doc, setDoc, onSnapshot, query, orderBy, limit, where, serverTimestamp, Timestamp } from 'firebase/firestore';

vi.mock('./firebase', async () => {
  const { listenAfterAuth } = await vi.importActual('./authGate');
  const whenAuthed = () => Promise.resolve({ uid: 'u1' });
  return {
    db: {},
    storage: null,
    whenAuthed,
    listenWhenAuthed: (start, onError) => listenAfterAuth(whenAuthed, start, onError),
  };
});
vi.mock('./photoCache', () => ({ getThumb: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromMillis: vi.fn() },
}));

// The first dynamic import of firebase/firestore takes more than a few microtasks
const flush = () => new Promise((r) => setTimeout(r, 0));
// A Timestamp-like of whole milliseconds
const T = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });

beforeEach(() => {
  collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  doc.mockImplementation((c, id = 'A1') => ({ path: `${c.path}/${id}`, id }));
  serverTimestamp.mockReturnValue('<ahora>');
  Timestamp.fromMillis.mockImplementation((ms) => `ts:${ms}`);
  setDoc.mockResolvedValue();
});

describe('entradaActividad: qué deja cada acción', () => {
  test('un comentario va para la otra persona, con el texto corto y «tuya» si la foto es suya', () => {
    const e = entradaActividad('comentario', 'yo', { ref: { photoId: 'F1' }, texto: '  qué   guapa ', autor: 'ella' });
    expect(e).toEqual({ id: '', data: { tipo: 'comentario', quien: 'yo', para: 'ella', ref: { photoId: 'F1' }, texto: 'qué guapa', tuya: true } });
    expect(entradaActividad('comentario', 'ella', { ref: { photoId: 'F1' }, texto: 'x', autor: 'ella' }).data.tuya).toBe(false);
  });

  test('el texto se corta a 80 caracteres', () => {
    const e = entradaActividad('nota', 'ella', { ref: { noteId: 'N1' }, texto: 'a'.repeat(200) });
    expect(e.data.texto).toHaveLength(80);
    expect(e.data.texto.endsWith('…')).toBe(true);
  });

  test('una reacción: id fijo por foto y persona (cambiarla reescribe la misma); quitarla no deja nada', () => {
    expect(entradaActividad('reaccion', 'ella', { ref: { photoId: 'F1' }, texto: '🔥', autor: 'yo' }).id).toBe('reaccion-F1-ella');
    expect(entradaActividad('reaccion', 'ella', { ref: { photoId: 'F1' }, texto: '', autor: 'yo' })).toBeNull();
  });

  test('una favorita solo cuenta en una foto de la otra persona', () => {
    expect(entradaActividad('favorita', 'yo', { ref: { photoId: 'F1' }, autor: 'ella' }).id).toBe('favorita-F1-yo');
    expect(entradaActividad('favorita', 'yo', { ref: { photoId: 'F1' }, autor: 'yo' })).toBeNull();
    expect(entradaActividad('favorita', 'yo', { ref: { photoId: 'F1' } })).toBeNull();
  });

  test('una tanda de fotos lleva el número; una cápsula, solo para quién', () => {
    expect(entradaActividad('fotos', 'ella', { n: 12, ref: { photoId: 'F9' } }).data).toMatchObject({ tipo: 'fotos', n: 12, para: 'yo' });
    expect(entradaActividad('fotos', 'ella', { n: 0 })).toBeNull();
    const c = entradaActividad('capsula', 'yo', { ref: { capsuleId: 'K1' }, ambos: true, texto: '' });
    expect(c.data).toEqual({ tipo: 'capsula', quien: 'yo', para: 'ella', ref: { capsuleId: 'K1' }, ambos: true });
  });

  test('nada sin identidad conocida, con un tipo desconocido o sin la foto', () => {
    expect(entradaActividad('comentario', 'otro', { ref: { photoId: 'F1' } })).toBeNull();
    expect(entradaActividad('borrado', 'yo', {})).toBeNull();
    expect(entradaActividad('comentario', 'yo', { ref: {} })).toBeNull();
  });

  test('ref solo guarda las claves conocidas, en texto', () => {
    const e = entradaActividad('evento', 'yo', { ref: { eventId: '', dia: '2026-10-02', otra: 'x', photoId: 3 }, texto: 'Cena' });
    expect(e.data.ref).toEqual({ dia: '2026-10-02' });
  });
});

describe('registrarActividad', () => {
  test('una escritura, con la hora del servidor, sin esperarla', async () => {
    expect(registrarActividad('p1', 'yo', 'comentario', { ref: { photoId: 'F1' }, texto: 'hola', autor: 'ella' })).toBeUndefined();
    await flush();
    expect(setDoc).toHaveBeenCalledTimes(1);
    // Into the collection of whoever receives it: `yo` comments, so it is for `ella`
    expect(setDoc.mock.calls[0][0]).toEqual({ path: 'pairs/p1/actividad-ella/A1', id: 'A1' });
    expect(setDoc.mock.calls[0][1]).toMatchObject({ tipo: 'comentario', para: 'ella', createdAt: '<ahora>' });
  });

  test('la reacción va a su id fijo', async () => {
    registrarActividad('p1', 'ella', 'reaccion', { ref: { photoId: 'F1' }, texto: '💖', autor: 'yo' });
    await flush();
    expect(setDoc.mock.calls[0][0].path).toBe('pairs/p1/actividad-yo/reaccion-F1-ella');
  });

  test('si falla, solo avisa en la consola', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setDoc.mockRejectedValue(new Error('denied'));
    expect(() => registrarActividad('p1', 'yo', 'nota', { ref: { noteId: 'N1' } })).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalledWith('Activity write failed', expect.any(Error));
    warn.mockRestore();
  });

  test('sin pareja o sin nada que contar no escribe', async () => {
    registrarActividad('', 'yo', 'nota', {});
    registrarActividad('p1', 'yo', 'reaccion', { ref: { photoId: 'F1' }, texto: '' });
    await flush();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

// One «fotos» entry per batch, when the upload has really finished (offline, slow or retried ones included)
describe('tandas de fotos', () => {
  const fotos = () => setDoc.mock.calls.map(([, data]) => data).filter((d) => d.tipo === 'fotos');
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  test('sin nada pendiente, el aviso sale ya, con las subidas', async () => {
    registrarTanda('p1', 'yo', ['F1', 'F2'], [], []);
    await flush();
    expect(setDoc.mock.calls[0][0].path).toBe('pairs/p1/actividad-ella/A1');
    expect(fotos()).toEqual([expect.objectContaining({ n: 2, quien: 'yo', ref: { photoId: 'F1' } })]);
  });

  test('con pendientes espera: sale una sola vez, al subir la última, con todas las que subieron', async () => {
    registrarTanda('p1', 'yo', ['F1'], ['F2', 'F3'], ['F2', 'F3']);
    await flush();
    expect(setDoc).not.toHaveBeenCalled();
    resolverTandas('p1', ['F3'], ['F2']); // F2 goes up, F3 still waits
    await flush();
    expect(setDoc).not.toHaveBeenCalled();
    resolverTandas('p1', [], ['F3']);
    await flush();
    expect(fotos()).toEqual([expect.objectContaining({ n: 3, ref: { photoId: 'F1' } })]);
    // A retry that tells again of photos already told: nothing more
    resolverTandas('p1', [], ['F2', 'F3']);
    resolverTandas('p1', [], ['F3']);
    await flush();
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  test('sobrevive a una recarga: la tanda espera en localStorage', async () => {
    registrarTanda('p1', 'ella', [], ['F9'], ['F9']);
    resolverTandas('p1', [], ['F9']);
    await flush();
    expect(setDoc.mock.calls[0][0].path).toBe('pairs/p1/actividad-yo/A1');
    expect(fotos()).toEqual([expect.objectContaining({ n: 1, quien: 'ella', ref: { photoId: 'F9' } })]);
  });

  test('una foto perdida o borrada no cuenta; si ninguna subió, no hay aviso', async () => {
    registrarTanda('p1', 'yo', ['F1'], ['F2', 'F3'], ['F2', 'F3']);
    registrarTanda('p1', 'yo', [], ['G1'], ['G1']);
    resolverTandas('p1', [], ['F2']); // F3 and G1 left the pending list without being sent
    await flush();
    expect(fotos()).toEqual([expect.objectContaining({ n: 2 })]);
  });

  test('si una pendiente ya había terminado cuando se registra la tanda, cuenta como subida', async () => {
    registrarTanda('p1', 'yo', ['F1'], ['F2', 'F3'], ['F3']);
    resolverTandas('p1', [], ['F3']);
    await flush();
    expect(fotos()).toEqual([expect.objectContaining({ n: 3 })]);
  });

  test('sin localStorage no lanza ni escribe de más', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => registrarTanda('p1', 'yo', ['F1'], ['F2'], ['F2'])).not.toThrow();
    expect(() => resolverTandas('p1', [], ['F2'])).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('textos', () => {
  const e = (x) => ({ quien: 'yo', ref: {}, ...x });
  test('cada tipo se dice a su manera', () => {
    expect(lineaActividad(e({ tipo: 'comentario', tuya: true, texto: 'qué guapa' }))).toBe('🫒 ha comentado tu foto: «qué guapa»');
    expect(textoActividad(e({ tipo: 'comentario', tuya: false }))).toBe('ha comentado una foto');
    expect(textoActividad(e({ tipo: 'reaccion', tuya: true, texto: '🔥' }))).toBe('ha reaccionado 🔥 a tu foto');
    expect(textoActividad(e({ tipo: 'favorita' }))).toBe('ha guardado tu foto en favoritas');
    expect(lineaActividad(e({ quien: 'ella', tipo: 'fotos', n: 12 }))).toBe('🍪 ha subido 12 fotos');
    expect(textoActividad(e({ tipo: 'fotos', n: 1 }))).toBe('ha subido una foto');
    expect(textoActividad(e({ tipo: 'nota', ref: { noteId: 'N1', threadId: 'N1' }, texto: 'Hola' }))).toBe('ha escrito una nota: «Hola»');
    expect(textoActividad(e({ tipo: 'nota', ref: { noteId: 'N2', threadId: 'N1' } }))).toBe('ha respondido en una nota');
    expect(textoActividad(e({ tipo: 'evento', texto: 'Cena' }))).toBe('ha apuntado un plan: «Cena»');
    expect(textoActividad(e({ tipo: 'eventoEditado', texto: 'Cena' }))).toBe('ha cambiado un plan: «Cena»');
    expect(textoActividad(e({ tipo: 'nosVemos', texto: 'Madrid' }))).toBe('ha apuntado cuándo os veis: «Madrid»');
    expect(textoActividad(e({ tipo: 'capsula', ambos: false }))).toBe('ha sellado una cápsula para ti');
    expect(textoActividad(e({ tipo: 'capsula', ambos: true }))).toBe('ha sellado una cápsula para los dos');
  });

  test('tiempo relativo', () => {
    const now = new Date(2026, 9, 2, 18, 0);
    const at = (...a) => new Date(...a).getTime();
    expect(tiempoRelativo(0, now)).toBe('ahora mismo');
    expect(tiempoRelativo(at(2026, 9, 2, 17, 59, 30), now)).toBe('ahora mismo');
    expect(tiempoRelativo(at(2026, 9, 2, 17, 55), now)).toBe('hace 5 min');
    expect(tiempoRelativo(at(2026, 9, 2, 9, 0), now)).toBe('hace 9 h');
    expect(tiempoRelativo(at(2026, 9, 1, 23, 50), now)).toBe('ayer');
    expect(tiempoRelativo(at(2026, 8, 28, 12, 0), now)).toBe('hace 4 días');
    expect(tiempoRelativo(at(2026, 8, 12, 12, 0), now)).toBe('12 sep');
    expect(tiempoRelativo(at(2025, 11, 31, 12, 0), now)).toBe('31 dic 2025');
  });
});

describe('listas', () => {
  const lista = [
    { id: 'a', para: 'ella', ms: 10, ts: T(10) },
    { id: 'b', para: 'yo', ms: 30, ts: T(30) },
    { id: 'c', para: 'ella', ms: 20, ts: T(20) },
    { id: 'd', para: 'ella', ms: 40, ts: T(40) },
  ];

  test('paraMi: solo lo de esta persona, lo último primero', () => {
    expect(paraMi(lista, 'ella').map((e) => e.id)).toEqual(['d', 'c', 'a']);
    const muchas = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, para: 'yo', ms: i, ts: T(i) }));
    expect(paraMi(muchas, 'yo')).toHaveLength(MOSTRADAS);
  });

  test('no leídas: lo posterior a vistoHasta, y 9+ como mucho', () => {
    const mias = paraMi(lista, 'ella');
    expect(noLeidas(mias, T(15))).toBe(2);
    expect(noLeidas(mias, NUNCA)).toBe(3);
    expect(noLeidas(mias, T(40))).toBe(0);
    expect(insignia(3)).toBe('3');
    expect(insignia(12)).toBe('9+');
  });

  test('agrupar en «Nuevas» y «Antes»', () => {
    const { nuevas, antes } = agruparActividad(paraMi(lista, 'ella'), T(15));
    expect(nuevas.map((e) => e.id)).toEqual(['d', 'c']);
    expect(antes.map((e) => e.id)).toEqual(['a']);
  });

  // The server's time has microseconds: through a double of ms the «visto» came out a microsecond short
  test('se compara por el Timestamp entero, con los microsegundos', () => {
    const s = 1792987664;
    const e = { id: 'a', para: 'ella', ms: 1792987664815.637, ts: { seconds: s, nanoseconds: 815637000 } };
    expect(noLeidas([e], { seconds: s, nanoseconds: 815637000 })).toBe(0);
    expect(noLeidas([e], { seconds: s, nanoseconds: 815636000 })).toBe(1);
    expect(agruparActividad([e], { seconds: s, nanoseconds: 815637000 }).nuevas).toEqual([]);
    const otra = { id: 'b', para: 'ella', ms: 1792987664815.637, ts: { seconds: s, nanoseconds: 815638000 } };
    expect(paraMi([e, otra], 'ella').map((x) => x.id)).toEqual(['b', 'a']);
  });

  test('una entrada aún sin hora del servidor no cuenta como nueva', () => {
    expect(noLeidas([{ id: 'p', para: 'ella', ms: 0, ts: null }], NUNCA)).toBe(0);
  });
});

describe('destinoActividad', () => {
  test('cada entrada va a lo suyo', () => {
    expect(destinoActividad({ tipo: 'comentario', ref: { photoId: 'F 1' } })).toEqual({ to: '/gallery?photo=F%201', state: { volver: '/' } });
    expect(destinoActividad({ tipo: 'fotos', ref: { photoId: 'F1' } })).toEqual({ to: '/gallery', state: null });
    expect(destinoActividad({ tipo: 'nota', ref: { noteId: 'N1' } }).to).toBe('/notes');
    expect(destinoActividad({ tipo: 'capsula', ref: { capsuleId: 'K1' } })).toEqual({ to: '/recuerdos/capsulas', state: { volver: '/' } });
    expect(destinoActividad({ tipo: 'eventoEditado', ref: { eventId: 'E1', dia: '2026-11-24' } }).to).toBe('/calendar?y=2026&m=10&d=24&ev=E1');
    expect(destinoActividad({ tipo: 'evento', ref: { dia: '2026-01-05' } }).to).toBe('/calendar?y=2026&m=0&d=5');
    expect(destinoActividad({ tipo: 'evento', ref: {} }).to).toBe('/calendar');
  });
});

describe('Firebase', () => {
  test('escucharActividad: la colección de esa persona, un solo orden por createdAt y un límite, sin where (sin índice compuesto)', async () => {
    const onChange = vi.fn();
    escucharActividad('p1', 'ella', onChange, () => {});
    await flush();
    expect(collection).toHaveBeenCalledWith(expect.anything(), 'pairs', 'p1', 'actividad-ella');
    expect(collection).not.toHaveBeenCalledWith(expect.anything(), 'pairs', 'p1', 'actividad');
    expect(where).not.toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(limit).toHaveBeenCalledWith(MOSTRADAS);
    expect(query).toHaveBeenCalledTimes(1);
    const next = onSnapshot.mock.calls[0][1];
    next({ docs: [
      { id: 'a', data: () => ({ tipo: 'fotos', quien: 'ella', para: 'yo', n: 3, ref: { photoId: 'F1' }, createdAt: { seconds: 0, nanoseconds: 5e6, toMillis: () => 5 } }) },
      { id: 'b', data: () => ({ tipo: 'raro', para: 'yo' }) },
    ] });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', tipo: 'fotos', n: 3, ms: 5, ts: expect.objectContaining({ seconds: 0, nanoseconds: 5e6 }) })]);
  });

  test('marcarVisto: una escritura en meta/actividad-visto-{identity}, con el Timestamp de la entrada tal cual', async () => {
    const ts = { seconds: 1792987664, nanoseconds: 815637000 };
    await marcarVisto('p1', 'ella', ts);
    expect(setDoc).toHaveBeenCalledWith({ path: 'pairs/p1/meta/actividad-visto-ella', id: 'actividad-visto-ella' }, { vistoHasta: ts });
    expect(setDoc.mock.calls[0][1].vistoHasta).toBe(ts);
    expect(Timestamp.fromMillis).not.toHaveBeenCalled();
    await marcarVisto('p1', 'ella', NUNCA);
    await marcarVisto('p1', 'ella', null);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  test('escucharVisto: el Timestamp guardado tal cual, y NUNCA si no hay nada', async () => {
    const onChange = vi.fn();
    escucharVisto('p1', 'ella', onChange, () => {});
    await flush();
    const next = onSnapshot.mock.calls[0][1];
    const ts = { seconds: 1792987664, nanoseconds: 815637000 };
    next({ data: () => ({ vistoHasta: ts }) });
    expect(onChange.mock.calls[0][0]).toBe(ts);
    next({ data: () => undefined });
    expect(onChange).toHaveBeenLastCalledWith(NUNCA);
  });
});
