import {
  entradaActividad, registrarActividad, textoActividad, lineaActividad, tiempoRelativo, paraMi, noLeidas, insignia,
  agruparActividad, destinoActividad, escucharActividad, marcarVisto, MOSTRADAS,
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
    expect(setDoc.mock.calls[0][0]).toEqual({ path: 'pairs/p1/actividad/A1', id: 'A1' });
    expect(setDoc.mock.calls[0][1]).toMatchObject({ tipo: 'comentario', para: 'ella', createdAt: '<ahora>' });
  });

  test('la reacción va a su id fijo', async () => {
    registrarActividad('p1', 'ella', 'reaccion', { ref: { photoId: 'F1' }, texto: '💖', autor: 'yo' });
    await flush();
    expect(setDoc.mock.calls[0][0].path).toBe('pairs/p1/actividad/reaccion-F1-ella');
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
    { id: 'a', para: 'ella', ms: 10 },
    { id: 'b', para: 'yo', ms: 30 },
    { id: 'c', para: 'ella', ms: 20 },
    { id: 'd', para: 'ella', ms: 40 },
  ];

  test('paraMi: solo lo de esta persona, lo último primero', () => {
    expect(paraMi(lista, 'ella').map((e) => e.id)).toEqual(['d', 'c', 'a']);
    const muchas = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, para: 'yo', ms: i }));
    expect(paraMi(muchas, 'yo')).toHaveLength(MOSTRADAS);
  });

  test('no leídas: lo posterior a vistoHasta, y 9+ como mucho', () => {
    const mias = paraMi(lista, 'ella');
    expect(noLeidas(mias, 15)).toBe(2);
    expect(noLeidas(mias, 0)).toBe(3);
    expect(noLeidas(mias, 40)).toBe(0);
    expect(insignia(3)).toBe('3');
    expect(insignia(12)).toBe('9+');
  });

  test('agrupar en «Nuevas» y «Antes»', () => {
    const { nuevas, antes } = agruparActividad(paraMi(lista, 'ella'), 15);
    expect(nuevas.map((e) => e.id)).toEqual(['d', 'c']);
    expect(antes.map((e) => e.id)).toEqual(['a']);
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
  test('escucharActividad: un solo orden por createdAt y un límite, sin where (sin índice compuesto)', async () => {
    const onChange = vi.fn();
    escucharActividad('p1', onChange, () => {});
    await flush();
    expect(where).not.toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(limit).toHaveBeenCalledWith(40);
    expect(query).toHaveBeenCalledTimes(1);
    const next = onSnapshot.mock.calls[0][1];
    next({ docs: [
      { id: 'a', data: () => ({ tipo: 'fotos', quien: 'ella', para: 'yo', n: 3, ref: { photoId: 'F1' }, createdAt: { toMillis: () => 5 } }) },
      { id: 'b', data: () => ({ tipo: 'raro', para: 'yo' }) },
    ] });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', tipo: 'fotos', n: 3, ms: 5 })]);
  });

  test('marcarVisto: una escritura en meta/actividad-visto-{identity}', async () => {
    await marcarVisto('p1', 'ella', 1234);
    expect(setDoc).toHaveBeenCalledWith({ path: 'pairs/p1/meta/actividad-visto-ella', id: 'actividad-visto-ella' }, { vistoHasta: 'ts:1234' });
    await marcarVisto('p1', 'ella', 0);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});
