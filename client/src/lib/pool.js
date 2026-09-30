// Runs fn over items with at most `limit` calls in flight; results keep the input order.
// A rejection doesn't stop the rest: its slot is undefined (fn should catch what it cares about)
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await fn(items[i], i); } catch { results[i] = undefined; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
