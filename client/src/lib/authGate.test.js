import { createSignIn, createWhenAuthed } from './authGate';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('createSignIn', () => {
  test('con un login colgado, ni el temporizador ni el evento online lanzan otro', async () => {
    const first = deferred();
    const signIn = jest.fn(() => first.promise);
    const run = createSignIn({ signIn, hasUser: () => false });
    run();
    run(); // 'online' mientras la primera sigue en vuelo
    jest.advanceTimersByTime(60000);
    await flush();
    run();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  test('tras un rechazo reintenta con espera creciente, siempre de uno en uno', async () => {
    const signIn = jest.fn(() => Promise.reject(new Error('network')));
    const run = createSignIn({ signIn, hasUser: () => false, delays: [2000, 5000] });
    run();
    await flush();
    expect(signIn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1999);
    expect(signIn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(signIn).toHaveBeenCalledTimes(2);
    await flush();
    jest.advanceTimersByTime(4999);
    expect(signIn).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(signIn).toHaveBeenCalledTimes(3);
  });

  test('no reintenta si ya hay usuario', async () => {
    let user = null;
    const signIn = jest.fn(() => Promise.reject(new Error('network')));
    const run = createSignIn({ signIn, hasUser: () => !!user });
    run();
    user = { uid: 'u1' }; // llegó la sesión persistida mientras tanto
    await flush();
    jest.advanceTimersByTime(60000);
    run();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  test('sin red no programa reintentos; el siguiente evento online sí intenta', async () => {
    let online = false;
    const signIn = jest.fn(() => Promise.reject(new Error('offline')));
    const run = createSignIn({ signIn, hasUser: () => false, isOnline: () => online });
    run();
    await flush();
    jest.advanceTimersByTime(60000);
    expect(signIn).toHaveBeenCalledTimes(1);
    online = true;
    run();
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  test('un online con un reintento programado lo sustituye (no quedan dos)', async () => {
    const signIn = jest.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('network')))
      .mockImplementation(() => new Promise(() => {}));
    const run = createSignIn({ signIn, hasUser: () => false, delays: [2000] });
    run();
    await flush();
    run(); // online antes de que venza el temporizador
    jest.advanceTimersByTime(60000);
    expect(signIn).toHaveBeenCalledTimes(2);
  });
});

describe('createWhenAuthed', () => {
  test('resuelve con el usuario en cuanto hay sesión', async () => {
    const ready = deferred();
    const whenAuthed = createWhenAuthed(ready.promise, () => ({ uid: 'u1' }));
    const p = whenAuthed(15000);
    ready.resolve({ uid: 'u1' });
    await expect(p).resolves.toEqual({ uid: 'u1' });
  });

  test('sin sesión resuelve null al vencer el tope, no se queda colgado', async () => {
    const whenAuthed = createWhenAuthed(new Promise(() => {}), () => null);
    const p = whenAuthed(15000);
    jest.advanceTimersByTime(15000);
    await expect(p).resolves.toBeNull();
  });

  test('con Infinity espera sin tope hasta que llega la sesión', async () => {
    const ready = deferred();
    let user = null;
    const whenAuthed = createWhenAuthed(ready.promise, () => user);
    let got = 'pending';
    whenAuthed(Infinity).then((u) => { got = u; });
    jest.advanceTimersByTime(10 * 60 * 1000);
    await flush();
    expect(got).toBe('pending');
    user = { uid: 'u1' };
    ready.resolve(user);
    await flush();
    expect(got).toEqual({ uid: 'u1' });
  });

  test('sin Firebase configurado resuelve null al momento', async () => {
    const whenAuthed = createWhenAuthed(undefined, () => undefined);
    await expect(whenAuthed()).resolves.toBeNull();
  });
});
