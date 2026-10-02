import { actualizarEnLote, ponerFecha, ponerFavorita, subidasDeGolpe, fechaComun } from './fotoSeleccion';
import { collection, doc, updateDoc, writeBatch, deleteField, arrayUnion } from 'firebase/firestore';
import { madridMediodia } from './fotoFecha';

vi.mock('./firebase', () => ({ db: {}, whenAuthed: () => Promise.resolve({ uid: 'u1' }) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

const ids = (n) => Array.from({ length: n }, (_, i) => `P${i}`);
beforeEach(() => {
  vi.clearAllMocks();
  collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  doc.mockImplementation((c, id) => ({ path: `${c.path}/${id}`, id }));
  deleteField.mockReturnValue('<borrar>');
  arrayUnion.mockImplementation((x) => `+${x}`);
  updateDoc.mockReset();
  updateDoc.mockResolvedValue();
});

test('cada foto es su propia escritura, sin lotes: una borrada entretanto no arrastra a las demás', async () => {
  const r = await actualizarEnLote('SEB1998', ids(850), () => ({ x: 1 }));
  expect(updateDoc).toHaveBeenCalledTimes(850);
  expect(writeBatch).not.toHaveBeenCalled();
  expect(r).toEqual({ hechas: 850, borradas: [], fallidas: [] });
});

test('F2: la que ya no está cuenta aparte y la que falla queda para reintentar; las demás se guardan', async () => {
  updateDoc.mockImplementation(async (ref) => {
    if (ref.id === 'P1') throw Object.assign(new Error('gone'), { code: 'not-found' });
    if (ref.id === 'P2') throw Object.assign(new Error('net'), { code: 'unavailable' });
  });
  const r = await actualizarEnLote('SEB1998', ids(4), () => ({ x: 1 }));
  expect(updateDoc).toHaveBeenCalledTimes(4);
  expect(r).toEqual({ hechas: 2, borradas: ['P1'], fallidas: ['P2'] });
});

test('ponerFecha guarda el mediodía de Madrid como fecha hecha a mano, y null la quita con su fuente', async () => {
  const ms = madridMediodia('2025-03-12');
  await ponerFecha('SEB1998', ['A'], ms);
  expect(updateDoc).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'A' }), { takenAt: new Date(ms), takenAtFuente: 'mano' });
  await ponerFecha('SEB1998', ['A'], null);
  expect(updateDoc).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'A' }), { takenAt: '<borrar>', takenAtFuente: '<borrar>' });
});

test('ponerFavorita añade solo el nombre de quien la marca', async () => {
  await ponerFavorita('SEB1998', ['A', 'B'], 'ella', true);
  expect(updateDoc.mock.calls.map(([ref, data]) => [ref.id, data])).toEqual([['A', { favBy: '+ella' }], ['B', { favBy: '+ella' }]]);
});

describe('subidasDeGolpe', () => {
  const dia = (d, h = 12) => new Date(Date.UTC(2025, 0, d, h)).getTime();
  test('días con 15 o más sin fecha, el más grande primero', () => {
    const items = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, createdAt: dia(3), takenAt: null })),
      ...Array.from({ length: 16 }, (_, i) => ({ id: `b${i}`, createdAt: dia(5), takenAt: null })),
      ...Array.from({ length: 14 }, (_, i) => ({ id: `c${i}`, createdAt: dia(7), takenAt: null })),
    ];
    const r = subidasDeGolpe(items);
    expect(r.map((g) => [g.dia, g.ids.length])).toEqual([['2025-01-03', 20], ['2025-01-05', 16]]);
  });

  test('las que ya tienen fecha no cuentan', () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ id: `a${i}`, createdAt: dia(3), takenAt: i === 0 ? dia(1) : null }));
    expect(subidasDeGolpe(items)).toEqual([]);
  });
});

test('fechaComun: el día que comparten, o vacío', () => {
  const ms = madridMediodia('2025-03-12');
  expect(fechaComun([{ takenAt: ms }, { takenAt: ms + 1000 }])).toBe('2025-03-12');
  expect(fechaComun([{ takenAt: ms }, { takenAt: null }])).toBe('');
  expect(fechaComun([])).toBe('');
});
