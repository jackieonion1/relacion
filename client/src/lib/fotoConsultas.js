// The Gallery's other views (3.1): favourites and the month list for «Ir a un mes». All through listPhotosBy, so
// they share the grid's thumb pipeline; one field per query and the order in the client, so no composite index
import { listPhotosBy } from './photos';
import { fechaEfectiva } from './fotoFecha';

const porFechaEfectiva = (a, b) => fechaEfectiva(b) - fechaEfectiva(a) || (a.id < b.id ? -1 : 1);

// The favourites of either of the two, newest first by effective date. No orderBy (array-contains-any plus an order
// wants a composite index) and no limit either: without an order a limit would keep the first ids, the oldest ones
// (F3). One read per favourite
export async function listFavoritas(pairId, { onThumb = null } = {}) {
  const r = await listPhotosBy(pairId, ({ query, where }, col) => query(col, where('favBy', 'array-contains-any', ['yo', 'ella'])), { onThumb });
  return { ...r, items: [...r.items].sort(porFechaEfectiva) };
}

// The earliest effective date of the pair's photos, in ms (null with none): where «Ir a un mes» starts. A dated
// photo can be older than the first upload, so it asks for the oldest of each date, 1 read each. Only the date is
// wanted: `keep` takes it and drops the item, so no thumb is fetched
export async function primeraFecha(pairId) {
  let min = null;
  const toma = (ms) => { if (ms != null && (min == null || ms < min)) min = ms; return false; };
  await Promise.all([
    listPhotosBy(pairId, ({ query, orderBy, limit }, col) => query(col, orderBy('createdAt', 'asc'), limit(1)), { keep: (it) => toma(it.createdAt) }),
    // orderBy leaves out the docs without the field: this is the oldest photo dated by hand
    listPhotosBy(pairId, ({ query, orderBy, limit }, col) => query(col, orderBy('takenAt', 'asc'), limit(1)), { keep: (it) => toma(it.takenAt) }),
  ]);
  return min;
}

// The months from the one of `desdeMs` to the one of `hastaMs` (phone time), newest first, by year:
// [{ y, meses: [11, 10, …] }] (months 0-based, like Date)
export function mesesEntre(desdeMs, hastaMs) {
  const a = new Date(desdeMs);
  const b = new Date(hastaMs);
  const out = [];
  for (let y = b.getFullYear(); y >= a.getFullYear(); y -= 1) {
    const meses = [];
    const hasta = y === b.getFullYear() ? b.getMonth() : 11;
    const desde = y === a.getFullYear() ? a.getMonth() : 0;
    for (let m = hasta; m >= desde; m -= 1) meses.push(m);
    out.push({ y, meses });
  }
  return out;
}
