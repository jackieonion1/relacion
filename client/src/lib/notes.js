import { db, auth, whenAuthed } from './firebase';

let _fb;
async function fb() {
  if (!_fb) {
    const mod = await import('firebase/firestore');
    _fb = mod;
  }
  return _fb;
}

export async function addNote(pairId, { body = '', html = '', plain = '', title = '' }, identity = 'yo', { threadId = '' } = {}) {
  if (!pairId || !db) throw new Error('missing-context');
  await whenAuthed();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const other = identity === 'yo' ? 'ella' : 'yo';
  const base = {
    // Keep body for legacy markdown notes; prefer html for new WYSIWYG notes
    ...(body ? { body: String(body || '').trim() } : {}),
    ...(html ? { html: String(html || '') } : {}),
    ...(plain ? { plain: String(plain || '') } : {}),
    ...(title && String(title).trim() ? { title: String(title).trim() } : {}),
    createdAt: f.serverTimestamp(),
    createdBy: auth.currentUser.uid,
    identity,
  };
  const col = f.collection(db, 'pairs', pairId, 'notes');
  // Single write: a root note is its own thread, so the id is known up front
  const docRef = f.doc(col);
  await f.setDoc(docRef, {
    ...base,
    threadId: threadId || docRef.id,
    unreadFor: [other],
  });
}

export async function deleteNote(pairId, id) {
  if (!pairId || !id || !db) return;
  await whenAuthed();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const ref = f.doc(f.collection(db, 'pairs', pairId, 'notes'), id);
  await f.deleteDoc(ref);
}

export async function listNotes(pairId, { max = 100 } = {}) {
  if (!pairId || !db) return [];
  await whenAuthed();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'notes');
  const q = f.query(col, f.orderBy('createdAt', 'desc'), f.limit(max));
  const snap = await f.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listenNotes(pairId, { max = 100 } = {}, onChange) {
  if (!pairId || !db) return () => {};
  await whenAuthed();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'notes');
  const q = f.query(col, f.orderBy('createdAt', 'desc'), f.limit(max));
  return f.onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange(list);
  });
}

export async function markThreadRead(pairId, threadId, identity) {
  if (!pairId || !db || !threadId) return;
  await whenAuthed();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'notes');
  const q = f.query(
    col,
    f.where('threadId', '==', threadId),
    f.where('unreadFor', 'array-contains', identity)
  );
  const snap = await f.getDocs(q);
  if (snap.empty) return;
  const batch = f.writeBatch(db);
  snap.forEach((doc) => {
    const ref = f.doc(col, doc.id);
    batch.update(ref, { unreadFor: f.arrayRemove(identity) });
  });
  await batch.commit();
}

export async function markNoteRead(pairId, noteId, identity) {
  if (!pairId || !db || !noteId) return;
  await whenAuthed();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const col = f.collection(db, 'pairs', pairId, 'notes');
  const ref = f.doc(col, noteId);
  try {
    await f.updateDoc(ref, { unreadFor: f.arrayRemove(identity) });
  } catch {}
}

export async function deleteThread(pairId, threadId) {
  if (!pairId || !db || !threadId) return;
  await whenAuthed();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'notes');
  const q = f.query(col, f.where('threadId', '==', threadId));
  const snap = await f.getDocs(q);
  if (snap.empty) return;
  const batch = f.writeBatch(db);
  snap.forEach((doc) => {
    const ref = f.doc(col, doc.id);
    batch.delete(ref);
  });
  await batch.commit();
}
