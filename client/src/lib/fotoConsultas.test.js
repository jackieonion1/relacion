import { listFavoritas } from './fotoConsultas';
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
