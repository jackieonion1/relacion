import { listPhotosBy, madridDayKey } from './photos';
import { unirPorFechaEfectiva, rangoDiaMadrid } from './fotoFecha';

const TZ = 'Europe/Madrid';

// «24 abr 2025»
export function fechaCorta(ms) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(ms);
}

// «Hace un año», «Hace 2 años»
export const haceAnosTexto = (anos) => (anos === 1 ? 'Hace un año' : `Hace ${anos} años`);

// «12–15 mar 2025»,«30 mar – 2 abr 2025» or «28 dic 2024 – 3 ene 2025»; `fin` is the last day, inclusive
export function rangoTexto(inicio, fin) {
  if (fin == null || fin < inicio || fechaCorta(inicio) === fechaCorta(fin)) return fechaCorta(inicio);
  const fmt = (o) => new Intl.DateTimeFormat('es-ES', { ...o, timeZone: TZ });
  const dia = (ms) => fmt({ day: 'numeric' }).format(ms);
  const mes = (ms) => fmt({ month: 'short' }).format(ms);
  const anio = (ms) => fmt({ year: 'numeric' }).format(ms);
  if (anio(inicio) !== anio(fin)) return `${fechaCorta(inicio)} – ${fechaCorta(fin)}`;
  if (mes(inicio) !== mes(fin)) return `${dia(inicio)} ${mes(inicio)} – ${dia(fin)} ${mes(fin)} ${anio(fin)}`;
  return `${dia(inicio)}–${dia(fin)} ${mes(fin)} ${anio(fin)}`;
}

// Photos in [desde, hasta) (ms) by effective date (takenAt ?? createdAt), newest first. Firestore cannot order by
// that, so it runs two single-field queries (no composite index) and joins them: the ones uploaded in range that
// carry no takenAt, and the ones whose takenAt is in range. Same return as listPhotosBy: { items } (+ thumbsDone
// with onThumb); a failed query throws
export async function fotosEnRango(pairId, desde, hasta, { onThumb = null, alResponder = null } = {}) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const [subidas, tomadas] = await Promise.all([
    // A photo with takenAt is settled by the second query, whichever its upload date
    listPhotosBy(pairId, ({ query, where }, col) => query(col, where('createdAt', '>=', d), where('createdAt', '<', h)),
      { onThumb, alResponder, keep: (it) => it.takenAt == null }),
    listPhotosBy(pairId, ({ query, where }, col) => query(col, where('takenAt', '>=', d), where('takenAt', '<', h)),
      { onThumb, alResponder }),
  ]);
  const items = unirPorFechaEfectiva(subidas.items, tomadas.items, desde, hasta);
  if (onThumb) return { items, thumbsDone: Promise.all([subidas.thumbsDone, tomadas.thumbsDone]) };
  return { items };
}

// Photos of any query like listPhotosBy, but only the first `max` get their thumb: the pipeline downloads one blob
// for each photo, and a month or a trip can have hundreds that are not on screen. The rest come with thumbUrl ''
// (fill them with getPhotoThumbUrl when they show). `filtro(item)` drops items before they count. { items } are all
// the accepted ones, in the order of the query (+ thumbsDone with onThumb)
export async function listarConTope(pairId, buildQuery, { onThumb = null, max = Infinity, filtro = null, alResponder = null } = {}) {
  const todas = [];
  const r = await listPhotosBy(pairId, buildQuery, {
    onThumb,
    alResponder,
    keep: (it) => {
      if (filtro && !filtro(it)) return false;
      todas.push(it);
      return todas.length <= max;
    },
  });
  // The kept items are the very objects collected above, so without onThumb their thumbs land on them
  return r.thumbsDone ? { items: todas, thumbsDone: r.thumbsDone } : { items: todas };
}

// fotosEnRango with the thumb limit of listarConTope: all the photos in [desde, hasta) by effective date, oldest
// first, with the thumb of the first `max` of each query. `limite` also cuts the documents each query reads (for a
// cover: a month with hundreds of photos is not read whole; a photo dated by hand may then be missed). `excluir`
// is a Set of ids to leave out
export async function fotosEnRangoTope(pairId, desde, hasta, { onThumb = null, max = Infinity, limite = 0, excluir = null, alResponder = null } = {}) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const sinExcluidas = excluir?.size ? (it) => !excluir.has(it.id) : null;
  const rango = (campo) => ({ query, where, orderBy, limit }, col) => query(
    col, where(campo, '>=', d), where(campo, '<', h), orderBy(campo, 'asc'), ...(limite ? [limit(limite)] : []),
  );
  const [subidas, tomadas] = await Promise.all([
    listarConTope(pairId, rango('createdAt'), { onThumb, max, alResponder, filtro: (it) => it.takenAt == null && (!sinExcluidas || sinExcluidas(it)) }),
    listarConTope(pairId, rango('takenAt'), { onThumb, max, alResponder, filtro: sinExcluidas }),
  ]);
  const items = unirPorFechaEfectiva(subidas.items, tomadas.items, desde, hasta).reverse();
  if (onThumb) return { items, thumbsDone: Promise.all([subidas.thumbsDone, tomadas.thumbsDone]) };
  return { items };
}

// Covers (the thumb of the first photo of a stamp or an album) are worked out once per session and key: a screen
// with many cards would otherwise run its two queries again every time it is opened. A failure is not remembered.
// olvidarPortadas() after changing what an album holds
const portadas = new Map();
export function portadaCacheada(clave, buscar) {
  if (!portadas.has(clave)) {
    portadas.set(clave, buscar().catch((e) => { portadas.delete(clave); throw e; }));
  }
  return portadas.get(clave);
}
export function olvidarPortadas() {
  portadas.clear();
}

// The cover of a range: the thumb URL of its first photo, or '' when it has none (few documents are read: see
// `limite` in fotosEnRangoTope)
export function portadaDeRango(pairId, desde, hasta) {
  return portadaCacheada(`${pairId}:${desde}:${hasta}`, async () => {
    const { items } = await fotosEnRangoTope(pairId, desde, hasta, { max: 1, limite: 4 });
    return items.find((it) => it.thumbUrl)?.thumbUrl || '';
  });
}

// What the «Hace un año» card of Inicio worked out today ({ anos, total, otros, foto }, see HaceUnAnoTarjeta), kept
// for the session (sessionStorage) so the card does not read the photos of those days on every visit to Inicio
const claveTarjeta = (pairId, date) => `hace-un-ano-tarjeta:${pairId}:${madridDayKey(date)}`;
export function tarjetaGuardada(pairId, date = new Date()) {
  try {
    return JSON.parse(sessionStorage.getItem(claveTarjeta(pairId, date)) || 'null');
  } catch {
    return null;
  }
}
export function guardarTarjeta(pairId, tarjeta, date = new Date()) {
  try { sessionStorage.setItem(claveTarjeta(pairId, date), JSON.stringify(tarjeta)); } catch {}
}

// Forgets that today's «Hace un año» was empty (any yearsBack) and the card kept for today: to call when photos are
// dated in bulk, which changes what those days hold
export function olvidarVacioHoy(pairId, date = new Date()) {
  const prefix = `hace-un-ano:${pairId}:${madridDayKey(date)}:`;
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
  } catch {}
  try { sessionStorage.removeItem(claveTarjeta(pairId, date)); } catch {}
}

// «Hace un año»: the photos of this same Madrid day in each of the previous `yearsBack` years, nearest year first:
// [{ anos, items }], only the years that have photos. That day has no photos for most of the year, so an empty
// answer is remembered per device and day to skip the queries (a photo dated afterwards on a past day shows up the
// next day, unless olvidarVacioHoy). A failed query throws
export async function fotosDelDia(pairId, date = new Date(), yearsBack = 3, { onThumb = null, max = null } = {}) {
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
  // An empty answer from the local cache (no connection) says nothing about the server: it is not remembered
  let desdeCache = typeof navigator !== 'undefined' && navigator.onLine === false;
  const alResponder = (fromCache) => { if (fromCache) desdeCache = true; };
  const porAno = await Promise.all(anos.map(async (k) => {
    const { desde, hasta } = rangoDiaMadrid(y - k, m - 1, d);
    // With `max` only the first photos of each query get their thumb, and the items come oldest first
    const r = max == null
      ? await fotosEnRango(pairId, desde, hasta, { onThumb, alResponder })
      : await fotosEnRangoTope(pairId, desde, hasta, { onThumb, max, alResponder });
    return { anos: k, ...r };
  }));
  const conFotos = porAno.filter((a) => a.items.length);
  if (!conFotos.length && !desdeCache) {
    try { localStorage.setItem(flagKey, '0'); } catch {}
  }
  return conFotos; // with onThumb each one also carries thumbsDone
}
