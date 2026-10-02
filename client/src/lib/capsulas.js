// Time capsules (3.1): a letter (and maybe a photo) for both or for the other one, that opens on a chosen day.
// pairs/{p}/capsules/{id} is the envelope everyone reads (who, for whom, openAt at 00:00 Madrid); the content lives in
// pairs/{p}/capsuleSecrets/{id}, which the rules only let through, one by one, once the server clock reaches openAt.
// The photo is pairs/{p}/capsules/{id}/{openAtMs}.jpg in Storage, sealed by its own name (no Firestore doc decides
// when it opens), and is read with getBlob: no download URL is ever stored
import { db, auth, storage, listenWhenAuthed, whenAuthed } from './firebase';
import { rangoDiaMadrid } from './fotoFecha';

export const MAX_TEXTO = 2000;
export const MAX_TITULO = 60;
export const EMOJI = { yo: '🫒', ella: '🍪' };

const TZ = 'Europe/Madrid';
const DIA = 86400000;

let _fb;
async function fb() {
  if (!_fb) _fb = await import('firebase/firestore');
  return _fb;
}

const capsulesCol = (f, pairId) => f.collection(db, 'pairs', pairId, 'capsules');
const secretsCol = (f, pairId) => f.collection(db, 'pairs', pairId, 'capsuleSecrets');
const mediaPath = (pairId, id, openAtMs) => `pairs/${pairId}/capsules/${id}/${openAtMs}.jpg`;

// --- Pure: days and words ---

const dayKeyFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const longFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });

// 'YYYY-MM-DD' of the Madrid day of `ms`
export function diaMadrid(ms) {
  const parts = Object.fromEntries(dayKeyFormat.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Days between two 'YYYY-MM-DD' (calendar days, whatever the clock change)
function diasEntre(a, b) {
  const utc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(b) - utc(a)) / DIA);
}

// 00:00 in Madrid of a 'YYYY-MM-DD' day, in ms: the capsule's openAt
export function abreEl(dia) {
  const [y, m, d] = String(dia).split('-').map(Number);
  return rangoDiaMadrid(y, m - 1, d).desde;
}

// The first day a new capsule can open: tomorrow in Madrid (the rules want openAt after the server's now)
export function diaMinimo(now = Date.now()) {
  const [y, m, d] = diaMadrid(now).split('-').map(Number);
  return diaMadrid(rangoDiaMadrid(y, m - 1, d + 1).desde);
}

// '24 de noviembre de 2026'
export function fechaLarga(ms) {
  return longFormat.format(new Date(ms));
}

// How long until it opens, by Madrid days: 'Se abre mañana', 'Se abre en 12 días', 'en 3 meses', 'en 2 años'
export function cuentaAtras(openAt, now = Date.now()) {
  const dias = diasEntre(diaMadrid(now), diaMadrid(openAt));
  if (dias <= 0) return 'Se abre hoy';
  if (dias === 1) return 'Se abre mañana';
  if (dias < 45) return `Se abre en ${dias} días`;
  if (dias < 365) return `Se abre en ${Math.round(dias / 30.44)} meses`;
  const anos = Math.floor(dias / 365);
  return `Se abre en ${anos === 1 ? 'un año' : `${anos} años`}`;
}

// 'sellada' (not yet), 'lista' (its day came and this one has not opened it) or 'abierta' (this one already did)
export function estadoCapsula(c, identity, now = Date.now()) {
  if (!c?.openAt || c.openAt > now) return 'sellada';
  return c.openedFor?.includes(identity) ? 'abierta' : 'lista';
}

// The list split for the page: ready ones first (oldest day first), then sealed (soonest first), then opened (newest)
export function repartirCapsulas(list, identity, now = Date.now()) {
  const out = { listas: [], selladas: [], abiertas: [] };
  for (const c of list || []) {
    const e = estadoCapsula(c, identity, now);
    out[e === 'lista' ? 'listas' : e === 'sellada' ? 'selladas' : 'abiertas'].push(c);
  }
  out.listas.sort((a, b) => a.openAt - b.openAt);
  out.selladas.sort((a, b) => a.openAt - b.openAt);
  out.abiertas.sort((a, b) => b.openAt - a.openAt);
  return out;
}

// 'Para los dos', 'Para ti' or 'Para tu 🍪', seen by `identity`
export function paraQuien(c, identity) {
  if (!EMOJI[c?.forIdentity]) return 'Para los dos';
  return c.forIdentity === identity ? 'Para ti' : `Para tu ${EMOJI[c.forIdentity]}`;
}

// What the form sends, checked: { texto, titulo, dia, para } or an error code
export function validarCapsula({ texto, titulo, dia, para }, now = Date.now()) {
  const t = String(texto || '').trim();
  if (!t) return { error: 'texto' };
  if (t.length > MAX_TEXTO) return { error: 'largo' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia || '')) || dia < diaMinimo(now)) return { error: 'dia' };
  return {
    texto: t,
    titulo: String(titulo || '').trim().slice(0, MAX_TITULO),
    dia,
    para: EMOJI[para] ? para : 'ambos',
  };
}

// --- Firebase ---

function capsulaItem(d) {
  const data = d.data() || {};
  return {
    id: d.id,
    openAt: data.openAt?.toMillis?.() || 0,
    fromIdentity: data.fromIdentity || '',
    forIdentity: data.forIdentity || 'ambos',
    kind: data.kind === 'foto' ? 'foto' : 'texto',
    title: data.title || '',
    openedFor: Array.isArray(data.openedFor) ? data.openedFor : [],
  };
}

// The envelopes, live (a small collection; order in the client)
export function escucharCapsulas(pairId, onChange, onError) {
  if (!pairId || !db) return () => {};
  return listenWhenAuthed(async () => {
    const f = await fb();
    return f.onSnapshot(capsulesCol(f, pairId), (snap) => onChange(snap.docs.map(capsulaItem)), onError);
  }, onError);
}

// A JPEG of at most 1280 px on its long side (the photo of a capsule; the gallery's own resize is private to photos.js)
async function reducirFoto(file, max = 1280, quality = 0.8) {
  const img = document.createElement('img');
  img.decoding = 'async';
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
  } finally {
    URL.revokeObjectURL(url);
  }
  const ratio = Math.min(max / img.width, max / img.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('foto'))), 'image/jpeg', quality));
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// Seals a capsule: the photo first (it needs a connection), then envelope and content in one batch, which the rules
// tie together (same openAt, in the future). Online it waits for the server, so a refusal shows; offline the text
// is queued like a note and `queued` is true
export async function crearCapsula(pairId, { texto, titulo, dia, para, foto = null }, identity) {
  const v = validarCapsula({ texto, titulo, dia, para });
  if (v.error) throw new Error(v.error);
  if (!pairId || !db) throw new Error('missing-context');
  if (foto && !isOnline()) throw new Error('offline-foto');
  await whenAuthed();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const ref = f.doc(capsulesCol(f, pairId));
  const openAtMs = abreEl(v.dia);
  const openAt = f.Timestamp.fromMillis(openAtMs);
  let path = '';
  if (foto) {
    const { ref: sref, uploadBytes } = await import('firebase/storage');
    path = mediaPath(pairId, ref.id, openAtMs);
    await uploadBytes(sref(storage, path), await reducirFoto(foto), { contentType: 'image/jpeg' });
  }
  const batch = f.writeBatch(db);
  batch.set(ref, {
    openAt,
    fromIdentity: EMOJI[identity] ? identity : '',
    forIdentity: v.para,
    kind: foto ? 'foto' : 'texto',
    ...(v.titulo ? { title: v.titulo } : {}),
    createdBy: auth.currentUser.uid,
    createdAt: f.serverTimestamp(),
    openedFor: [],
  });
  batch.set(f.doc(secretsCol(f, pairId), ref.id), { openAt, text: v.texto, ...(path ? { mediaPath: path } : {}) });
  const committed = batch.commit();
  if (!isOnline()) {
    committed.catch(() => {});
    return { id: ref.id, queued: true };
  }
  try {
    await committed;
  } catch (e) {
    if (path) {
      const { ref: sref, deleteObject } = await import('firebase/storage');
      deleteObject(sref(storage, path)).catch(() => {});
    }
    throw e;
  }
  return { id: ref.id, queued: false };
}

// The content of a capsule whose day has come: { text, fotoUrl } (an object URL: revoke it when done). Always from the
// server, never from this phone's cache, where the author's own text sits since they wrote it. Only one this phone
// has already opened may come from the cache when offline. Throws 'sellada' if the server says it is not the day yet
export async function leerCapsula(pairId, capsula, identity) {
  if (!pairId || !capsula?.id || !db) throw new Error('missing-context');
  await whenAuthed();
  const f = await fb();
  const ref = f.doc(secretsCol(f, pairId), capsula.id);
  let snap;
  try {
    snap = await f.getDocFromServer(ref);
  } catch (e) {
    if (e?.code === 'permission-denied') throw new Error('sellada');
    if (!capsula.openedFor?.includes(identity) || capsula.openAt > Date.now()) throw e;
    snap = await f.getDoc(ref);
  }
  if (!snap.exists()) throw new Error('sellada');
  const data = snap.data() || {};
  let fotoUrl = '';
  if (data.mediaPath) {
    try {
      const { ref: sref, getBlob } = await import('firebase/storage');
      fotoUrl = URL.createObjectURL(await getBlob(sref(storage, data.mediaPath)));
    } catch {
      fotoUrl = ''; // the letter still opens; the photo says it could not load
    }
  }
  return { text: data.text || '', fotoUrl, conFoto: !!data.mediaPath };
}

// Remembers that `identity` opened it (only openedFor may change on the envelope)
export async function marcarAbierta(pairId, id, identity) {
  if (!pairId || !id || !EMOJI[identity] || !db) return;
  await whenAuthed();
  const f = await fb();
  await f.updateDoc(f.doc(capsulesCol(f, pairId), id), { openedFor: f.arrayUnion(identity) }).catch(() => {});
}

// Envelope, content and, once its day has come, photo: the rules keep a sealed photo even from its own pair, so one
// deleted unopened stays in Storage, as sealed as before
export async function borrarCapsula(pairId, capsula) {
  if (!pairId || !capsula?.id || !db) return;
  await whenAuthed();
  const f = await fb();
  const batch = f.writeBatch(db);
  batch.delete(f.doc(capsulesCol(f, pairId), capsula.id));
  batch.delete(f.doc(secretsCol(f, pairId), capsula.id));
  const committed = batch.commit();
  if (capsula.kind === 'foto' && capsula.openAt && capsula.openAt <= Date.now()) {
    const { ref: sref, deleteObject } = await import('firebase/storage');
    deleteObject(sref(storage, mediaPath(pairId, capsula.id, capsula.openAt))).catch(() => {});
  }
  if (isOnline()) await committed;
  else committed.catch(() => {});
}
