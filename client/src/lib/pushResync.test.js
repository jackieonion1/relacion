import { resyncSubscription, readSubscription, decideNotice, dismissNotice, recordSync, RESYNC_EVERY_MS, NOTICE_SNOOZE_MS } from './pushResync';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const goodSub = () => ({ endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }) });

// pushManager que revienta si alguien intenta crear o borrar la suscripción
function setup({ sub = goodSub(), permission = 'granted', docs = {}, uid = 'uid-1', pairId = 'SEB1998', identity = 'ella', storage = memoryStorage(), now = 1000 } = {}) {
  const pushManager = {
    getSubscription: vi.fn(async () => sub),
    subscribe: vi.fn(() => { throw new Error('subscribe prohibido'); }),
    unsubscribe: vi.fn(() => { throw new Error('unsubscribe prohibido'); }),
  };
  const write = vi.fn(async (pair, id, data) => { docs[id] = { ...(docs[id] || {}), ...data }; });
  const deps = {
    pairId,
    identity,
    env: { supported: () => true, permission: () => permission, getPushManager: async () => pushManager },
    getUid: async () => uid,
    exists: async (pair, id) => id in docs,
    write,
    stamp: () => 'TS',
    storage,
    deviceId: () => 'dev1',
    ua: 'UA',
    now,
  };
  return { deps, pushManager, write, docs, storage, run: (over = {}) => resyncSubscription({ ...deps, ...over }) };
}

describe('resyncSubscription: solo lee', () => {
  test('con suscripción completa escribe el doc y nunca llama a subscribe/unsubscribe', async () => {
    const t = setup();
    expect(await t.run()).toEqual({ status: 'synced' });
    expect(t.pushManager.getSubscription).toHaveBeenCalledTimes(1);
    expect(t.pushManager.subscribe).not.toHaveBeenCalled();
    expect(t.pushManager.unsubscribe).not.toHaveBeenCalled();
    expect(t.write).toHaveBeenCalledWith('SEB1998', 'ella-dev1', expect.objectContaining({
      endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' }, uid: 'uid-1', ua: 'UA', updatedAt: 'TS',
    }));
  });

  test('SW no listo a tiempo: no-sw (no cuenta como sin suscripción) y no escribe', async () => {
    const t = setup();
    const env = { supported: () => true, permission: () => 'granted', getPushManager: async () => null };
    expect(await t.run({ env })).toEqual({ status: 'no-sw' });
    expect(t.write).not.toHaveBeenCalled();
  });

  test('sin suscripción no escribe nada ni crea una', async () => {
    const t = setup({ sub: null });
    expect(await t.run()).toEqual({ status: 'no-sub' });
    expect(t.write).not.toHaveBeenCalled();
    expect(t.pushManager.subscribe).not.toHaveBeenCalled();
  });

  test.each([
    ['sin endpoint', { toJSON: () => ({ keys: { p256dh: 'P', auth: 'A' } }) }],
    ['sin p256dh', { endpoint: 'https://push.example/abc', toJSON: () => ({ keys: { auth: 'A' } }) }],
    ['sin auth', { endpoint: 'https://push.example/abc', toJSON: () => ({ keys: { p256dh: 'P' } }) }],
    ['keys vacías', { endpoint: 'https://push.example/abc', toJSON: () => ({ keys: {} }) }],
    ['sin toJSON ni getKey', { endpoint: 'https://push.example/abc' }],
  ])('suscripción incompleta (%s): no escribe y no la recrea', async (_n, sub) => {
    const t = setup({ sub });
    expect(await t.run()).toEqual({ status: 'incomplete' });
    expect(t.write).not.toHaveBeenCalled();
    expect(t.pushManager.unsubscribe).not.toHaveBeenCalled();
    expect(t.pushManager.subscribe).not.toHaveBeenCalled();
  });

  test('si toJSON no trae keys, las lee con getKey', () => {
    const buf = (n) => new Uint8Array([n, n, n]).buffer;
    const sub = { endpoint: 'https://push.example/abc', toJSON: () => ({}), getKey: (name) => (name === 'p256dh' ? buf(251) : buf(250)) };
    expect(readSubscription(sub)).toEqual({ endpoint: 'https://push.example/abc', keys: { p256dh: '-_v7', auth: '-vr6' } });
  });
});

describe('resyncSubscription: cuándo corre', () => {
  test.each([
    ['sin pareja', { pairId: '' }],
    ['pareja inválida', { pairId: 'a b' }],
    ['sin identidad', { identity: '' }],
    ['identidad rara', { identity: 'otro' }],
  ])('%s: no toca ni el PushManager', async (_n, over) => {
    const t = setup(over);
    expect(await t.run()).toEqual({ status: 'invalid' });
    expect(t.pushManager.getSubscription).not.toHaveBeenCalled();
    expect(t.write).not.toHaveBeenCalled();
  });

  test.each(['default', 'denied'])('permiso %s: no mira la suscripción ni pide permiso', async (permission) => {
    const t = setup({ permission });
    const { status } = await t.run();
    expect(status).toBe(permission === 'denied' ? 'denied' : 'no-permission');
    expect(t.pushManager.getSubscription).not.toHaveBeenCalled();
    expect(t.write).not.toHaveBeenCalled();
  });

  test('sin soporte no hace nada', async () => {
    const t = setup();
    expect(await t.run({ env: { ...t.deps.env, supported: () => false } })).toEqual({ status: 'unsupported' });
    expect(t.write).not.toHaveBeenCalled();
  });

  test('sin sesión no escribe', async () => {
    const t = setup({ uid: null });
    expect(await t.run()).toEqual({ status: 'no-auth' });
    expect(t.write).not.toHaveBeenCalled();
  });

  test('un fallo al leer o escribir no propaga y no toca la suscripción', async () => {
    const t = setup();
    t.pushManager.getSubscription.mockRejectedValue(new Error('boom'));
    expect(await t.run()).toEqual({ status: 'error' });
    const t2 = setup();
    t2.write.mockRejectedValue(new Error('offline'));
    expect(await t2.run()).toEqual({ status: 'error' });
    expect(t2.pushManager.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('resyncSubscription: doc y limitador', () => {
  test('doc existente: merge sin createdAt, con identity y enabled', async () => {
    const t = setup({ docs: { 'ella-dev1': { createdAt: 'ORIGINAL', identity: 'ella', uid: 'viejo', endpoint: 'https://push.example/viejo' } } });
    await t.run();
    const data = t.write.mock.calls[0][2];
    expect(data).not.toHaveProperty('createdAt');
    expect(data).toMatchObject({ identity: 'ella', enabled: true });
    expect(t.docs['ella-dev1']).toMatchObject({ createdAt: 'ORIGINAL', uid: 'uid-1', endpoint: 'https://push.example/abc' });
  });

  test('doc inexistente (p. ej. borrado por un 410): lo recrea con createdAt', async () => {
    const t = setup();
    await t.run();
    expect(t.write.mock.calls[0][2]).toMatchObject({ createdAt: 'TS', identity: 'ella', enabled: true });
  });

  test('misma huella dentro de 24 h: no vuelve a escribir; pasado el plazo, sí', async () => {
    const t = setup();
    await t.run();
    expect((await t.run({ now: 1000 + RESYNC_EVERY_MS - 1 })).status).toBe('skipped');
    expect(t.write).toHaveBeenCalledTimes(1);
    expect((await t.run({ now: 1000 + RESYNC_EVERY_MS })).status).toBe('synced');
    expect(t.write).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['uid', { getUid: async () => 'uid-2' }],
    ['identidad', { identity: 'yo' }],
    ['endpoint', { env: { supported: () => true, permission: () => 'granted', getPushManager: async () => ({ getSubscription: async () => ({ ...goodSub(), endpoint: 'https://push.example/nuevo', toJSON: () => ({ keys: { p256dh: 'P', auth: 'A' } }) }) }) } }],
  ])('si cambia el %s, escribe aunque sea pronto', async (_n, over) => {
    const t = setup();
    await t.run();
    expect((await t.run({ now: 2000, ...over })).status).toBe('synced');
    expect(t.write).toHaveBeenCalledTimes(2);
  });
});

describe('decideNotice', () => {
  test('permiso aún sin pedir: se enseña', () => {
    expect(decideNotice('no-permission', memoryStorage())).toBe(true);
  });

  test('concedido y sin suscripción: solo a la segunda apertura seguida', () => {
    const s = memoryStorage();
    expect(decideNotice('no-sub', s)).toBe(false);
    expect(decideNotice('no-sub', s)).toBe(true);
  });

  test('un null suelto entre aperturas con suscripción no cuenta', () => {
    const s = memoryStorage();
    expect(decideNotice('no-sub', s)).toBe(false);
    expect(decideNotice('synced', s)).toBe(false);
    expect(decideNotice('no-sub', s)).toBe(false);
  });

  test.each(['synced', 'skipped', 'incomplete', 'denied', 'unsupported', 'invalid', 'error', 'no-auth', 'no-sw'])('%s: nunca se enseña', (status) => {
    const s = memoryStorage();
    for (let i = 0; i < 3; i++) expect(decideNotice(status, s)).toBe(false);
  });

  test('un error entre dos null no reinicia la cuenta', () => {
    const s = memoryStorage();
    decideNotice('no-sub', s);
    decideNotice('error', s);
    expect(decideNotice('no-sub', s)).toBe(true);
  });

  test('SW lento en dos aperturas seguidas: nunca enseña «Activar»', () => {
    const s = memoryStorage();
    for (let i = 0; i < 3; i++) expect(decideNotice('no-sw', s)).toBe(false);
  });

  test('«Luego» lo silencia una semana', () => {
    const s = memoryStorage();
    dismissNotice(s, 1000);
    expect(decideNotice('no-permission', s, 1000 + NOTICE_SNOOZE_MS - 1)).toBe(false);
    expect(decideNotice('no-permission', s, 1000 + NOTICE_SNOOZE_MS)).toBe(true);
  });

  test('recordSync y el resync comparten huella (subscribeToPush evita un resync redundante)', async () => {
    const t = setup();
    recordSync(t.storage, { pairId: 'SEB1998', identity: 'ella', uid: 'uid-1', endpoint: 'https://push.example/abc' }, 1000);
    expect((await t.run({ now: 2000 })).status).toBe('skipped');
  });
});
