import { listPhotosBy, madridDayKey } from './photos';
import { unirPorFechaEfectiva, rangoDiaMadrid } from './fotoFecha';

// Photos in [desde, hasta) (ms) by effective date (takenAt ?? createdAt), newest first. Firestore cannot order by
// that, so it runs two single-field queries (no composite index) and joins them: the ones uploaded in range that
// carry no takenAt, and the ones whose takenAt is in range. Same return as listPhotosBy: { items } (+ thumbsDone
// with onThumb); a failed query throws
export async function fotosEnRango(pairId, desde, hasta, { onThumb = null } = {}) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const [subidas, tomadas] = await Promise.all([
    // A photo with takenAt is settled by the second query, whichever its upload date
    listPhotosBy(pairId, ({ query, where }, col) => query(col, where('createdAt', '>=', d), where('createdAt', '<', h)),
      { onThumb, keep: (it) => it.takenAt == null }),
    listPhotosBy(pairId, ({ query, where }, col) => query(col, where('takenAt', '>=', d), where('takenAt', '<', h)),
      { onThumb }),
  ]);
  const items = unirPorFechaEfectiva(subidas.items, tomadas.items, desde, hasta);
  if (onThumb) return { items, thumbsDone: Promise.all([subidas.thumbsDone, tomadas.thumbsDone]) };
  return { items };
}

// Forgets that today's «Hace un año» was empty (any yearsBack): to call when photos are dated in bulk, which can
// fill it
export function olvidarVacioHoy(pairId, date = new Date()) {
  const prefix = `hace-un-ano:${pairId}:${madridDayKey(date)}:`;
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
  } catch {}
}

// «Hace un año»: the photos of this same Madrid day in each of the previous `yearsBack` years, nearest year first:
// [{ anos, items }], only the years that have photos. That day has no photos for most of the year, so an empty
// answer is remembered per device and day to skip the queries (a photo dated afterwards on a past day shows up the
// next day, unless olvidarVacioHoy). A failed query throws
export async function fotosDelDia(pairId, date = new Date(), yearsBack = 3, { onThumb = null } = {}) {
  const dayKey = madridDayKey(date);
  const flagKey = `hace-un-ano:${pairId}:${dayKey}:${yearsBack}`;
  try {
    if (localStorage.getItem(flagKey) === '0') return [];
  } catch {}
  const [y, m, d] = dayKey.split('-').map(Number);
  const anos = [];
  for (let k = 1; k <= yearsBack; k += 1) {
    // 29 February has no day in the years that are not leap
    if (new Date(Date.UTC(y - k, m - 1, d)).getUTCMonth() === m - 1) anos.push(k);
  }
  const porAno = await Promise.all(anos.map(async (k) => {
    const { desde, hasta } = rangoDiaMadrid(y - k, m - 1, d);
    const r = await fotosEnRango(pairId, desde, hasta, { onThumb });
    return { anos: k, ...r };
  }));
  const conFotos = porAno.filter((a) => a.items.length);
  if (!conFotos.length) {
    try { localStorage.setItem(flagKey, '0'); } catch {}
  }
  return conFotos; // with onThumb each one also carries thumbsDone
}
