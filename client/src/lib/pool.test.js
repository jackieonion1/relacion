import { mapLimit } from './pool';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('mapLimit', () => {
  test('nunca hay más de `limit` llamadas en vuelo', async () => {
    const pending = Array.from({ length: 10 }, deferred);
    let inFlight = 0; let max = 0;
    const done = mapLimit(pending, 3, async (d) => {
      inFlight += 1; max = Math.max(max, inFlight);
      try { return await d.promise; } finally { inFlight -= 1; }
    });
    await flush();
    expect(inFlight).toBe(3);
    // se liberan en desorden
    for (const i of [2, 0, 1, 5, 3, 4, 9, 8, 7, 6]) { pending[i].resolve(i); await flush(); }
    await done;
    expect(max).toBe(3);
  });

  test('los resultados salen en el orden de entrada aunque terminen en otro', async () => {
    const delays = [30, 10, 20, 0];
    const out = await mapLimit(delays, 2, (ms, i) => new Promise((r) => setTimeout(() => r(`r${i}`), ms)));
    expect(out).toEqual(['r0', 'r1', 'r2', 'r3']);
  });

  test('un fallo no aborta el resto: su hueco queda undefined', async () => {
    const out = await mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('x'); return n * 10; });
    expect(out).toEqual([10, undefined, 30]);
  });

  test('lista vacía resuelve al momento', async () => {
    await expect(mapLimit([], 6, vi.fn())).resolves.toEqual([]);
  });
});
