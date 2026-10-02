import { createMembership, deviceLabel } from './membership';
import { createWhenAuthed } from './authGate';

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
// Settled or not, without waiting for it
const settled = (p) => { let done = false; p.then(() => { done = true; }, () => { done = true; }); return () => done; };

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
    expect(m.get().pairId).toBe('SEB1998');
    const ready = settled(m.ready());
    await flush();
    expect(ready()).toBe(true);
  });

  test('un uid nuevo: las lecturas esperan a que joinPair conteste, y luego queda la marca', async () => {
    const answer = deferred();
    const join = vi.fn(() => answer.promise);
    const { m, store } = make({ join });
    // El mismo cableado que firebase.js: whenAuthed espera a la sesión y a la membresía
    const whenAuthed = createWhenAuthed(Promise.resolve().then(() => m.ready()), () => ({ uid: 'uid-1' }));
    m.start('SEB1998');
    const read = settled(whenAuthed(Infinity));
    await flush();
    expect(join).toHaveBeenCalledWith({ pairId: 'SEB1998' });
    expect(m.get().status).toBe('joining');
    expect(read()).toBe(false);
    answer.resolve({ ok: true });
    await flush();
    expect(read()).toBe(true);
    expect(m.get()).toMatchObject({ status: 'member', epoch: 0 });
    expect(store.getItem('member')).toBe('SEB1998:uid-1');
  });

  test('ya es miembro (marca de este uid): no llama a joinPair y lee sin red', async () => {
    const join = vi.fn();
    const check = vi.fn(async () => null); // offline: no se pudo preguntar
    const { m } = make({ join, check, store: memoryStore({ member: 'SEB1998:uid-1' }), isOnline: () => false });
    m.start('SEB1998');
    const ready = settled(m.ready());
    await flush();
    expect(ready()).toBe(true);
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

  test('pareja cerrada: pide invitación; una mala avisa, una buena entra y remonta las pantallas', async () => {
    const join = vi.fn(async ({ invite }) => {
      if (!invite) throw fail('failed-precondition');
      if (invite !== 'ABCDEFGH') throw fail('permission-denied');
      return { ok: true };
    });
    const { m, store } = make({ join });
    const ready = settled(m.ready());
    await m.start('SEB1998');
    expect(m.get()).toMatchObject({ status: 'invite', error: '' });
    expect(ready()).toBe(false);
    expect(await m.redeem('ZZZZZZZZ')).toBe(false);
    expect(m.get()).toMatchObject({ status: 'invite', error: 'invite' });
    expect(await m.redeem('ABCDEFGH')).toBe(true);
    await flush();
    expect(m.get()).toMatchObject({ status: 'member', epoch: 1 });
    expect(ready()).toBe(true);
    expect(store.getItem('member')).toBe('SEB1998:uid-1');
  });

  test('sin red al escribir la invitación: se queda en esa pantalla con el aviso', async () => {
    const join = vi.fn(async ({ invite }) => { throw fail(invite ? 'unavailable' : 'failed-precondition'); });
    const { m } = make({ join });
    await m.start('SEB1998');
    await m.redeem('ABCDEFGH');
    expect(m.get()).toMatchObject({ status: 'invite', error: 'network' });
  });

  test('primer arranque sin red y sin marca: lee de la caché ya, y al volver la red se une y remonta', async () => {
    let online = false;
    const join = vi.fn(async () => { if (!online) throw fail('unavailable'); return { ok: true }; });
    const { m } = make({ join, isOnline: () => online });
    const ready = settled(m.ready());
    await m.start('SEB1998');
    expect(m.get().status).toBe('retrying');
    expect(ready()).toBe(true); // offline las lecturas solo pueden venir de la caché
    vi.advanceTimersByTime(60000);
    expect(join).toHaveBeenCalledTimes(1); // sin red no hay temporizador: espera al evento online
    online = true;
    m.retry();
    await flush();
    expect(join).toHaveBeenCalledTimes(2);
    expect(m.get()).toMatchObject({ status: 'member', epoch: 1 });
  });

  test('con red pero sin respuesta: no deja leer y reintenta con espera, de uno en uno', async () => {
    const join = vi.fn(async () => { throw fail('internal'); });
    const { m } = make({ join, delays: [2000, 5000] });
    const ready = settled(m.ready());
    await m.start('SEB1998');
    expect(ready()).toBe(false);
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

test('deviceLabel: qué es cada dispositivo en Ajustes', () => {
  expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148')).toBe('iPhone');
  expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe('iPad');
  expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe('Mac');
  expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('Android');
  expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36')).toBe('Tablet Android');
  expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows');
  expect(deviceLabel('')).toBe('Navegador');
});
