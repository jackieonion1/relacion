import { fechaCorta, fotosEnRango, fotosDelDia, fotosEnRangoTope, haceAnosTexto, listarConTope, olvidarPortadas, portadaCacheada, portadaDeRango, rangoTexto } from './recuerdos';
import { listPhotosBy } from './photos';

vi.mock('./photos', async (orig) => ({ ...(await orig()), listPhotosBy: vi.fn() }));

const PAIR = 'SEB1998';
const foto = (id, createdAt, takenAt = null) => ({ id, thumbUrl: '', createdAt, takenAt });

// Cada consulta sale con el campo por el que filtra, para que el test sepa a cuál contesta
function consultas({ porCreatedAt = [], porTakenAt = [], desdeCache = false }) {
  listPhotosBy.mockImplementation(async (pairId, build, { keep, alResponder } = {}) => {
    const where = vi.fn((campo) => campo);
    const query = vi.fn((col, ...campos) => campos[0]);
    const campo = build({ query, where }, 'col');
    alResponder?.(desdeCache);
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

  test('si las consultas salen de la caché (sin red) el día vacío no se recuerda', async () => {
    consultas({ desdeCache: true });
    expect(await fotosDelDia(PAIR, hoy)).toEqual([]);
    expect(localStorage.length).toBe(0);
    listPhotosBy.mockClear();
    consultas({});
    await fotosDelDia(PAIR, hoy);
    expect(listPhotosBy).toHaveBeenCalledTimes(6); // the next look does ask, and now it is remembered
    expect(localStorage.length).toBe(1);
  });

  test('con el móvil sin conexión el día vacío tampoco se recuerda', async () => {
    const enLinea = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    consultas({});
    expect(await fotosDelDia(PAIR, hoy)).toEqual([]);
    enLinea.mockRestore();
    expect(localStorage.length).toBe(0);
  });

  test('el 29 de febrero se salta los años que no son bisiestos', async () => {
    consultas({});
    await fotosDelDia(PAIR, new Date('2028-02-29T12:00:00Z'), 4);
    // 2027, 2026 y 2025 no tienen 29; 2024 sí: 1 año de 4 → 2 consultas
    expect(listPhotosBy).toHaveBeenCalledTimes(2);
  });

  test('con max usa las consultas con tope y los items salen de la más antigua a la más reciente', async () => {
    consultasTope({ porTakenAt: [foto('x', 1, dia(2025)), foto('w', 1, dia(2025) - 3600000)] });
    const r = await fotosDelDia(PAIR, hoy, 3, { max: 1 });
    expect(r.map((a) => [a.anos, a.items.map((f) => f.id)])).toEqual([[1, ['w', 'x']]]);
    expect(listPhotosBy).toHaveBeenCalledTimes(6);
  });
});

// Como `consultas`, pero la consulta también se ordena y se limita; devuelve las cláusulas de cada consulta
function consultasTope({ porCreatedAt = [], porTakenAt = [] }) {
  const vistas = [];
  listPhotosBy.mockImplementation(async (pairId, build, { keep } = {}) => {
    const lib = { query: (col, ...c) => c, where: (campo) => campo, orderBy: (campo, dir) => ['orderBy', campo, dir], limit: (n) => ['limit', n] };
    const clausulas = build(lib, 'col');
    vistas.push(clausulas);
    const todas = clausulas[0] === 'createdAt' ? porCreatedAt : porTakenAt;
    const tope = clausulas.find((c) => c[0] === 'limit')?.[1];
    const lista = tope ? todas.slice(0, tope) : todas; // as the server cuts it
    return { items: keep ? lista.filter(keep) : lista };
  });
  return vistas;
}

describe('listarConTope', () => {
  test('solo las primeras `max` aceptadas pasan a las miniaturas, y devuelve todas las aceptadas', async () => {
    let conMiniatura;
    listPhotosBy.mockImplementation(async (pairId, build, { keep }) => {
      conMiniatura = [foto('a', 1), foto('b', 2), foto('c', 3), foto('d', 4)].filter(keep).map((f) => f.id);
      return { items: [] };
    });
    const r = await listarConTope(PAIR, () => null, { max: 2, filtro: (f) => f.id !== 'b' });
    expect(conMiniatura).toEqual(['a', 'c']);
    expect(r.items.map((f) => f.id)).toEqual(['a', 'c', 'd']);
  });

  test('con max 0 no hay ninguna miniatura (solo se quieren los ids)', async () => {
    let conMiniatura;
    listPhotosBy.mockImplementation(async (pairId, build, { keep }) => {
      conMiniatura = [foto('a', 1), foto('b', 2)].filter(keep);
      return { items: [] };
    });
    const r = await listarConTope(PAIR, () => null, { max: 0 });
    expect(conMiniatura).toEqual([]);
    expect(r.items.map((f) => f.id)).toEqual(['a', 'b']);
  });

  test('con onThumb devuelve la thumbsDone de listPhotosBy', async () => {
    const thumbsDone = Promise.resolve();
    listPhotosBy.mockResolvedValue({ items: [], thumbsDone });
    expect((await listarConTope(PAIR, () => null, { onThumb: () => {} })).thumbsDone).toBe(thumbsDone);
  });
});

describe('fotosEnRangoTope', () => {
  test('junta las dos consultas, de la más antigua a la más reciente, y ordena cada una por su campo', async () => {
    const vistas = consultasTope({
      porCreatedAt: [foto('a', 150), foto('b', 160, 5000)],
      porTakenAt: [foto('c', 9000, 140)],
    });
    const { items } = await fotosEnRangoTope(PAIR, 100, 200);
    expect(items.map((f) => f.id)).toEqual(['c', 'a']);
    expect(vistas.map((v) => v[2])).toEqual([['orderBy', 'createdAt', 'asc'], ['orderBy', 'takenAt', 'asc']]);
    expect(vistas.map((v) => v.length)).toEqual([3, 3]); // sin `limite`, sin limit
  });

  test('`limite` recorta los documentos que lee cada consulta', async () => {
    const vistas = consultasTope({});
    await fotosEnRangoTope(PAIR, 100, 200, { limite: 4 });
    expect(vistas.map((v) => v[3])).toEqual([['limit', 4], ['limit', 4]]);
  });

  test('si el límite corta una consulta y todas sus fotos se descartan, la repite con más margen', async () => {
    // The first 4 uploads of the range were dated by hand to another day: they are in the takenAt query of that day
    const fechadas = [1, 2, 3, 4].map((i) => foto(`f${i}`, 100 + i, 9999));
    const vistas = consultasTope({ porCreatedAt: [...fechadas, foto('buena', 150)] });
    const { items } = await fotosEnRangoTope(PAIR, 100, 200, { limite: 4 });
    expect(items.map((f) => f.id)).toEqual(['buena']);
    expect(vistas.filter((v) => v[0] === 'createdAt').map((v) => v[3])).toEqual([['limit', 4], ['limit', 40]]);
  });

  test('si el límite no se alcanza, o algo pasó el filtro, no hay segunda consulta', async () => {
    const vistas = consultasTope({ porCreatedAt: [foto('a', 150), foto('b', 151, 9999), foto('c', 152), foto('d', 153)] });
    await fotosEnRangoTope(PAIR, 100, 200, { limite: 4 });
    expect(vistas.filter((v) => v[0] === 'createdAt')).toHaveLength(1);
  });

  test('`excluir` deja fuera esas fotos, vengan de la consulta que vengan', async () => {
    consultasTope({ porCreatedAt: [foto('a', 150), foto('b', 151)], porTakenAt: [foto('c', 9000, 140)] });
    const { items } = await fotosEnRangoTope(PAIR, 100, 200, { excluir: new Set(['a', 'c']) });
    expect(items.map((f) => f.id)).toEqual(['b']);
  });
});

describe('portadaDeRango', () => {
  beforeEach(() => olvidarPortadas());

  test('devuelve la miniatura de la primera foto del rango y se acuerda por rango', async () => {
    consultasTope({ porCreatedAt: [{ ...foto('a', 150), thumbUrl: 'blob:a' }, { ...foto('b', 160), thumbUrl: 'blob:b' }] });
    expect(await portadaDeRango(PAIR, 100, 200)).toBe('blob:a');
    expect(listPhotosBy).toHaveBeenCalledTimes(2);
    expect(await portadaDeRango(PAIR, 100, 200)).toBe('blob:a');
    expect(listPhotosBy).toHaveBeenCalledTimes(2);
    await portadaDeRango(PAIR, 200, 300);
    expect(listPhotosBy).toHaveBeenCalledTimes(4);
  });

  test('un rango sin fotos da cadena vacía, y olvidarPortadas obliga a mirar otra vez', async () => {
    consultasTope({});
    expect(await portadaDeRango(PAIR, 100, 200)).toBe('');
    olvidarPortadas();
    await portadaDeRango(PAIR, 100, 200);
    expect(listPhotosBy).toHaveBeenCalledTimes(4);
  });
});

describe('portadaCacheada', () => {
  beforeEach(() => olvidarPortadas());

  test('un fallo no se recuerda: la siguiente vez se vuelve a intentar', async () => {
    const buscar = vi.fn().mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce('url');
    await expect(portadaCacheada('k', buscar)).rejects.toThrow('sin red');
    expect(await portadaCacheada('k', buscar)).toBe('url');
    expect(await portadaCacheada('k', buscar)).toBe('url');
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});

describe('textos de fechas', () => {
  const dia = (y, m, d) => Date.UTC(y, m - 1, d, 11);

  test('fechaCorta', () => {
    expect(fechaCorta(dia(2025, 4, 24))).toBe('24 abr 2025');
  });

  test('rangoTexto: mismo mes, meses distintos, años distintos y un solo día', () => {
    expect(rangoTexto(dia(2026, 3, 12), dia(2026, 3, 15))).toBe('12–15 mar 2026');
    expect(rangoTexto(dia(2026, 3, 30), dia(2026, 4, 2))).toBe('30 mar – 2 abr 2026');
    expect(rangoTexto(dia(2024, 12, 28), dia(2025, 1, 2))).toBe('28 dic 2024 – 2 ene 2025');
    expect(rangoTexto(dia(2026, 2, 14), dia(2026, 2, 14))).toBe('14 feb 2026');
    expect(rangoTexto(dia(2026, 2, 14), null)).toBe('14 feb 2026');
  });

  test('haceAnosTexto', () => {
    expect(haceAnosTexto(1)).toBe('Hace un año');
    expect(haceAnosTexto(3)).toBe('Hace 3 años');
  });
});
