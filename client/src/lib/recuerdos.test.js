import { fotosEnRango, fotosDelDia } from './recuerdos';
import { listPhotosBy } from './photos';

vi.mock('./photos', async (orig) => ({ ...(await orig()), listPhotosBy: vi.fn() }));

const PAIR = 'SEB1998';
const foto = (id, createdAt, takenAt = null) => ({ id, thumbUrl: '', createdAt, takenAt });

// Cada consulta sale con el campo por el que filtra, para que el test sepa a cuál contesta
function consultas({ porCreatedAt = [], porTakenAt = [] }) {
  listPhotosBy.mockImplementation(async (pairId, build, { keep } = {}) => {
    const where = vi.fn((campo) => campo);
    const query = vi.fn((col, ...campos) => campos[0]);
    const campo = build({ query, where }, 'col');
    const lista = campo === 'createdAt' ? porCreatedAt : porTakenAt;
    return { items: keep ? lista.filter(keep) : lista };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('fotosEnRango', () => {
  test('junta la consulta por createdAt (solo las sin takenAt) con la de takenAt, sin repetir y por fecha efectiva', async () => {
    consultas({
      porCreatedAt: [foto('a', 150), foto('b', 160, 5000)],
      porTakenAt: [foto('c', 9000, 140), foto('d', 9000, 120)],
    });
    const { items } = await fotosEnRango(PAIR, 100, 200);
    expect(items.map((f) => f.id)).toEqual(['a', 'c', 'd']);
    expect(listPhotosBy).toHaveBeenCalledTimes(2);
  });

  test('con onThumb devuelve una thumbsDone que espera a las dos consultas', async () => {
    let fin;
    listPhotosBy.mockResolvedValueOnce({ items: [], thumbsDone: Promise.resolve() });
    listPhotosBy.mockResolvedValueOnce({ items: [], thumbsDone: new Promise((r) => { fin = r; }) });
    const r = await fotosEnRango(PAIR, 100, 200, { onThumb: () => {} });
    let hecho = false;
    r.thumbsDone.then(() => { hecho = true; });
    await Promise.resolve();
    expect(hecho).toBe(false);
    fin();
    await r.thumbsDone;
    expect(hecho).toBe(true);
  });
});

describe('fotosDelDia', () => {
  // 15:00 UTC del 30 de septiembre de 2026 es ese mismo día en Madrid
  const hoy = new Date('2026-09-30T15:00:00Z');
  const dia = (y) => Date.parse(`${y}-09-30T10:00:00Z`);

  test('mira el mismo día de los 3 años anteriores y devuelve solo los que tienen fotos', async () => {
    consultas({ porTakenAt: [foto('x', 1, dia(2025)), foto('y', 1, dia(2023))] });
    const r = await fotosDelDia(PAIR, hoy);
    expect(r.map((a) => [a.anos, a.items.map((f) => f.id)])).toEqual([[1, ['x']], [3, ['y']]]);
    expect(listPhotosBy).toHaveBeenCalledTimes(6);
  });

  test('un día sin fotos se recuerda y no vuelve a consultar ese día', async () => {
    consultas({});
    expect(await fotosDelDia(PAIR, hoy)).toEqual([]);
    listPhotosBy.mockClear();
    expect(await fotosDelDia(PAIR, hoy)).toEqual([]);
    expect(listPhotosBy).not.toHaveBeenCalled();
  });

  test('el 29 de febrero se salta los años que no son bisiestos', async () => {
    consultas({});
    await fotosDelDia(PAIR, new Date('2028-02-29T12:00:00Z'), 4);
    // 2027, 2026 y 2025 no tienen 29; 2024 sí: 1 año de 4 → 2 consultas
    expect(listPhotosBy).toHaveBeenCalledTimes(2);
  });
});
