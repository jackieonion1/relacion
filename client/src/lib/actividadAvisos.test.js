import { renderHook, act } from '@testing-library/react';
import { useActividad, verActividad } from './actividadAvisos';
import { useGaleriaBadge, avisarCambioIdentidad } from './fotoAvisos';
import { escucharActividad, escucharVisto, marcarVisto } from './actividad';
import { escucharNoLeidos } from './fotoComentarios';

vi.mock('./actividad', async (orig) => ({ ...(await orig()), escucharActividad: vi.fn(), escucharVisto: vi.fn(), marcarVisto: vi.fn() }));
vi.mock('./fotoComentarios', () => ({ escucharNoLeidos: vi.fn() }));

let lista; let visto;
beforeEach(() => {
  localStorage.setItem('pairId', 'p1');
  localStorage.setItem('identity', 'ella');
  escucharActividad.mockImplementation((p, cb) => { lista = cb; return vi.fn(); });
  escucharVisto.mockImplementation((p, who, cb) => { visto = cb; return vi.fn(); });
  escucharNoLeidos.mockImplementation(() => vi.fn());
  marcarVisto.mockResolvedValue();
});
afterEach(() => localStorage.clear());

const e = (id, para, ms) => ({ id, tipo: 'nota', quien: para === 'ella' ? 'yo' : 'ella', para, ref: {}, ms });

test('nada sin ver hasta que «visto» contesta; luego, solo lo de esta persona y posterior', () => {
  const { result, unmount } = renderHook(() => useActividad());
  act(() => lista([e('a', 'ella', 30), e('b', 'yo', 40), e('c', 'ella', 10)]));
  expect(result.current.noLeidas).toBe(0);
  expect(result.current.lista.map((x) => x.id)).toEqual(['a', 'c']);
  act(() => visto(20));
  expect(result.current).toMatchObject({ noLeidas: 1, vistoHasta: 20, listo: true });
  unmount();
});

test('ver: la campana se apaga ya y una sola escritura con la hora de la última; sin nada nuevo, ninguna', () => {
  const { result, unmount } = renderHook(() => useActividad());
  act(() => { lista([e('a', 'ella', 30)]); visto(0); });
  act(() => verActividad());
  expect(result.current.noLeidas).toBe(0);
  expect(marcarVisto).toHaveBeenCalledWith('p1', 'ella', 30);
  act(() => verActividad());
  expect(marcarVisto).toHaveBeenCalledTimes(1);
  unmount();
});

test('cambiar «Quién eres» en Ajustes vuelve a escuchar con la persona nueva (actividad y comentarios)', () => {
  const a = renderHook(() => useActividad());
  const g = renderHook(() => useGaleriaBadge());
  expect(escucharVisto).toHaveBeenLastCalledWith('p1', 'ella', expect.any(Function), expect.any(Function));
  expect(escucharNoLeidos).toHaveBeenLastCalledWith('p1', 'ella', expect.any(Function), expect.any(Function));
  localStorage.setItem('identity', 'yo');
  act(() => avisarCambioIdentidad());
  expect(escucharVisto).toHaveBeenLastCalledWith('p1', 'yo', expect.any(Function), expect.any(Function));
  expect(escucharNoLeidos).toHaveBeenLastCalledWith('p1', 'yo', expect.any(Function), expect.any(Function));
  expect(escucharNoLeidos).toHaveBeenCalledTimes(2);
  a.unmount();
  g.unmount();
});
