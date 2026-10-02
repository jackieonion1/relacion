// What the other one has done (3.1): pairs/{p}/actividad-{para}/{id}, one collection per receiver, written by the
// phone that does it right after the action, and read by the bell of Inicio. { tipo, quien, para, ref, texto?, n?,
// tuya?, ambos?, createdAt }. One write per action, never awaited: an entry that fails never touches the action it
// tells about
import { db, storage, whenAuthed, listenWhenAuthed } from './firebase';
import { getThumb } from './photoCache';
import { WHO } from './fotoCampos';
import { noteMillis } from './noteText';

export const TIPOS = ['comentario', 'reaccion', 'favorita', 'fotos', 'nota', 'evento', 'eventoEditado', 'nosVemos', 'capsula'];
export const MAX_TEXTO = 80;
// The last MOSTRADAS of the collection of this phone's person. One collection per receiver: what one does can never push
// the other's out of the window, and a single order on createdAt needs no manual index (a `para ==` plus that order would)
export const MOSTRADAS = 30;

const REF_KEYS = ['photoId', 'noteId', 'threadId', 'eventId', 'dia', 'capsuleId'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let _fb;
async function fb() {
  if (!_fb) _fb = await import('firebase/firestore');
  return _fb;
}

const otra = (identity) => (identity === 'yo' ? 'ella' : 'yo');

function corto(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO - 1).trimEnd()}…` : t;
}

// The id of the entry an action leaves ('' = an automatic one). A reaction and a favourite have a fixed id per photo and
// person: changing the reaction rewrites the same entry. A comment, a note and an event have the one of what they tell
// about (`clave`, its own id): taking it back finds its entry again. Taking back a reaction needs `quien` too
export function idActividad(tipo, quien, { ref = {}, clave = '' } = {}) {
  if (tipo === 'reaccion' || tipo === 'favorita') return WHO[quien] && ref.photoId ? `${tipo}-${ref.photoId}-${quien}` : '';
  if (['comentario', 'nota', 'evento', 'eventoEditado', 'nosVemos'].includes(tipo)) return /^[\w-]+$/.test(clave) ? `${tipo}-${clave}` : '';
  return '';
}

// The entry an action leaves: { id, data } (id '' = an automatic one), or null when there is nothing to tell.
// `autor` is who uploaded the photo: a favourite is only told on the other's photos, and the rest say «tu foto» then
export function entradaActividad(tipo, quien, { ref = {}, texto = '', n = 0, autor = '', ambos = false, clave = '' } = {}) {
  if (!WHO[quien] || !TIPOS.includes(tipo)) return null;
  const para = otra(quien);
  const limpio = {};
  REF_KEYS.forEach((k) => { if (ref[k] && typeof ref[k] === 'string') limpio[k] = ref[k]; });
  const conFoto = ['comentario', 'reaccion', 'favorita'].includes(tipo);
  if (conFoto && !limpio.photoId) return null;
  if (tipo === 'favorita' && autor !== para) return null;
  if (tipo === 'reaccion' && !texto) return null; // taking a reaction away tells nothing
  if (tipo === 'fotos' && !(n > 0)) return null;
  const data = { tipo, quien, para, ref: limpio };
  const t = corto(texto);
  if (t) data.texto = t;
  if (tipo === 'fotos') data.n = Math.floor(n);
  if (conFoto) data.tuya = autor === para;
  if (tipo === 'capsula') data.ambos = !!ambos;
  return { id: idActividad(tipo, quien, { ref: limpio, clave }), data };
}

// Writes the entry of an action, in the background. Returns nothing and never throws: callers never wait for it
export function registrarActividad(pairId, quien, tipo, datos) {
  (async () => {
    const e = entradaActividad(tipo, quien, datos);
    if (!pairId || !db || !e) return;
    await whenAuthed();
    const f = await fb();
    const col = f.collection(db, 'pairs', pairId, `actividad-${e.data.para}`);
    await f.setDoc(e.id ? f.doc(col, e.id) : f.doc(col), { ...e.data, createdAt: f.serverTimestamp() });
  })().catch((err) => console.warn('Activity write failed', err));
}

// Takes back the avisos of what has been taken back (a comment, a note, an event, a reaction, a favourite), in the
// background like registrarActividad: it never throws and never holds the action. `tipo` is one or several. With `quien`
// (who wrote it) only the collection of the other is asked; without it, the two (a note can be deleted by either)
export function borrarActividad(pairId, tipo, { quien = '', ref = {}, clave = '' } = {}) {
  (async () => {
    const ids = [].concat(tipo).map((t) => idActividad(t, quien, { ref, clave })).filter(Boolean);
    if (!pairId || !db || !ids.length) return;
    const cols = WHO[quien] ? [`actividad-${otra(quien)}`] : ['actividad-yo', 'actividad-ella'];
    await whenAuthed();
    const f = await fb();
    await Promise.all(cols.flatMap((c) => ids.map((id) => f.deleteDoc(f.doc(f.collection(db, 'pairs', pairId, c), id)))));
  })().catch((err) => console.warn('Activity delete failed', err));
}

// --- Batches of photos ---

// One «fotos» entry per batch, told when the upload has really finished. The photos of a batch that are still pending
// (offline, slow, failed) keep it waiting in localStorage, so it survives a reload; each one that goes up, from the page
// or from a retry, moves to the batch's uploaded ones, and when none is pending any more the entry is written. The batch
// is dropped before the write, so a retry that tells again of the same photos can't repeat it
const tandasKey = (pairId) => `actividad:tandas:${pairId}`;

function leerTandas(pairId) {
  try {
    const v = JSON.parse(localStorage.getItem(tandasKey(pairId)) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function guardarTandas(pairId, list) {
  try {
    if (list.length) localStorage.setItem(tandasKey(pairId), JSON.stringify(list));
    else localStorage.removeItem(tandasKey(pairId));
  } catch {}
}

function avisarTanda(pairId, quien, subidas) {
  if (subidas.length) registrarActividad(pairId, quien, 'fotos', { n: subidas.length, ref: { photoId: subidas[0] } });
}

// A batch of `quien`: `subidas` already in the cloud, `pendientes` still to go up. `pendientesAhora` = the pending ids
// of the pair at this moment: one that has left it already (it finished while the rest was still going) counts as sent
export function registrarTanda(pairId, quien, subidas, pendientes, pendientesAhora) {
  if (!pairId) return;
  const siguen = pendientes.filter((id) => pendientesAhora.includes(id));
  const hechas = [...subidas, ...pendientes.filter((id) => !pendientesAhora.includes(id))];
  if (!siguen.length) { avisarTanda(pairId, quien, hechas); return; }
  guardarTandas(pairId, [...leerTandas(pairId), { quien, subidas: hechas, pendientes: siguen }]);
}

// Something went up (`enviadas`) or left the pending list (`pendientesAhora` is what is still in it): the batches that
// have nothing pending left are told. A photo that left without being sent (lost, deleted) is not counted
export function resolverTandas(pairId, pendientesAhora, enviadas) {
  if (!pairId) return;
  const tandas = leerTandas(pairId);
  if (!tandas.length) return;
  const siguen = [];
  const listas = [];
  tandas.forEach((t) => {
    const quedan = t.pendientes.filter((id) => pendientesAhora.includes(id));
    const subidas = [...t.subidas, ...t.pendientes.filter((id) => !pendientesAhora.includes(id) && enviadas.includes(id))];
    if (quedan.length) siguen.push({ ...t, subidas, pendientes: quedan });
    else listas.push({ quien: t.quien, subidas });
  });
  guardarTandas(pairId, siguen);
  listas.forEach((t) => avisarTanda(pairId, t.quien, t.subidas));
}

// --- Words ---

// What the entry says after the emoji of who did it
export function textoActividad(e) {
  const foto = e.tuya ? 'tu foto' : 'una foto';
  const cita = e.texto ? `: «${e.texto}»` : '';
  switch (e.tipo) {
    case 'comentario': return `ha comentado ${foto}${cita}`;
    case 'reaccion': return `ha reaccionado ${e.texto || ''} a ${foto}`.replace(/\s+/g, ' ');
    case 'favorita': return 'ha guardado tu foto en favoritas';
    case 'fotos': return e.n === 1 ? 'ha subido una foto' : `ha subido ${e.n} fotos`;
    case 'nota': return `${e.ref?.threadId && e.ref.threadId !== e.ref.noteId ? 'ha respondido en una nota' : 'ha escrito una nota'}${cita}`;
    case 'evento': return `ha apuntado un plan${cita}`;
    case 'eventoEditado': return `ha cambiado un plan${cita}`;
    case 'nosVemos': return `ha apuntado cuándo os veis${cita}`;
    case 'capsula': return `ha sellado una cápsula ${e.ambos ? 'para los dos' : 'para ti'}`;
    default: return '';
  }
}

// The whole line, as a screen reader says it: «🫒 ha comentado tu foto: «qué guapa»»
export function lineaActividad(e) {
  return `${WHO[e.quien] || ''} ${textoActividad(e)}`.trim();
}

// «ahora mismo» · «hace 5 min» · «hace 3 h» (today) · «ayer» · «hace 4 días» · «12 sep» (with the year when not this one)
export function tiempoRelativo(ms, now = new Date()) {
  if (!ms) return 'ahora mismo';
  const diff = now.getTime() - ms;
  if (diff < 60_000) return 'ahora mismo';
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  const dt = new Date(ms);
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dt >= hoy) return `hace ${Math.floor(diff / 3_600_000)} h`;
  const dias = Math.round((hoy - new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())) / 86_400_000);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  const year = dt.getFullYear() !== now.getFullYear() ? ` ${dt.getFullYear()}` : '';
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}${year}`;
}

// --- Lists ---

// Times are compared as Timestamps (seconds, nanoseconds), never through ms: the server's time has microseconds and a
// double of ms rounds them, so a «visto» rebuilt from ms came out a microsecond short and the bell kept a «1»
export const NUNCA = Object.freeze({ seconds: 0, nanoseconds: 0 });
export const cmpTs = (a, b) => (a.seconds - b.seconds) || (a.nanoseconds - b.nanoseconds);
const tsDe = (e) => e.ts || NUNCA;
// An entry still without the server's time (a write of this phone, in flight) is not new for anyone
const esNueva = (e, vistoHasta) => !!e.ts && cmpTs(e.ts, vistoHasta || NUNCA) > 0;

// The entries for `identity`, newest first, at most MOSTRADAS
export function paraMi(list, identity) {
  return list.filter((e) => e.para === identity).sort((a, b) => cmpTs(tsDe(b), tsDe(a))).slice(0, MOSTRADAS);
}

// Unseen: newer than the last one seen. The bell says 9+ past nine
export function noLeidas(list, vistoHasta) {
  return list.filter((e) => esNueva(e, vistoHasta)).length;
}

export function insignia(n) {
  return n > 9 ? '9+' : String(n);
}

// «Nuevas» and «Antes», split by what had been seen when the sheet opened
export function agruparActividad(list, vistoHasta) {
  const nuevas = [];
  const antes = [];
  list.forEach((e) => (esNueva(e, vistoHasta) ? nuevas : antes).push(e));
  return { nuevas, antes };
}

// Where tapping an entry goes: { to, state }
export function destinoActividad(e) {
  const r = e.ref || {};
  if (r.photoId && e.tipo !== 'fotos') return { to: `/gallery?photo=${encodeURIComponent(r.photoId)}`, state: { volver: '/' } };
  if (e.tipo === 'fotos') return { to: '/gallery', state: null };
  if (e.tipo === 'nota') return { to: '/notes', state: null };
  if (e.tipo === 'capsula') return { to: '/recuerdos/capsulas', state: { volver: '/' } };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.dia || '');
  if (!m) return { to: '/calendar', state: null };
  const ev = r.eventId ? `&ev=${encodeURIComponent(r.eventId)}` : '';
  return { to: `/calendar?y=${Number(m[1])}&m=${Number(m[2]) - 1}&d=${Number(m[3])}${ev}`, state: null };
}

// --- Firebase ---

function actividadItem(d) {
  const data = d.data() || {};
  return {
    id: d.id,
    tipo: data.tipo || '',
    quien: data.quien || '',
    para: data.para || '',
    ref: data.ref && typeof data.ref === 'object' ? data.ref : {},
    texto: data.texto || '',
    n: data.n || 0,
    tuya: !!data.tuya,
    ambos: !!data.ambos,
    ts: typeof data.createdAt?.seconds === 'number' ? data.createdAt : null,
    ms: noteMillis(data),
  };
}

const vistoRef = (f, pairId, identity) => f.doc(f.collection(db, 'pairs', pairId, 'meta'), `actividad-visto-${identity}`);

// The last MOSTRADAS entries for `identity`, live (a single order on createdAt: automatic index). onChange(items)
export function escucharActividad(pairId, identity, onChange, onError) {
  if (!pairId || !WHO[identity] || !db) return () => {};
  return listenWhenAuthed(async () => {
    const f = await fb();
    const q = f.query(f.collection(db, 'pairs', pairId, `actividad-${identity}`), f.orderBy('createdAt', 'desc'), f.limit(MOSTRADAS));
    return f.onSnapshot(q, (snap) => onChange(snap.docs.map(actividadItem).filter((e) => TIPOS.includes(e.tipo))), onError);
  }, onError);
}

// Up to when `identity` has seen, live: onChange(Timestamp), NUNCA when never
export function escucharVisto(pairId, identity, onChange, onError) {
  if (!pairId || !WHO[identity] || !db) return () => {};
  return listenWhenAuthed(async () => {
    const f = await fb();
    return f.onSnapshot(vistoRef(f, pairId, identity), (snap) => {
      const t = snap.data()?.vistoHasta;
      onChange(typeof t?.seconds === 'number' ? t : NUNCA);
    }, onError);
  }, onError);
}

// Seen up to the newest entry shown: its own Timestamp, written as it is (the server's time, so no clock of this
// phone is involved and nothing is rounded). One write
export async function marcarVisto(pairId, identity, ts) {
  if (!pairId || !WHO[identity] || !db || !ts || cmpTs(ts, NUNCA) <= 0) return;
  await whenAuthed();
  const f = await fb();
  await f.setDoc(vistoRef(f, pairId, identity), { vistoHasta: ts });
}

// The thumb of a photo for the sheet: the cached one, or else Storage's URL. No read of the photo doc. '' if gone
const miniaturas = new Map();
export async function miniaturaFoto(pairId, photoId) {
  if (!pairId || !photoId) return '';
  if (miniaturas.has(photoId)) return miniaturas.get(photoId);
  let url = '';
  try {
    const blob = await getThumb(photoId);
    if (blob) url = URL.createObjectURL(blob);
    else if (storage) {
      const { ref, getDownloadURL } = await import('firebase/storage');
      url = await getDownloadURL(ref(storage, `pairs/${pairId}/photos/${photoId}/thumb.jpg`));
    }
  } catch {
    url = '';
  }
  if (url) miniaturas.set(photoId, url);
  return url;
}
