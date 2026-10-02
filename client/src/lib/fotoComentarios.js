// Comments on photos (3.1): a flat collection, pairs/{p}/photoComments/{auto}, with the count kept on the photo.
// A new comment fires the push to the other one (onNewPhotoComment, functions), which opens /gallery?photo=ID
import { db, auth, listenWhenAuthed, whenAuthed } from './firebase';
import { noteMillis } from './noteText';
import { WHO } from './fotoCampos';

export const MAX_COMENTARIO = 500;

let _fb;
async function fb() {
  if (!_fb) _fb = await import('firebase/firestore');
  return _fb;
}

const commentsCol = (f, pairId) => f.collection(db, 'pairs', pairId, 'photoComments');
const photoRef = (f, pairId, id) => f.doc(f.collection(db, 'pairs', pairId, 'photos'), id);

// Plain text, trimmed, at most MAX_COMENTARIO characters; '' when nothing is left
export function limpiarComentario(text) {
  return String(text || '').trim().slice(0, MAX_COMENTARIO).trim();
}

// createdAt stays a Timestamp (null while our own write waits for the server), so noteWhen words it as in Notas
function comentarioItem(d) {
  const data = d.data() || {};
  return {
    id: d.id,
    photoId: data.photoId || '',
    text: data.text || '',
    identity: data.identity || '',
    createdAt: data.createdAt || null,
    unreadFor: Array.isArray(data.unreadFor) ? data.unreadFor : [],
  };
}

// Oldest first; ours still without a server time go last, where they were just written
export function ordenComentarios(list) {
  return [...list].sort((a, b) => (noteMillis(a) || Infinity) - (noteMillis(b) || Infinity) || (a.id < b.id ? -1 : 1));
}

// The comments of one photo, live. A single `==` and the order in the client: no composite index
export function escucharComentarios(pairId, photoId, onChange, onError) {
  if (!pairId || !photoId || !db) return () => {};
  return listenWhenAuthed(async () => {
    const f = await fb();
    const q = f.query(commentsCol(f, pairId), f.where('photoId', '==', photoId));
    return f.onSnapshot(q, (snap) => onChange(ordenComentarios(snap.docs.map(comentarioItem))), onError);
  }, onError);
}

// The comment and the count on the photo go as two writes, not one batch: offline nobody waits for the ack, and a
// batch would lose the comment too if the photo had been deleted meanwhile (F2). A count left behind only shows
// in the grid; the open viewer counts the comments themselves. Resolves once queued; `committed` is the ack
export async function addComentario(pairId, photoId, text, identity) {
  const body = limpiarComentario(text);
  if (!pairId || !photoId || !db) throw new Error('missing-context');
  if (!body) throw new Error('empty');
  if (!WHO[identity]) throw new Error('bad-identity');
  await whenAuthed();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const ref = f.doc(commentsCol(f, pairId));
  const committed = f.setDoc(ref, {
    photoId,
    text: body,
    identity,
    createdBy: auth.currentUser.uid,
    createdAt: f.serverTimestamp(),
    unreadFor: [identity === 'yo' ? 'ella' : 'yo'],
  });
  committed.catch(() => {});
  f.updateDoc(photoRef(f, pairId, photoId), {
    commentCount: f.increment(1),
    lastCommentAt: f.serverTimestamp(),
    lastCommentBy: identity,
  }).catch(() => {}); // the photo may be gone: the comment stays, and is deleted with it by the server
  return { id: ref.id, committed };
}

// Each one deletes their own (the sheet only offers it on ours)
export async function deleteComentario(pairId, comentario) {
  if (!pairId || !comentario?.id || !db) return;
  await whenAuthed();
  const f = await fb();
  await f.deleteDoc(f.doc(commentsCol(f, pairId), comentario.id));
  if (comentario.photoId) {
    f.updateDoc(photoRef(f, pairId, comentario.photoId), { commentCount: f.increment(-1) }).catch(() => {});
  }
}

// Marks as read the ones already loaded by the viewer (no query of its own: `==` plus array-contains on two fields
// would want a manual index). One write each, so a comment deleted meanwhile does not take the others with it
export async function marcarLeidos(pairId, comentarios, identity) {
  const unread = (comentarios || []).filter((c) => c.unreadFor?.includes(identity));
  if (!pairId || !db || !unread.length) return;
  await whenAuthed();
  const f = await fb();
  await Promise.allSettled(unread.map((c) => f.updateDoc(f.doc(commentsCol(f, pairId), c.id), { unreadFor: f.arrayRemove(identity) })));
}

// Comments still unread by `identity`, across every photo: [{ id, photoId }], and whether that answer is still only
// the cache's (a cold start shows what was there before the server says what has come since; the metadata changes
// are listened to so the server's answer shows up even when it is the same one). A single array-contains (automatic index)
export function escucharNoLeidos(pairId, identity, onChange, onError) {
  if (!pairId || !WHO[identity] || !db) return () => {};
  return listenWhenAuthed(async () => {
    const f = await fb();
    const q = f.query(commentsCol(f, pairId), f.where('unreadFor', 'array-contains', identity));
    return f.onSnapshot(q, { includeMetadataChanges: true }, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, photoId: d.data()?.photoId || '' })), !!snap.metadata?.fromCache), onError);
  }, onError);
}
