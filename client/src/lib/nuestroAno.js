import { ANNIVERSARY, timeBetween } from './together';
import { db, whenAuthed } from './firebase';
import { madridDayKey, photoItem } from './photos';
import { fechaEfectiva, rangoDiaMadrid, unirPorFechaEfectiva } from './fotoFecha';
import { eventTypeOf } from './eventTypes';
import { rangoDeAlbum } from './albumes';

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
// Bump it when the shape of the stats changes: older caches are then worked out again (2: the photos of the stories)
const VERSION = 2;
// A burst: a Madrid day (by upload) with this many photos and no capture date, the mark of an old camera roll
// uploaded in one go. Its photos count in every number, but none is picked to show a month, the first or the last
// photo, the longest meeting, nor counts for the hour (estimated, to be tuned with real data)
const RAFAGA = 25;
// Below these the story is left out: a short wait, a photo barely commented, a few photos to tell an hour by
const ESPERA_MIN = 14;
const COMENTADA_MIN = 3;
const HORA_MIN = 10;
// The collage: up to 24 photos, at most 3 of a month (so the month of a burst does not fill it), never below 8
const COLLAGE_MAX = 24;
const COLLAGE_MIN = 8;
const COLLAGE_POR_MES = 3;
// The chapters of photos between the stories: the 13 months of the year (see fotosPorMes), by slot
const CAPITULOS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11, 12]];

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad2 = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const diaMadrid = (ms) => madridDayKey(new Date(ms));
const horaFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' });
const horaMadrid = (ms) => Number(horaFmt.format(new Date(ms))) % 24;

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
    eventType: data.eventType || 'conjunto', createdAt: ms(data.createdAt),
  };
}

// A photo doc as the stats need it: the item of lib/photos plus the thumb URL of its doc (`thumbDoc`, as
// listPhotosBy keeps it), so the page asks for the chosen thumbs with thumbDeItem and reads no doc again
const fotoDeDoc = (d) => ({ ...photoItem(d), thumbDoc: d.data()?.thumbUrl || '' });

// Reads the year of the pair. Every query filters on one field (no composite index) and any failure throws: with no
// connection getDocsFromServer rejects instead of answering from the cache. Photos come with no thumbs: the stats
// only need their dates, authors and reactions, and the page fetches the few it shows. Of the capsules only the
// envelope is read (when it opens), never their title nor what is inside
export async function leerAnio(pairId, { desde, hasta }) {
  const f = await fb();
  if (!(db && f && pairId)) throw Object.assign(new Error('no-firebase'), { code: 'no-firebase' });
  if (!(await whenAuthed())) throw Object.assign(new Error('no-auth'), { code: 'no-auth' });
  const [porSubida, porFecha, eventos, notas, canciones, capsulas] = await Promise.all([
    leer(f, pairId, 'photos', 'createdAt', desde, hasta),
    leer(f, pairId, 'photos', 'takenAt', desde, hasta),
    leer(f, pairId, 'events', 'start', desde, hasta),
    leer(f, pairId, 'notes', 'createdAt', desde, hasta),
    leer(f, pairId, 'music', 'createdAt', desde, hasta),
    leer(f, pairId, 'capsules', 'createdAt', desde, hasta),
  ]);
  return {
    fotos: unirPorFechaEfectiva(porSubida.map(fotoDeDoc), porFecha.map(fotoDeDoc), desde, hasta),
    eventos: eventos.map((d) => eventoPlano(d.data())),
    notas: notas.map((d) => ({ identity: d.data().identity || '' })),
    canciones: canciones.map((d) => {
      const c = d.data();
      return { identity: c.identity || '', name: String(c.name || '').trim(), duration: Number(c.duration) || 0, createdAt: ms(c.createdAt) };
    }),
    capsulas: capsulas.map((d) => ({ openAt: ms(d.data().openAt) })),
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

// The months the year touches, from the one it starts in to the one it ends in: [{ anio, mes (0-based), n }] by
// effective date, Madrid time. From 24 Nov to 24 Nov that is 13: the first November holds its last week and the
// last one its first 23 days
function fotosPorMes(fotos, desde, hasta) {
  let [y, m] = diaMadrid(desde).split('-').map(Number);
  const [yFin, mFin] = diaMadrid(hasta - 1).split('-').map(Number);
  const meses = [];
  while (y < yFin || (y === yFin && m <= mFin)) {
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
  return mejor && { fotoId: mejor.foto.id, reacciones: mejor.reacciones, favBy: mejor.foto.favBy || [], foto: ficha(mejor.foto) };
}

// What a story keeps of a photo it shows: its id, the URL of its doc for thumbDeItem and its effective date
function ficha(foto) {
  return { id: foto.id, thumbDoc: foto.thumbDoc || '', fecha: fechaEfectiva(foto) };
}

// A stable draw: the same text gives the same number on every phone (FNV-1a, finished with murmur3's fmix32 as in
// lib/photos, so ids that differ only in their last character still land far apart)
function azar(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// The Madrid days (by upload) that were a burst: RAFAGA photos or more with no capture date
function diasDeRafaga(fotos) {
  const porDia = new Map();
  for (const f of fotos) {
    if (f.takenAt != null) continue;
    const k = diaMadrid(f.createdAt);
    porDia.set(k, (porDia.get(k) || 0) + 1);
  }
  return new Set([...porDia].filter(([, n]) => n >= RAFAGA).map(([k]) => k));
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

// The numbers of the year. `datos` is what leerAnio returns, `v` the window of ventanaAniversario and `pairId`
// seeds the draw of the photos. An event is the year's when it starts in it (one that began before 24 Nov and runs
// on is not counted)
export function analizar({ fotos = [], eventos = [], notas = [], canciones = [], capsulas = [] }, v, pairId = '') {
  const desdeKey = localKey(new Date(v.desde));
  const hastaKey = localKey(new Date(v.hasta));

  const planes = { total: eventos.length, conjunto: 0, novio: 0, novia: 0 };
  for (const ev of eventos) planes[eventTypeOf(ev.eventType).value] += 1;

  const vistas = eventos.filter((ev) => ev.seeEachOther && ev.start != null);
  const dias = new Set();
  let masLargo = { dias: 0, titulo: '' };
  let largo = null;
  let espera = null;
  const sitios = new Map();
  for (const ev of vistas) {
    const suyos = diasDelEvento(ev, desdeKey, hastaKey);
    suyos.forEach((k) => dias.add(k));
    if (suyos.length > masLargo.dias) { masLargo = { dias: suyos.length, titulo: ev.title }; largo = ev; }
    const clave = ev.location.toLowerCase();
    if (clave) sitios.set(clave, { lugar: sitios.get(clave)?.lugar || ev.location, veces: (sitios.get(clave)?.veces || 0) + 1 });
    // The longest countdown: from the day it was written down to the day it began
    const antelacion = ev.createdAt != null && ev.createdAt < ev.start ? diasEntre(diaMadrid(ev.createdAt), diaMadrid(ev.start)) : 0;
    if (antelacion >= ESPERA_MIN && antelacion > (espera?.dias || 0)) espera = { dias: antelacion, titulo: ev.title, desde: ev.createdAt, hasta: ev.start };
  }
  // The most repeated place (the first one met wins a tie) and the others, most repeated first
  const lugares = [...sitios.values()].sort((a, b) => b.veces - a.veces);
  const sitio = lugares[0] || null;

  const meses = fotosPorMes(fotos, v.desde, v.hasta);
  const mejor = meses.reduce((a, b) => (b.n > a.n ? b : a), meses[0]);
  const indice = new Map(meses.map((x, k) => [`${x.anio}-${x.mes}`, k]));
  const huecoDe = (f) => { const [y, m] = diaMadrid(fechaEfectiva(f)).split('-').map(Number); return indice.get(`${y}-${m - 1}`); };

  // Which photos the stories show, the same on both phones: the ones with hearts first (reactions, ♥ and comments),
  // then the dated ones, then the ones out of a burst, and a draw fixed by pair, year and photo for the rest. A photo
  // of a burst is never a cover, and none is shown twice but in the collage
  const rafagas = diasDeRafaga(fotos);
  const enRafaga = (f) => f.takenAt == null && rafagas.has(diaMadrid(f.createdAt));
  const corazones = (f) => Object.values(f.reactions || {}).filter(Boolean).length + (f.favBy || []).length + (f.commentCount || 0);
  const suerte = new Map(fotos.map((f) => [f.id, azar(`${pairId}:${v.anio}:${f.id}`)]));
  const antes = (a, b) => corazones(b) - corazones(a) || (b.takenAt != null) - (a.takenAt != null)
    || enRafaga(a) - enRafaga(b) || suerte.get(a.id) - suerte.get(b.id);
  const elegibles = fotos.filter((f) => !enRafaga(f)).sort(antes);
  const usadas = new Set();
  // The first of `lista` (best first) not shown yet; with `repetir`, a shown one rather than none (a month or a
  // meeting whose only photo is already elsewhere still shows it, not an empty stamp)
  const elegir = (lista, repetir = false) => {
    const f = lista.find((x) => !usadas.has(x.id)) || (repetir ? lista[0] : null);
    if (!f) return null;
    usadas.add(f.id);
    return ficha(f);
  };

  const favorita = fotoFavorita(fotos);
  if (favorita) usadas.add(favorita.fotoId);
  // With nobody's hearts yet, the most commented one may take its place
  let comentada = null;
  const masComentada = favorita ? null : [...fotos].sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0) || antes(a, b))[0];
  if (masComentada?.commentCount >= COMENTADA_MIN) {
    usadas.add(masComentada.id);
    comentada = { fotoId: masComentada.id, comentarios: masComentada.commentCount, foto: ficha(masComentada) };
  }

  const porFecha = elegibles.filter((f) => !usadas.has(f.id)).sort((a, b) => fechaEfectiva(a) - fechaEfectiva(b) || (a.id < b.id ? -1 : 1));
  const extremos = porFecha.length >= 2 ? { primera: elegir([porFecha[0]]), ultima: elegir([porFecha.at(-1)]) } : null;

  let fotoLargo = null;
  if (largo && masLargo.dias >= 2) {
    const r = rangoDeAlbum(largo);
    fotoLargo = elegir(elegibles.filter((f) => fechaEfectiva(f) >= r.desde && fechaEfectiva(f) < r.hasta), true);
  }

  const delMes = meses.map(() => []);
  for (const f of elegibles) delMes[huecoDe(f)]?.push(f);
  const portadas = delMes.map((lista) => elegir(lista, true));

  // The collage: the best ones, 3 a month at most, in a whole number of rows of 4, by date
  const porMes = new Map();
  const juntas = [];
  for (const f of [...fotos].sort(antes)) {
    const k = huecoDe(f);
    if ((porMes.get(k) || 0) >= COLLAGE_POR_MES) continue;
    porMes.set(k, (porMes.get(k) || 0) + 1);
    juntas.push(f);
    if (juntas.length === COLLAGE_MAX) break;
  }
  const filas = Math.floor(juntas.length / 4) * 4;
  const collage = filas >= COLLAGE_MIN
    ? juntas.slice(0, filas).sort((a, b) => fechaEfectiva(a) - fechaEfectiva(b)).map(ficha)
    : null;

  // The hour they send photos at, Madrid time: by sessions (a day and an hour), not by photos, so one evening of
  // fifty photos is one
  const sesiones = new Set();
  const horas = Array(24).fill(0);
  for (const f of fotos) {
    if (enRafaga(f)) continue;
    const h = horaMadrid(f.createdAt);
    const k = `${diaMadrid(f.createdAt)}T${h}`;
    if (sesiones.has(k)) continue;
    sesiones.add(k);
    horas[h] += 1;
  }
  const hora = sesiones.size >= HORA_MIN ? { hora: horas.indexOf(Math.max(...horas)), horas } : null;

  const primera = canciones.filter((c) => c.name && c.createdAt != null).sort((a, b) => a.createdAt - b.createdAt)[0];
  const abren = capsulas.map((c) => c.openAt).filter((t) => t != null && t >= v.hasta);

  return {
    v: VERSION,
    anio: v.anio, n: v.n, desde: v.desde, hasta: v.hasta,
    fotos: {
      ...porPersona(fotos), meses, mejorMes: mejor.n > 0 ? mejor : null, favorita, comentada,
      portadas, extremos, collage, hora,
    },
    encuentros: { n: vistas.length, dias: dias.size, masLargo, sitio, otros: lugares.slice(1).map((s) => s.lugar), fotoLargo, espera },
    planes,
    notas: porPersona(notas),
    canciones: porPersona(canciones),
    musica: { segundos: Math.round(canciones.reduce((s, c) => s + (c.duration || 0), 0)), primera: primera?.name || '' },
    // Sealed this year, and the soonest of them that is still closed on the anniversary
    capsulas: { n: capsulas.length, proxima: abren.length ? Math.min(...abren) : null },
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
  const mesiversarios = juntos.years * 12 + juntos.months;
  // The 12 stamps of this year together (13 to 24 for the 2nd), the ones not reached yet still blank
  const primero = (stats.n - 1) * 12 + 1;
  const sellos = Array.from({ length: 12 }, (_, k) => ({ n: primero + k, mes: (ANN_MES + primero + k) % 12, ganado: primero + k <= mesiversarios }));
  const historias = [
    { id: 'portada', n: stats.n, desde: stats.desde, hasta: stats.hasta },
    { id: 'dias', dias: diasEntre(localKey(ANNIVERSARY), hoy), mesiversarios, sellos },
  ];
  const si = (cond, historia) => { if (cond) historias.push(historia); };
  // A chapter of photos: its months, each with its count and its cover (null when it has none to show: the page
  // puts the stamp of that month's 24th instead). The month with the most photos is marked when there are two to
  // tell apart. A chapter with no photos at all is left out
  const conFotos = fotos.meses.filter((x) => x.n > 0).length;
  const capitulo = (k) => {
    const huecos = CAPITULOS[k - 1].filter((i) => fotos.meses[i]);
    if (!huecos.some((i) => fotos.meses[i].n > 0)) return;
    historias.push({
      id: `capitulo-${k}`, k,
      meses: huecos.map((i) => {
        const { anio, mes, n } = fotos.meses[i];
        const mejor = conFotos >= 2 && fotos.mejorMes?.anio === anio && fotos.mejorMes?.mes === mes;
        return { anio, mes, n, foto: fotos.portadas[i] || null, mejor, sello: (anio - START_YEAR) * 12 + mes - ANN_MES };
      }),
    });
  };
  capitulo(1);
  si(encuentros.n > 0, { id: 'encuentros', n: encuentros.n, dias: encuentros.dias });
  si(encuentros.masLargo.dias >= 2, { id: 'largo', ...encuentros.masLargo, foto: encuentros.fotoLargo });
  si(encuentros.espera, { id: 'espera', ...encuentros.espera });
  capitulo(2);
  si(encuentros.sitio?.veces >= 2, { id: 'sitio', ...encuentros.sitio, otros: encuentros.otros });
  si(planes.total > 0, { id: 'planes', ...planes });
  capitulo(3);
  si(fotos.total > 0, { id: 'fotos', total: fotos.total, yo: fotos.yo, ella: fotos.ella, hora: fotos.hora });
  capitulo(4);
  si(fotos.favorita || fotos.comentada, { id: 'foto', ...(fotos.favorita || fotos.comentada) });
  si(fotos.extremos, { id: 'extremos', ...fotos.extremos });
  si(notas.total > 0 || canciones.total > 0, { id: 'escrito', notas, canciones, musica: stats.musica });
  si(fotos.collage, { id: 'collage', fotos: fotos.collage });
  historias.push({ id: 'cierre', capsulas: stats.capsulas });
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
      const stats = analizar(await (calcular || leerAnio)(pairId, v), v, pairId);
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
