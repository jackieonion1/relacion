import { listFavoritas, primeraFecha, mesesEntre } from './fotoConsultas';
import { listPhotosBy } from './photos';

vi.mock('./photos', () => ({ listPhotosBy: vi.fn() }));

const fake = {
  query: (...a) => ({ q: a }),
  where: (...a) => ['where', ...a],
  orderBy: (...a) => ['orderBy', ...a],
  limit: (n) => ['limit', n],
};

test('listFavoritas: una cláusula, sin orderBy ni limit (F3), y ordenadas en el cliente por fecha efectiva', async () => {
  listPhotosBy.mockResolvedValue({
    items: [
      { id: 'a', createdAt: 100, takenAt: null },
      { id: 'b', createdAt: 50, takenAt: 300 },
      { id: 'c', createdAt: 200, takenAt: null },
    ],
  });
  const r = await listFavoritas('SEB1998');
  expect(r.items.map((it) => it.id)).toEqual(['b', 'c', 'a']);
  const build = listPhotosBy.mock.calls[0][1];
  expect(build(fake, 'col')).toEqual({ q: ['col', ['where', 'favBy', 'array-contains-any', ['yo', 'ella']]] });
});

test('primeraFecha: la más antigua de las dos fechas, sin bajar miniaturas', async () => {
  listPhotosBy.mockImplementation(async (pairId, build, { keep }) => {
    const q = build(fake, 'col').q;
    const it = q[1][1] === 'takenAt' ? { createdAt: 900, takenAt: 100 } : { createdAt: 500, takenAt: null };
    expect(keep(it)).toBe(false); // the item is dropped before its thumb
    return { items: [] };
  });
  expect(await primeraFecha('SEB1998')).toBe(100);
  expect(listPhotosBy.mock.calls.map((c) => c[1](fake, 'col').q.slice(1))).toEqual([
    [['orderBy', 'createdAt', 'asc'], ['limit', 1]],
    [['orderBy', 'takenAt', 'asc'], ['limit', 1]],
  ]);
});

test('primeraFecha sin fotos es null', async () => {
  listPhotosBy.mockResolvedValue({ items: [] });
  expect(await primeraFecha('SEB1998')).toBeNull();
});

test('mesesEntre: del mes de hoy hacia atrás, por años', () => {
  expect(mesesEntre(new Date(2024, 10, 20).getTime(), new Date(2026, 1, 2).getTime())).toEqual([
    { y: 2026, meses: [1, 0] },
    { y: 2025, meses: [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
    { y: 2024, meses: [11, 10] },
  ]);
});
