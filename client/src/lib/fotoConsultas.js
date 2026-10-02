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
