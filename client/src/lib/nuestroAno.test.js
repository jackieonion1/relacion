import { analizar, cargarNuestroAno, construirHistorias, enVentana, eventoPlano, olvidarNuestroAno, ordinal, ventanaAniversario, yaAbierto } from './nuestroAno';

const PAIR = 'SEB1998';
// Noon in Madrid of y-m-d (Nov-Mar are CET, so UTC+1)
const dia = (y, m, d) => Date.UTC(y, m - 1, d, 11);
const foto = (id, ms, extra = {}) => ({ id, createdAt: ms, takenAt: null, identity: '', reactions: {}, favBy: [], ...extra });
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const V = ventanaAniversario(new Date('2026-12-01T10:00:00Z'));

beforeEach(() => {
  localStorage.clear();
  olvidarNuestroAno();
});

describe('ventanaAniversario', () => {
  test('el 2.º aniversario resume del 24-nov-2025 al 24-nov-2026, en hora de Madrid', () => {
    const v = ventanaAniversario(new Date('2026-10-02T10:00:00Z'));
    expect(v.anio).toBe(2026);
    expect(v.n).toBe(2);
    expect(new Date(v.desde).toISOString()).toBe('2025-11-23T23:00:00.000Z');
    expect(new Date(v.hasta).toISOString()).toBe('2026-11-23T23:00:00.000Z');
  });

  test('cada año sigue a la última ventana abierta, y nunca baja del 2.º', () => {
    expect(ventanaAniversario(new Date('2027-03-01T10:00:00Z')).anio).toBe(2026);
    expect(ventanaAniversario(new Date('2027-11-20T10:00:00Z')).n).toBe(3);
    expect(ventanaAniversario(new Date('2025-12-01T10:00:00Z')).anio).toBe(2026);
  });

  test('la tarjeta sale del 17-nov al 8-dic (el 8 entero), y no antes ni después', () => {
    const en = (iso) => enVentana(new Date(iso));
    expect(en('2026-11-16T22:59:00Z')).toBe(false);
    expect(en('2026-11-16T23:00:00Z')).toBe(true); // 17 Nov 00:00 in Madrid
    expect(en('2026-11-24T10:00:00Z')).toBe(true);
    expect(en('2026-12-08T22:59:00Z')).toBe(true);
    expect(en('2026-12-08T23:00:00Z')).toBe(false); // 9 Dec 00:00
    expect(en('2026-10-02T10:00:00Z')).toBe(false);
    expect(en('2027-11-20T10:00:00Z')).toBe(true);
  });

  test('la pantalla solo se abre sin ensayo cuando ya ha abierto la primera ventana', () => {
    expect(yaAbierto(new Date('2026-10-02T10:00:00Z'))).toBe(false);
    expect(yaAbierto(new Date('2026-11-17T10:00:00Z'))).toBe(true);
    expect(yaAbierto(new Date('2027-03-01T10:00:00Z'))).toBe(true);
  });

  test('ordinal: palabra hasta el décimo, número después', () => {
    expect([ordinal(2), ordinal(3), ordinal(11)]).toEqual(['segundo', 'tercer', '11.º']);
  });
});

describe('analizar', () => {
  const evento = (extra) => eventoPlano({ start: { toMillis: () => local(2026, 1, 10) }, ...extra });

  test('fotos: total, por persona, por mes (fecha efectiva) y el mejor mes', () => {
    const fotos = [
      foto('a', dia(2025, 12, 5), { identity: 'yo' }),
      foto('b', dia(2026, 3, 2), { identity: 'ella' }),
      foto('c', dia(2026, 3, 9), { identity: 'ella' }),
      foto('d', dia(2026, 3, 20)), // no author
      // Uploaded in October, taken in February: February's
      foto('e', dia(2026, 10, 1), { takenAt: dia(2026, 2, 14), identity: 'yo' }),
    ];
    const { fotos: f } = analizar({ fotos }, V);
    expect([f.total, f.yo, f.ella]).toEqual([5, 2, 2]);
    expect(f.meses).toHaveLength(13);
    expect(f.meses[0]).toEqual({ anio: 2025, mes: 10, n: 0 });
    expect(f.meses[1]).toEqual({ anio: 2025, mes: 11, n: 1 });
    expect(f.mejorMes).toEqual({ anio: 2026, mes: 2, n: 3 });
    expect(f.meses.find((m) => m.mes === 1).n).toBe(1);
  });

  test('mes a mes: 13 huecos, y las fotos del 1 al 23 de noviembre del año que cierra caen en el último', () => {
    const fotos = [foto('a', dia(2025, 11, 26)), foto('b', dia(2026, 11, 10)), foto('c', dia(2026, 11, 23))];
    const { fotos: f } = analizar({ fotos }, V);
    expect(f.meses).toHaveLength(13);
    expect(f.meses[0]).toMatchObject({ anio: 2025, mes: 10, n: 1 });
    expect(f.meses[12]).toMatchObject({ anio: 2026, mes: 10, n: 2 });
    expect(f.meses.reduce((s, m) => s + m.n, 0)).toBe(f.total);
  });

  test('sin fotos no hay mejor mes ni favorita', () => {
    const { fotos: f } = analizar({}, V);
    expect([f.total, f.mejorMes, f.favorita]).toEqual([0, null, null]);
  });

  test('la favorita es la de más corazones (reacciones y marcas ♥), la más antigua si empatan, y ninguna si nadie reaccionó', () => {
    const base = [foto('a', dia(2026, 1, 1)), foto('b', dia(2026, 2, 1))];
    expect(analizar({ fotos: base }, V).fotos.favorita).toBeNull();
    const reaccionadas = [
      foto('a', dia(2026, 4, 1), { reactions: { yo: '💖' } }),
      foto('b', dia(2026, 2, 1), { reactions: { yo: '🥹' } }),
      foto('c', dia(2026, 3, 1), { reactions: { yo: '💖', ella: '💖' }, favBy: ['ella'] }),
      foto('d', dia(2026, 5, 1), { reactions: { yo: '', ella: '🔥' }, favBy: ['yo', 'ella'] }),
    ];
    expect(analizar({ fotos: reaccionadas }, V).fotos.favorita).toMatchObject({ fotoId: 'c', favBy: ['ella'] });
    expect(analizar({ fotos: reaccionadas.slice(0, 2) }, V).fotos.favorita.fotoId).toBe('b');
  });

  test('encuentros: los días que se vieron (sin repetir y recortados a la ventana), el más largo y el sitio que más se repite', () => {
    const eventos = [
      evento({ title: 'Valencia', seeEachOther: true, location: 'Valencia', end: { toMillis: () => local(2026, 1, 13, 23, 59) } }), // 4 days
      evento({ title: 'Fin de semana', seeEachOther: true, location: ' valencia ', start: { toMillis: () => local(2026, 1, 12) }, end: { toMillis: () => local(2026, 1, 14, 23, 59) } }), // 12-14, overlaps 2 days
      evento({ title: 'Cena', seeEachOther: false, location: 'Valencia' }),
      // Began before the year: it is not counted
      evento({ title: 'Antes', seeEachOther: true, start: { toMillis: () => local(2025, 6, 1) } }),
    ];
    const { encuentros: e } = analizar({ eventos: eventos.slice(0, 3) }, V);
    expect(e.n).toBe(2);
    expect(e.dias).toBe(5); // 10,11,12,13,14
    expect(e.masLargo).toEqual({ dias: 4, titulo: 'Valencia' });
    expect(e.sitio).toEqual({ lugar: 'Valencia', veces: 2 });
    expect(analizar({ eventos: [eventos[3]] }, V).encuentros.dias).toBe(0);
  });

  test('planes: por tipo, con lo desconocido como «los dos»', () => {
    const eventos = [
      evento({ eventType: 'conjunto' }), evento({ eventType: 'novio' }), evento({ eventType: 'novia' }),
      evento({ eventType: 'novia' }), evento({}), evento({ eventType: 'raro' }),
    ];
    expect(analizar({ eventos }, V).planes).toEqual({ total: 6, conjunto: 3, novio: 1, novia: 2 });
  });

  test('notas y canciones: total y por persona', () => {
    const r = analizar({ notas: [{ identity: 'yo' }, { identity: 'ella' }, { identity: '' }], canciones: [{ identity: 'ella' }] }, V);
    expect(r.notas).toEqual({ total: 3, yo: 1, ella: 1 });
    expect(r.canciones).toEqual({ total: 1, yo: 0, ella: 1 });
  });
});

describe('construirHistorias', () => {
  const vacio = analizar({}, V);
  const ids = (stats, now) => construirHistorias(stats, now).map((h) => h.id);

  test('sin datos solo quedan la portada, los días juntos y el cierre', () => {
    expect(ids(vacio)).toEqual(['portada', 'dias', 'cierre']);
  });

  test('con datos salen todas, en orden, y cada una solo si su dato no es 0', () => {
    const stats = analizar({
      fotos: [foto('a', dia(2026, 3, 2), { identity: 'yo', reactions: { yo: '💖' } })],
      eventos: [
        eventoPlano({ title: 'Valencia', seeEachOther: true, location: 'Valencia', start: { toMillis: () => local(2026, 1, 10) }, end: { toMillis: () => local(2026, 1, 12, 23, 59) } }),
        eventoPlano({ title: 'Otra', seeEachOther: true, location: 'Valencia', start: { toMillis: () => local(2026, 5, 10) } }),
      ],
      notas: [{ identity: 'yo' }],
      canciones: [{ identity: 'ella' }],
    }, V);
    expect(ids(stats)).toEqual(['portada', 'dias', 'encuentros', 'largo', 'sitio', 'planes', 'fotos', 'meses', 'foto', 'notas', 'canciones', 'cierre']);
    expect(construirHistorias(stats).find((h) => h.id === 'foto')).toMatchObject({ id: 'foto', fotoId: 'a' });
    // A single day together is no «longest»
    expect(ids({ ...stats, encuentros: { ...stats.encuentros, masLargo: { dias: 1, titulo: 'x' } } })).not.toContain('largo');
    expect(ids({ ...stats, notas: { total: 0, yo: 0, ella: 0 } })).not.toContain('notas');
  });

  test('los días juntos llegan a 730 el día del aniversario, y antes cuentan hasta hoy', () => {
    const dias = (now) => construirHistorias(vacio, now).find((h) => h.id === 'dias');
    expect(dias(new Date('2026-11-24T10:00:00Z'))).toMatchObject({ dias: 730, mesiversarios: 24 });
    expect(dias(new Date('2026-12-05T10:00:00Z'))).toMatchObject({ dias: 730, mesiversarios: 24 });
    expect(dias(new Date('2026-11-20T10:00:00Z'))).toMatchObject({ dias: 726, mesiversarios: 23 });
  });
});

describe('cargarNuestroAno', () => {
  const AHORA = new Date('2026-11-20T10:00:00Z');
  const clave = `nuestro-ano:${PAIR}:2026`;
  const datos = () => vi.fn(async () => ({ notas: [{ identity: 'yo' }] }));

  test('calcula una vez y guarda en el móvil; la siguiente vez no pregunta', async () => {
    const calcular = datos();
    const a = await cargarNuestroAno(PAIR, { now: AHORA, calcular });
    expect(a.notas.total).toBe(1);
    expect(calcular).toHaveBeenCalledWith(PAIR, expect.objectContaining({ anio: 2026 }));
    expect(JSON.parse(localStorage.getItem(clave)).stats.notas.total).toBe(1);
    olvidarNuestroAno();
    await cargarNuestroAno(PAIR, { now: AHORA, calcular });
    expect(calcular).toHaveBeenCalledTimes(1);
  });

  test('dos llamadas a la vez comparten un solo cálculo', async () => {
    const calcular = datos();
    await Promise.all([cargarNuestroAno(PAIR, { now: AHORA, calcular }), cargarNuestroAno(PAIR, { now: AHORA, calcular })]);
    expect(calcular).toHaveBeenCalledTimes(1);
  });

  test('antes del 24 lo guardado solo vale ese día: el año sigue corriendo', async () => {
    const calcular = datos();
    await cargarNuestroAno(PAIR, { now: AHORA, calcular });
    olvidarNuestroAno();
    await cargarNuestroAno(PAIR, { now: new Date('2026-11-21T10:00:00Z'), calcular });
    expect(calcular).toHaveBeenCalledTimes(2);
  });

  test('calculado el día 24 o después, ya es el definitivo', async () => {
    const calcular = datos();
    await cargarNuestroAno(PAIR, { now: new Date('2026-11-24T10:00:00Z'), calcular });
    olvidarNuestroAno();
    await cargarNuestroAno(PAIR, { now: new Date('2026-12-06T10:00:00Z'), calcular });
    expect(calcular).toHaveBeenCalledTimes(1);
  });

  test('el ensayo ni lee ni escribe en el móvil', async () => {
    localStorage.setItem(clave, JSON.stringify({ computedAt: AHORA.getTime(), stats: { v: 1, notas: { total: 99 } } }));
    const antes = localStorage.getItem(clave);
    const calcular = datos();
    const r = await cargarNuestroAno(PAIR, { now: AHORA, ensayo: true, calcular });
    expect(r.notas.total).toBe(1);
    expect(localStorage.getItem(clave)).toBe(antes);
    expect(localStorage.length).toBe(1);
  });

  test('sin conexión una caché vieja vale más que un error; sin caché, el error sale', async () => {
    const calcular = datos();
    await cargarNuestroAno(PAIR, { now: AHORA, calcular });
    olvidarNuestroAno();
    const falla = vi.fn(async () => { throw new Error('unavailable'); });
    const r = await cargarNuestroAno(PAIR, { now: new Date('2026-11-22T10:00:00Z'), calcular: falla });
    expect(r.notas.total).toBe(1);
    expect(falla).toHaveBeenCalledTimes(1);
    localStorage.clear();
    olvidarNuestroAno();
    await expect(cargarNuestroAno(PAIR, { now: AHORA, calcular: falla })).rejects.toThrow('unavailable');
  });

  test('una caché de otra versión se ignora', async () => {
    localStorage.setItem(clave, JSON.stringify({ computedAt: AHORA.getTime(), stats: { v: 0 } }));
    const calcular = datos();
    await cargarNuestroAno(PAIR, { now: AHORA, calcular });
    expect(calcular).toHaveBeenCalledTimes(1);
  });
});
