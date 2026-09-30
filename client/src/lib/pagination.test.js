import { splitPage, mergeUnique } from './pagination';

describe('splitPage', () => {
  test('con más docs que la página, recorta y avisa de que hay más', () => {
    const docs = [1, 2, 3, 4];
    expect(splitPage(docs, 3)).toEqual({ page: [1, 2, 3], hasMore: true });
  });

  test('con justo una página o menos, no hay más', () => {
    expect(splitPage([1, 2, 3], 3)).toEqual({ page: [1, 2, 3], hasMore: false });
    expect(splitPage([], 3)).toEqual({ page: [], hasMore: false });
  });

  test('135 fotos con páginas de 60 son 3 páginas (60 + 60 + 15)', () => {
    let rest = Array.from({ length: 135 }, (_, i) => i);
    const sizes = [];
    for (;;) {
      const { page, hasMore } = splitPage(rest.slice(0, 61), 60);
      sizes.push(page.length);
      rest = rest.slice(page.length);
      if (!hasMore) break;
    }
    expect(sizes).toEqual([60, 60, 15]);
  });
});

describe('mergeUnique', () => {
  test('añade al final y no repite ids ya presentes', () => {
    const prev = [{ id: 'C' }, { id: 'B' }];
    const next = [{ id: 'B' }, { id: 'A' }];
    expect(mergeUnique(prev, next).map((x) => x.id)).toEqual(['C', 'B', 'A']);
  });

  test('no muta los arrays de entrada', () => {
    const prev = [{ id: 'A' }];
    mergeUnique(prev, [{ id: 'B' }]);
    expect(prev).toHaveLength(1);
  });
});
