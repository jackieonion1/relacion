import { createMembership } from './membership';
import { deviceLabel } from '../../../functions/membershipLogic';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const fail = (code) => Object.assign(new Error(code), { code: `functions/${code}` });
const memoryStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

function make(opts = {}) {
  const store = opts.store || memoryStore();
  const m = createMembership({ getUid: async () => 'uid-1', store, onError: () => {}, ...opts });
  return { m, store };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createMembership', () => {
  test('sin join (sin Firebase o en tests) todos son miembros, como antes', async () => {
    const m = createMembership();
    expect(m.get().status).toBe('member');
    await m.start('SEB1998');
    expect(m.get()).toMatchObject({ pairId: 'SEB1998', status: 'member' });
  });

  test('un uid nuevo se une en segundo plano y queda la marca', async () => {
    const answer = deferred();
    const join = vi.fn(() => answer.promise);
    const { m, store } = make({ join });
    m.start('SEB1998');
    await flush();
    expect(join).toHaveBeenCalledWith({ pairId: 'SEB1998' });
    expect(m.get().status).toBe('joining');
    answer.resolve({ ok: true });
    await flush();
    expect(m.get().status).toBe('member');
    expect(store.getItem('member')).toBe('SEB1998:uid-1');
  });

  test('ya es miembro (marca de este uid): no vuelve a llamar a joinPair, tampoco sin red', async () => {
    const join = vi.fn();
    const check = vi.fn(async () => null); // offline: no se pudo preguntar
    const { m } = make({ join, check, store: memoryStore({ member: 'SEB1998:uid-1' }), isOnline: () => false });
    await m.start('SEB1998');
    expect(m.get().status).toBe('member');
    expect(join).not.toHaveBeenCalled();
  });

  test('la marca de otro uid (iOS borró la sesión) o de otra pareja no vale: vuelve a unirse', async () => {
    const join = vi.fn(async () => ({ ok: true }));
    const { m } = make({ join, store: memoryStore({ member: 'SEB1998:uid-viejo' }) });
    await m.start('SEB1998');
    expect(join).toHaveBeenCalledTimes(1);
    const other = make({ join, store: memoryStore({ member: 'OTRA42:uid-1' }) });
    await other.m.start('SEB1998');
    expect(join).toHaveBeenCalledTimes(2);
  });

  test('pareja cerrada: pide invitación; una mala avisa y una buena entra', async () => {
    const join = vi.fn(async ({ invite }) => {
      if (!invite) throw fail('failed-precondition');
      if (invite !== 'ABCDEFGH') throw fail('permission-denied');
      return { ok: true };
    });
    const { m, store } = make({ join });
    await m.start('SEB1998');
    expect(m.get()).toMatchObject({ status: 'invite', error: '' });
    expect(await m.redeem('ZZZZZZZZ')).toBe(false);
    expect(m.get()).toMatchObject({ status: 'invite', error: 'invite' });
    expect(await m.redeem('ABCDEFGH')).toBe(true);
    expect(m.get().status).toBe('member');
    expect(store.getItem('member')).toBe('SEB1998:uid-1');
  });

  test('sin red al escribir la invitación: se queda en esa pantalla con el aviso', async () => {
    const join = vi.fn(async ({ invite }) => { throw fail(invite ? 'unavailable' : 'failed-precondition'); });
    const { m } = make({ join });
    await m.start('SEB1998');
    await m.redeem('ABCDEFGH');
    expect(m.get()).toMatchObject({ status: 'invite', error: 'network' });
  });

  test('sin red: no hay temporizador, y al volver la red se une', async () => {
    let online = false;
    const join = vi.fn(async () => { if (!online) throw fail('unavailable'); return { ok: true }; });
    const { m } = make({ join, isOnline: () => online });
    await m.start('SEB1998');
    expect(m.get().status).toBe('retrying');
    vi.advanceTimersByTime(60000);
    expect(join).toHaveBeenCalledTimes(1);
    online = true;
    m.retry();
    await flush();
    expect(join).toHaveBeenCalledTimes(2);
    expect(m.get().status).toBe('member');
  });

  test('con red pero sin respuesta: reintenta con espera creciente, de uno en uno', async () => {
    const join = vi.fn(async () => { throw fail('internal'); });
    const { m } = make({ join, delays: [2000, 5000] });
    await m.start('SEB1998');
    m.retry(); // el evento online con uno ya pendiente adelanta el reintento, no lo duplica
    await flush();
    expect(join).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(4999);
    await flush();
    expect(join).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    await flush();
    expect(join).toHaveBeenCalledTimes(3);
  });

  test('un dispositivo quitado desde Ajustes conserva la marca: el servidor dice que no y vuelve a unirse', async () => {
    const join = vi.fn(async () => { throw fail('failed-precondition'); });
    const check = vi.fn(async () => false);
    const { m, store } = make({ join, check, store: memoryStore({ member: 'SEB1998:uid-1' }) });
    await m.start('SEB1998');
    expect(check).toHaveBeenCalledWith('SEB1998', 'uid-1');
    expect(store.getItem('member')).toBe(null);
    expect(join).toHaveBeenCalledTimes(1);
    expect(m.get().status).toBe('invite');
  });

  test('cambiar de código descarta la respuesta del anterior', async () => {
    const first = deferred();
    const join = vi.fn(({ pairId }) => (pairId === 'VIEJO1' ? first.promise : Promise.resolve({ ok: true })));
    const { m, store } = make({ join });
    m.start('VIEJO1');
    await flush();
    await m.start('NUEVO2');
    first.reject(fail('failed-precondition'));
    await flush();
    expect(m.get()).toMatchObject({ pairId: 'NUEVO2', status: 'member' });
    expect(store.getItem('member')).toBe('NUEVO2:uid-1');
  });
});

// La etiqueta la pone joinPair (functions/membershipLogic.js); el cliente solo dice si hay pantalla táctil
test('deviceLabel: qué es cada dispositivo en Ajustes', () => {
  expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148')).toBe('iPhone');
  expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', true)).toBe('iPad');
  expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', false)).toBe('Mac');
  expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('Android');
  expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36')).toBe('Tablet Android');
  expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows');
  expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Ordenador');
  expect(deviceLabel('')).toBe(''); // joinPair lo numera: «Dispositivo 3»
});
