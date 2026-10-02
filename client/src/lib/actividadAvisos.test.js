import { renderHook, act } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { useActividad, verActividad } from './actividadAvisos';
import { useGaleriaBadge, avisarCambioIdentidad } from './fotoAvisos';
import { escucharActividad, escucharVisto, marcarVisto, NUNCA } from './actividad';
import { escucharNoLeidos } from './fotoComentarios';

vi.mock('./actividad', async (orig) => ({ ...(await orig()), escucharActividad: vi.fn(), escucharVisto: vi.fn(), marcarVisto: vi.fn() }));
vi.mock('./fotoComentarios', () => ({ escucharNoLeidos: vi.fn() }));

let lista; let visto;
beforeEach(() => {
  localStorage.setItem('pairId', 'p1');
  localStorage.setItem('identity', 'ella');
  escucharActividad.mockImplementation((p, who, cb) => { lista = cb; return vi.fn(); });
  escucharVisto.mockImplementation((p, who, cb) => { visto = cb; return vi.fn(); });
  escucharNoLeidos.mockImplementation(() => vi.fn());
  marcarVisto.mockResolvedValue();
});
afterEach(() => localStorage.clear());

const T = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });
const e = (id, para, ms) => ({ id, tipo: 'nota', quien: para === 'ella' ? 'yo' : 'ella', para, ref: {}, ms, ts: T(ms) });

test('nada sin ver hasta que «visto» contesta; luego, solo lo de esta persona y posterior', () => {
  const { result, unmount } = renderHook(() => useActividad());
  act(() => lista([e('a', 'ella', 30), e('b', 'yo', 40), e('c', 'ella', 10)]));
  expect(result.current.noLeidas).toBe(0);
  expect(result.current.lista.map((x) => x.id)).toEqual(['a', 'c']);
  act(() => visto(T(20)));
  expect(result.current).toMatchObject({ noLeidas: 1, vistoHasta: T(20), listo: true });
  unmount();
});

test('ver: la campana se apaga ya y una sola escritura con la hora de la última; sin nada nuevo, ninguna', () => {
  const { result, unmount } = renderHook(() => useActividad());
  act(() => { lista([e('a', 'ella', 30)]); visto(NUNCA); });
  act(() => verActividad());
  expect(result.current.noLeidas).toBe(0);
  expect(marcarVisto).toHaveBeenCalledWith('p1', 'ella', T(30));
  act(() => verActividad());
  expect(marcarVisto).toHaveBeenCalledTimes(1);
  unmount();
});

// The bug: the entry's time went through a double of ms and came back a microsecond short, so the bell kept a «1»
test('ver: se escribe el Timestamp de la entrada tal cual y, leído de vuelta, la campana se apaga y no se vuelve a escribir', () => {
  const ts = new Timestamp(1792987664, 815637000);
  const { result, unmount } = renderHook(() => useActividad());
  act(() => { lista([{ ...e('a', 'ella', ts.toMillis()), ts }]); visto(NUNCA); });
  expect(result.current.noLeidas).toBe(1);
  act(() => verActividad());
  const escrito = marcarVisto.mock.calls[0][2];
  expect(escrito).toBe(ts);
  // The other phone of this person (or this one after a reload) reads what was written
  act(() => visto(new Timestamp(escrito.seconds, escrito.nanoseconds)));
  expect(result.current.noLeidas).toBe(0);
  act(() => verActividad());
  expect(marcarVisto).toHaveBeenCalledTimes(1);
  unmount();
});

test('un «visto» más viejo que el que ya tiene este móvil no lo baja', () => {
  const { result, unmount } = renderHook(() => useActividad());
  act(() => { lista([e('a', 'ella', 30)]); visto(T(30)); });
  act(() => visto(T(10)));
  expect(result.current.vistoHasta).toEqual(T(30));
  expect(result.current.noLeidas).toBe(0);
  unmount();
});

test('cambiar «Quién eres» en Ajustes vuelve a escuchar con la persona nueva (actividad y comentarios)', () => {
  const a = renderHook(() => useActividad());
  const g = renderHook(() => useGaleriaBadge());
  expect(escucharActividad).toHaveBeenLastCalledWith('p1', 'ella', expect.any(Function), expect.any(Function));
  expect(escucharVisto).toHaveBeenLastCalledWith('p1', 'ella', expect.any(Function), expect.any(Function));
  expect(escucharNoLeidos).toHaveBeenLastCalledWith('p1', 'ella', expect.any(Function), expect.any(Function));
  localStorage.setItem('identity', 'yo');
  act(() => avisarCambioIdentidad());
  expect(escucharActividad).toHaveBeenLastCalledWith('p1', 'yo', expect.any(Function), expect.any(Function));
  expect(escucharVisto).toHaveBeenLastCalledWith('p1', 'yo', expect.any(Function), expect.any(Function));
  expect(escucharNoLeidos).toHaveBeenLastCalledWith('p1', 'yo', expect.any(Function), expect.any(Function));
  expect(escucharNoLeidos).toHaveBeenCalledTimes(2);
  a.unmount();
  g.unmount();
});
