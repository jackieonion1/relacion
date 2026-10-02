import { db, auth, whenAuthed } from './firebase';
import { madridDayKey } from './photos';
import { fechaEfectiva, rangoDiaMadrid } from './fotoFecha';
import { fotosEnRangoTope, listarConTope, olvidarPortadas, portadaCacheada } from './recuerdos';

// Travel and manual albums (3.1). An album is a doc in pairs/{p}/albums with a title, an emoji and, when it comes
// from a «nos vemos» event, the days of that event; its photos are the ones of those days by effective date (plus a
// few days of margin, since photos are uploaded on the way back) joined with the ones put in by hand
// (photos/{id}.albumIds), minus `excludedIds`. The trips of the calendar are albums from the start without a doc:
// they only get one (id 'ev-<eventId>', the same on both phones) when they are renamed or a photo is taken out of them

let _fb;
async function fb() {
  if (!_fb) {
    const mod = await import('firebase/firestore');
    _fb = mod;
  }
  return _fb;
}

export const EMOJI_VIAJE = '✈️';
// Days after the last day of an event that still count as its photos
export const MARGEN_DIAS = 3;
const TROZO = 400; // writes in a batch, under the limit of 500 operations
const MAX_TITULO = 60;

export const idDeEvento = (eventId) => `ev-${eventId}`;

// Natural days (Madrid) from start to end, both included
export function diasDeAlbum({ start, end }) {
  if (start == null) return 0;
  const utc = (ms) => { const [y, m, d] = madridDayKey(new Date(ms)).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.max(1, Math.round((utc(end ?? start) - utc(start)) / 86400000) + 1);
}

// [desde, hasta) in ms of the photos of an album with days: from the first day to MARGEN_DIAS after the last
export function rangoDeAlbum({ start, end }) {
  const [y1, m1, d1] = madridDayKey(new Date(start)).split('-').map(Number);
  const [y2, m2, d2] = madridDayKey(new Date(end ?? start)).split('-').map(Number);
  return { desde: rangoDiaMadrid(y1, m1 - 1, d1).desde, hasta: rangoDiaMadrid(y2, m2 - 1, d2 + 1 + MARGEN_DIAS).desde };
}

// The album of a «nos vemos» event that has no doc yet. `ev` is { id, title, start, end } with dates in ms
export function albumDeEvento(ev) {
  return {
    id: idDeEvento(ev.id), titulo: ev.title || 'Encuentro', emoji: EMOJI_VIAJE, tipo: 'evento', eventId: ev.id,
    start: ev.start, end: ev.end ?? ev.start, excluidas: [], virtual: true, creadoEn: ev.start,
  };
}

// The album of a doc (ms dates)
export function albumDeDoc(docSnap) {
  const d = docSnap.data() || {};
  const ms = (t) => t?.toMillis?.() ?? null;
  return {
    id: docSnap.id,
    titulo: String(d.title || '').trim() || 'Álbum',
    sinTitulo: !String(d.title || '').trim(), // the doc of an event album made by taking a photo out: it is named by its event
    emoji: d.emoji || EMOJI_VIAJE,
    tipo: d.kind === 'evento' ? 'evento' : 'manual',
    eventId: d.eventId || null,
    start: ms(d.start), end: ms(d.end) ?? ms(d.start),
    excluidas: Array.isArray(d.excludedIds) ? d.excludedIds : [],
    virtual: false,
    creadoEn: ms(d.createdAt) ?? 0,
  };
}

// Joins the docs with the events: { manuales, viajes, cortos }. A doc wins over the album of its event; the events
// still to come are left out (nothing to show yet) and the ones of one day go to `cortos`, under «Más encuentros»
export function combinarAlbumes(docs, eventos, ahora = Date.now()) {
  const porId = new Map(docs.map((a) => [a.id, a]));
  for (const ev of eventos) {
    if (ev.start == null || ev.start > ahora) continue;
    const a = albumDeEvento(ev);
    const real = porId.get(a.id);
    if (!real) porId.set(a.id, a);
    else if (real.sinTitulo) porId.set(a.id, { ...real, titulo: a.titulo });
  }
  const todos = [...porId.values()];
  const conDias = todos.filter((a) => a.tipo === 'evento' && a.start != null);
  const porFecha = (a, b) => b.start - a.start || (a.id < b.id ? -1 : 1);
  return {
    manuales: todos.filter((a) => a.tipo !== 'evento' || a.start == null).sort((a, b) => b.creadoEn - a.creadoEn || (a.id < b.id ? -1 : 1)),
    viajes: conDias.filter((a) => diasDeAlbum(a) >= 2).sort(porFecha),
    cortos: conDias.filter((a) => diasDeAlbum(a) < 2).sort(porFecha),
  };
}

// ---- Reading ----

// The albums with a doc, in no order
export async function listarAlbumes(pairId) {
  if (!pairId || !db) return [];
  await whenAuthed();
  const f = await fb();
  const snap = await f.getDocs(f.collection(db, 'pairs', pairId, 'albums'));
  return snap.docs.map(albumDeDoc);
}

// The «nos vemos» events ({ id, title, start, end } in ms): a single-field query, a few dozen docs at most
export async function listarEncuentros(pairId) {
  if (!pairId || !db) return [];
  await whenAuthed();
  const f = await fb();
  const snap = await f.getDocs(f.query(f.collection(db, 'pairs', pairId, 'events'), f.where('seeEachOther', '==', true)));
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, title: String(x.title || '').trim(), start: x.start?.toMillis?.() ?? null, end: x.end?.toMillis?.() ?? null };
  });
}

// An album by id: its doc, or the one of its event when it has no doc yet. null when it is neither
export async function leerAlbum(pairId, id) {
  if (!pairId || !id || !db) return null;
  await whenAuthed();
  const f = await fb();
  const doc = await f.getDoc(f.doc(db, 'pairs', pairId, 'albums', id));
  const real = doc.exists() ? albumDeDoc(doc) : null;
  if (real && !(real.sinTitulo && real.eventId)) return real;
  if (!real && !id.startsWith('ev-')) return null;
  const ev = await f.getDoc(f.doc(db, 'pairs', pairId, 'events', real?.eventId || id.slice(3)));
  if (!ev.exists()) return real;
  const x = ev.data();
  const deEvento = albumDeEvento({ id: ev.id, title: String(x.title || '').trim(), start: x.start?.toMillis?.() ?? null, end: x.end?.toMillis?.() ?? null });
  return real ? { ...real, titulo: deEvento.titulo } : deEvento;
}

// The photos of an album, oldest first: { items } (+ thumbsDone with onThumb). Only the first `max` of each query
// get their thumb (see listarConTope); `limite` also cuts the documents read, for a cover
export async function fotosDeAlbum(pairId, album, { onThumb = null, max = Infinity, limite = 0 } = {}) {
  const excluir = album.excluidas?.length ? new Set(album.excluidas) : null;
  const consultas = [
    listarConTope(
      pairId,
      ({ query, where, limit }, col) => query(col, where('albumIds', 'array-contains', album.id), ...(limite ? [limit(limite)] : [])),
      { onThumb, max, filtro: excluir ? (it) => !excluir.has(it.id) : null },
    ),
  ];
  if (album.start != null) {
    const { desde, hasta } = rangoDeAlbum(album);
    consultas.push(fotosEnRangoTope(pairId, desde, hasta, { onThumb, max, limite, excluir }));
  }
  const resultados = await Promise.all(consultas);
  const vistas = new Set();
  const items = [];
  for (const r of resultados) {
    for (const it of r.items) if (!vistas.has(it.id)) { vistas.add(it.id); items.push(it); }
  }
  items.sort((a, b) => fechaEfectiva(a) - fechaEfectiva(b) || (a.id < b.id ? -1 : 1));
  if (onThumb) return { items, thumbsDone: Promise.all(resultados.map((r) => r.thumbsDone)) };
  return { items };
}

// The cover of an album: the thumb URL of its first photo, or '' when it has none
export function portadaDeAlbum(pairId, album) {
  // Its days and its exclusions are part of the key, so a change in them is not answered from the cache
  return portadaCacheada(`${pairId}:${album.id}:${album.start}:${album.end}:${album.excluidas.length}`, async () => {
    const { items } = await fotosDeAlbum(pairId, album, { max: 1, limite: 4 });
    return items.find((it) => it.thumbUrl)?.thumbUrl || '';
  });
}

// ---- Writing (updateDoc, never setDoc on a photo: a deleted one must not come back) ----

async function contexto(pairId) {
  if (!pairId || !db) throw new Error('missing-context');
  await whenAuthed();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  return f;
}

const campos = (f, album) => ({
  title: album.titulo, emoji: album.emoji, kind: album.tipo,
  ...(album.eventId ? { eventId: album.eventId } : {}),
  ...(album.start != null ? { start: f.Timestamp.fromMillis(album.start), end: f.Timestamp.fromMillis(album.end ?? album.start) } : {}),
});

// A new manual album. Resolves once the write is queued (offline it waits for the connection): `committed` settles
// with the server ack, and `album` is what the screens use meanwhile
export async function crearAlbum(pairId, { titulo, emoji = '🩷' }, identity = 'yo') {
  const f = await contexto(pairId);
  const ref = f.doc(f.collection(db, 'pairs', pairId, 'albums'));
  const album = { id: ref.id, titulo: String(titulo || '').trim().slice(0, MAX_TITULO), emoji, tipo: 'manual', eventId: null, start: null, end: null, excluidas: [], virtual: false, creadoEn: Date.now() };
  const committed = f.setDoc(ref, { ...campos(f, album), createdBy: auth.currentUser.uid, identity, createdAt: f.serverTimestamp() });
  committed.catch(() => {});
  return { album, committed };
}

// The fields that give the album of an event its doc. Never its title or emoji: a phone with old data would undo the
// rename of the other one (the title of a doc without one is the event's, see albumDeDoc), so those are only written
// by a rename. The id is the same on both phones and merge keeps what the other one wrote in between
function datosDeEvento(f, album, identity) {
  const { title, emoji, ...resto } = campos(f, album);
  return { ...resto, createdBy: auth.currentUser.uid, identity, createdAt: f.serverTimestamp() };
}

// Gives the album of an event its doc (nothing to do if it has one)
async function materializar(f, pairId, album, identity) {
  if (!album.virtual) return;
  await f.setDoc(f.doc(db, 'pairs', pairId, 'albums', album.id), datosDeEvento(f, album, identity), { merge: true });
}

// Renames an album and changes its emoji
export async function guardarAlbum(pairId, album, { titulo, emoji }, identity = 'yo') {
  const f = await contexto(pairId);
  const nuevo = { ...album, titulo: String(titulo || '').trim().slice(0, MAX_TITULO) || album.titulo, emoji: emoji || album.emoji };
  const committed = (async () => {
    await materializar(f, pairId, album, identity);
    await f.updateDoc(f.doc(db, 'pairs', pairId, 'albums', album.id), { title: nuevo.titulo, emoji: nuevo.emoji });
  })();
  committed.catch(() => {});
  return { album: { ...nuevo, virtual: false }, committed };
}

// Applies `campos(f)` to those photos, in batches. One photo deleted in the meantime fails its whole batch, so a
// failed batch is redone photo by photo, skipping the ones that are gone. Resolves { hechas, perdidas } and does
// not need to be awaited: offline it settles when the connection is back
async function actualizarFotos(f, pairId, ids, build) {
  const coleccion = f.collection(db, 'pairs', pairId, 'photos');
  const cambios = build(f);
  const trozos = [];
  for (let i = 0; i < ids.length; i += TROZO) trozos.push(ids.slice(i, i + TROZO));
  const partes = await Promise.all(trozos.map(async (trozo) => {
    try {
      const lote = f.writeBatch(db);
      for (const id of trozo) lote.update(f.doc(coleccion, id), cambios);
      await lote.commit();
      return { hechas: trozo.length, perdidas: 0 };
    } catch {
      let hechas = 0;
      let perdidas = 0;
      for (const id of trozo) {
        try { await f.updateDoc(f.doc(coleccion, id), cambios); hechas += 1; } catch { perdidas += 1; }
      }
      return { hechas, perdidas };
    }
  }));
  return partes.reduce((a, p) => ({ hechas: a.hechas + p.hechas, perdidas: a.perdidas + p.perdidas }), { hechas: 0, perdidas: 0 });
}

// Puts those photos in the album: `committed` settles with { hechas, perdidas }. A photo the album had left out
// by hand comes back
export async function asignarAlbum(pairId, album, ids) {
  const f = await contexto(pairId);
  const vuelven = (album.excluidas || []).filter((id) => ids.includes(id));
  olvidarPortadas();
  const committed = (async () => {
    if (vuelven.length) await f.updateDoc(f.doc(db, 'pairs', pairId, 'albums', album.id), { excludedIds: f.arrayRemove(...vuelven) });
    return actualizarFotos(f, pairId, ids, ({ arrayUnion }) => ({ albumIds: arrayUnion(album.id) }));
  })();
  committed.catch(() => {});
  return { committed };
}

// Takes those photos out of the album. The ones that came in by the days of the event are listed as excluded in the
// doc (which an event album gets here if it had none), the ones put in by hand lose their mark
export async function quitarDeAlbum(pairId, album, ids, identity = 'yo') {
  const f = await contexto(pairId);
  olvidarPortadas();
  const committed = (async () => {
    // One write for the doc (the first time it also creates it) and the photos', all queued at once: offline the
    // first one would otherwise keep the others from being written
    const ref = f.doc(db, 'pairs', pairId, 'albums', album.id);
    const excluidas = album.start == null ? null
      : album.virtual ? f.setDoc(ref, { ...datosDeEvento(f, album, identity), excludedIds: f.arrayUnion(...ids) }, { merge: true })
        : f.updateDoc(ref, { excludedIds: f.arrayUnion(...ids) });
    const fotos = actualizarFotos(f, pairId, ids, ({ arrayRemove }) => ({ albumIds: arrayRemove(album.id) }));
    const [, r] = await Promise.all([excluidas, fotos]);
    return r;
  })();
  committed.catch(() => {});
  return { committed };
}

// Deletes a manual album and the mark in its photos (the photos stay in the gallery)
export async function borrarAlbum(pairId, album) {
  const f = await contexto(pairId);
  olvidarPortadas();
  const { items } = await listarConTope(pairId, ({ query, where }, col) => query(col, where('albumIds', 'array-contains', album.id)), { max: 0 });
  await f.deleteDoc(f.doc(db, 'pairs', pairId, 'albums', album.id));
  if (items.length) {
    const committed = actualizarFotos(f, pairId, items.map((it) => it.id), ({ arrayRemove }) => ({ albumIds: arrayRemove(album.id) }));
    committed.catch(() => {});
  }
}
