import { ANNIVERSARY, timeBetween } from './together';
import { db, whenAuthed } from './firebase';
import { madridDayKey, photoItem } from './photos';
import { fechaEfectiva, rangoDiaMadrid, unirPorFechaEfectiva } from './fotoFecha';
import { eventTypeOf } from './eventTypes';

// «Nuestro año» (3.1): the year between two anniversaries as a story, from what the app can really count.
// Every phone works it out by itself from the server and keeps it in localStorage: there is no shared doc, so a
// phone that is offline can never freeze partial numbers for the other one (adversario N1)

let _fb;
async function fb() {
  if (!_fb) {
    const mod = await import('firebase/firestore');
    _fb = mod;
  }
  return _fb;
}

const START_YEAR = ANNIVERSARY.getFullYear();
const ANN_MES = ANNIVERSARY.getMonth(); // 0-based, like Date
const ANN_DIA = ANNIVERSARY.getDate();
// The app was born in August 2025, so the first anniversary has nothing to tell: the first story is the 2nd
const PRIMER_ANIO = START_YEAR + 2;
// The card on Inicio shows from 7 days before the anniversary day to 14 days after it
const DIAS_ANTES = 7;
const DIAS_DESPUES = 14;
const DAY = 86400000;
// Bump it when the shape of the stats changes: older caches are then worked out again
const VERSION = 1;

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad2 = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const diaMadrid = (ms) => madridDayKey(new Date(ms));

// Days from one 'YYYY-MM-DD' key to another (UTC arithmetic, so a clock change cannot add or drop an hour)
function diasEntre(desde, hasta) {
  const utc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(hasta) - utc(desde)) / DAY);
}

// The anniversary that applies at `now`: the latest whose window has opened (never before the 2nd).
// desde/hasta (ms) are the year it sums up, [24 Nov of the year before, 24 Nov of that one), in Madrid time;
// abre/cierra are the window of the card on Inicio
export function ventanaAniversario(now = new Date()) {
  const y = Number(madridDayKey(now).slice(0, 4));
  const abre = (anio) => rangoDiaMadrid(anio, ANN_MES, ANN_DIA - DIAS_ANTES).desde;
  const anio = Math.max(PRIMER_ANIO, now.getTime() < abre(y) ? y - 1 : y);
  return {
    anio,
    n: anio - START_YEAR,
    desde: rangoDiaMadrid(anio - 1, ANN_MES, ANN_DIA).desde,
    hasta: rangoDiaMadrid(anio, ANN_MES, ANN_DIA).desde,
    abre: abre(anio),
    cierra: rangoDiaMadrid(anio, ANN_MES, ANN_DIA + DIAS_DESPUES + 1).desde,
  };
}

// Is the card of Inicio up? (7 days before the anniversary day until 14 days after it)
export function enVentana(now = new Date()) {
  const v = ventanaAniversario(now);
  return now.getTime() >= v.abre && now.getTime() < v.cierra;
}

// Has the first window ever opened? Before it, the page is only reachable with ?ensayo=1
export function yaAbierto(now = new Date()) {
  return now.getTime() >= ventanaAniversario(now).abre;
}

const ORDINALES = { 2: 'segundo', 3: 'tercer', 4: 'cuarto', 5: 'quinto', 6: 'sexto', 7: 'séptimo', 8: 'octavo', 9: 'noveno', 10: 'décimo' };
export const ordinal = (n) => ORDINALES[n] || `${n}.º`;

// ---- Reading (always from the server: a cached answer would be a partial one) ----

async function leer(f, pairId, col, campo, desde, hasta) {
  const q = f.query(f.collection(db, 'pairs', pairId, col), f.where(campo, '>=', new Date(desde)), f.where(campo, '<', new Date(hasta)));
  return (await f.getDocsFromServer(q)).docs;
}

const ms = (t) => t?.toMillis?.() ?? null;

// The fields the stats need of an event doc
export function eventoPlano(data) {
  return {
    start: ms(data.start), end: ms(data.end), seeEachOther: !!data.seeEachOther,
    location: String(data.location || '').trim(), title: String(data.title || '').trim(),
    eventType: data.eventType || 'conjunto',
  };
}

// Reads the year of the pair. Every query filters on one field (no composite index) and any failure throws: with no
// connection getDocsFromServer rejects instead of answering from the cache. Photos come with no thumbs: the stats
// only need their dates, authors and reactions
export async function leerAnio(pairId, { desde, hasta }) {
  const f = await fb();
  if (!(db && f && pairId)) throw Object.assign(new Error('no-firebase'), { code: 'no-firebase' });
  if (!(await whenAuthed())) throw Object.assign(new Error('no-auth'), { code: 'no-auth' });
  const [porSubida, porFecha, eventos, notas, canciones] = await Promise.all([
    leer(f, pairId, 'photos', 'createdAt', desde, hasta),
    leer(f, pairId, 'photos', 'takenAt', desde, hasta),
    leer(f, pairId, 'events', 'start', desde, hasta),
    leer(f, pairId, 'notes', 'createdAt', desde, hasta),
    leer(f, pairId, 'music', 'createdAt', desde, hasta),
  ]);
  return {
    fotos: unirPorFechaEfectiva(porSubida.map(photoItem), porFecha.map(photoItem), desde, hasta),
    eventos: eventos.map((d) => eventoPlano(d.data())),
    notas: notas.map((d) => ({ identity: d.data().identity || '' })),
    canciones: canciones.map((d) => ({ identity: d.data().identity || '' })),
  };
}

// ---- Counting (pure) ----

// { total, yo, ella } of a list with an identity: the ones with none (the oldest photos) only count in the total
function porPersona(lista) {
  return {
    total: lista.length,
    yo: lista.filter((x) => x.identity === 'yo').length,
    ella: lista.filter((x) => x.identity === 'ella').length,
  };
}

// The 12 months of the year, from the one it starts in: [{ anio, mes (0-based), n }] by effective date, Madrid time
function fotosPorMes(fotos, desde) {
  let [y, m] = diaMadrid(desde).split('-').map(Number);
  const meses = [];
  for (let i = 0; i < 12; i += 1) {
    meses.push({ anio: y, mes: m - 1, n: 0 });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  for (const foto of fotos) {
    const [fy, fm] = diaMadrid(fechaEfectiva(foto)).split('-').map(Number);
    const hueco = meses.find((x) => x.anio === fy && x.mes === fm - 1);
    if (hueco) hueco.n += 1;
  }
  return meses;
}

// The photo with the most hearts: one for each reaction and one for each favourite mark. The earliest wins a tie;
// none when nobody reacted to anything
function fotoFavorita(fotos) {
  let mejor = null;
  let puntos = 0;
  for (const foto of fotos) {
    const reacciones = Object.fromEntries(Object.entries(foto.reactions || {}).filter(([, e]) => e));
    const p = Object.keys(reacciones).length + (foto.favBy || []).length;
    const antes = mejor && fechaEfectiva(foto) < fechaEfectiva(mejor.foto);
    if (p > puntos || (p === puntos && p > 0 && antes)) { mejor = { foto, reacciones }; puntos = p; }
  }
  return mejor && { fotoId: mejor.foto.id, reacciones: mejor.reacciones, favBy: mejor.foto.favBy || [] };
}

// Days (local, as the calendar draws them) of an event inside [desdeKey, hastaKey)
function diasDelEvento(ev, desdeKey, hastaKey) {
  const dias = [];
  const dia = new Date(ev.start);
  dia.setHours(0, 0, 0, 0);
  const fin = new Date(ev.end ?? ev.start);
  for (let i = 0; dia <= fin && i < 400; i += 1) {
    const k = localKey(dia);
    if (k >= desdeKey && k < hastaKey) dias.push(k);
    dia.setDate(dia.getDate() + 1);
  }
  return dias;
}

// The numbers of the year. `datos` is what leerAnio returns, `v` the window of ventanaAniversario. An event is
// the year's when it starts in it (one that began before 24 Nov and runs on is not counted)
export function analizar({ fotos = [], eventos = [], notas = [], canciones = [] }, v) {
  const desdeKey = localKey(new Date(v.desde));
  const hastaKey = localKey(new Date(v.hasta));

  const planes = { total: eventos.length, conjunto: 0, novio: 0, novia: 0 };
  for (const ev of eventos) planes[eventTypeOf(ev.eventType).value] += 1;

  const vistas = eventos.filter((ev) => ev.seeEachOther && ev.start != null);
  const dias = new Set();
  let masLargo = { dias: 0, titulo: '' };
  const sitios = new Map();
  for (const ev of vistas) {
    const suyos = diasDelEvento(ev, desdeKey, hastaKey);
    suyos.forEach((k) => dias.add(k));
    if (suyos.length > masLargo.dias) masLargo = { dias: suyos.length, titulo: ev.title };
    const clave = ev.location.toLowerCase();
    if (clave) sitios.set(clave, { lugar: sitios.get(clave)?.lugar || ev.location, veces: (sitios.get(clave)?.veces || 0) + 1 });
  }
  let sitio = null;
  for (const s of sitios.values()) if (!sitio || s.veces > sitio.veces) sitio = s;

  const meses = fotosPorMes(fotos, v.desde);
  const mejor = meses.reduce((a, b) => (b.n > a.n ? b : a), meses[0]);

  return {
    v: VERSION,
    anio: v.anio, n: v.n, desde: v.desde, hasta: v.hasta,
    fotos: { ...porPersona(fotos), meses, mejorMes: mejor.n > 0 ? mejor : null, favorita: fotoFavorita(fotos) },
    encuentros: { n: vistas.length, dias: dias.size, masLargo, sitio },
    planes,
    notas: porPersona(notas),
    canciones: porPersona(canciones),
  };
}

// The stories of the year, in order. Every one with nothing to say (a count of 0, no photo reacted to…) is left
// out, so what is shown is only what the app could really count. Each item is { id, ...its data }; the words are the
// page's. `now` only moves the days together when the year is not over yet
export function construirHistorias(stats, now = new Date()) {
  const { fotos, encuentros, planes, notas, canciones } = stats;
  const hoy = diaMadrid(Math.min(now.getTime(), stats.hasta));
  const [y, m, d] = hoy.split('-').map(Number);
  const juntos = timeBetween(ANNIVERSARY, new Date(y, m - 1, d));
  const historias = [
    { id: 'portada', n: stats.n, desde: stats.desde, hasta: stats.hasta },
    { id: 'dias', dias: diasEntre(localKey(ANNIVERSARY), hoy), mesiversarios: juntos.years * 12 + juntos.months },
  ];
  const si = (cond, historia) => { if (cond) historias.push(historia); };
  si(encuentros.n > 0, { id: 'encuentros', n: encuentros.n, dias: encuentros.dias });
  si(encuentros.masLargo.dias >= 2, { id: 'largo', ...encuentros.masLargo });
  si(encuentros.sitio?.veces >= 2, { id: 'sitio', ...encuentros.sitio });
  si(planes.total > 0, { id: 'planes', ...planes });
  si(fotos.total > 0, { id: 'fotos', total: fotos.total, yo: fotos.yo, ella: fotos.ella });
  si(fotos.mejorMes, { id: 'meses', meses: fotos.meses, mejor: fotos.mejorMes });
  si(fotos.favorita, { id: 'foto', ...fotos.favorita });
  si(notas.total > 0, { id: 'notas', total: notas.total, yo: notas.yo, ella: notas.ella });
  si(canciones.total > 0, { id: 'canciones', total: canciones.total, yo: canciones.yo, ella: canciones.ella });
  historias.push({ id: 'cierre' });
  return historias;
}

// ---- Loading: once per phone and year ----

const cacheKey = (pairId, anio) => `nuestro-ano:${pairId}:${anio}`;

function leerCache(pairId, anio) {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(pairId, anio)));
    return c && c.stats?.v === VERSION && Number.isFinite(c.computedAt) ? c : null;
  } catch {
    return null;
  }
}

// Worked out on or after the anniversary day, the year is complete and the cache stays for good. Before it, the
// year is still running: it lasts that day only (the window opens a week earlier, and a number from the 18th would
// be wrong on the 24th)
function cacheVale(c, v, now) {
  return c.computedAt >= v.hasta || diaMadrid(c.computedAt) === diaMadrid(now.getTime());
}

// What ensayo (and a phone with no localStorage) keeps for the session: the screen is opened more than once
const enMemoria = new Map();
const enCurso = new Map();

// The stats of the year that applies. `ensayo` ignores the cache and writes nothing (it is the rehearsal outside
// the dates). Offline, an out-of-date cache beats an error. `calcular` is injectable for tests
export function cargarNuestroAno(pairId, { ensayo = false, now = new Date(), calcular = null } = {}) {
  const v = ventanaAniversario(now);
  const clave = `${ensayo ? 'ensayo:' : ''}${cacheKey(pairId, v.anio)}`;
  const guardada = ensayo ? null : leerCache(pairId, v.anio);
  if (guardada && cacheVale(guardada, v, now)) return Promise.resolve(guardada.stats);
  const hecha = enMemoria.get(clave);
  if (hecha && cacheVale({ computedAt: hecha.computedAt }, v, now)) return Promise.resolve(hecha.stats);
  if (enCurso.has(clave)) return enCurso.get(clave);

  const promesa = (async () => {
    try {
      const stats = analizar(await (calcular || leerAnio)(pairId, v), v);
      const computedAt = now.getTime();
      enMemoria.set(clave, { stats, computedAt });
      if (!ensayo) {
        try { localStorage.setItem(cacheKey(pairId, v.anio), JSON.stringify({ computedAt, stats })); } catch {}
      }
      return stats;
    } catch (e) {
      if (guardada) return guardada.stats;
      throw e;
    }
  })().finally(() => enCurso.delete(clave));
  enCurso.set(clave, promesa);
  return promesa;
}

// For tests: forget what the session kept
export function olvidarNuestroAno() {
  enMemoria.clear();
  enCurso.clear();
}
