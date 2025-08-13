import { db, auth, authReady } from './firebase';

let _fb;
async function fb() {
  if (!_fb) {
    const mod = await import('firebase/firestore');
    _fb = mod;
  }
  return _fb;
}

async function waitAuth(timeout = 1200) {
  if (!authReady) return;
  try {
    await Promise.race([
      authReady,
      new Promise((res) => setTimeout(res, timeout)),
    ]);
  } catch {}
}

export async function addNote(pairId, { body = '', html = '', plain = '', title = '' }, identity = 'yo', { threadId = '' } = {}) {
  if (!pairId || !db) throw new Error('missing-context');
  await waitAuth();
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
  // Create the note first
  const docRef = await f.addDoc(col, {
    ...base,
    threadId: threadId || null, // may be set in a second step
    unreadFor: [other],
  });
  // If it's a root note, set its own threadId
  if (!threadId) {
    try {
      await f.updateDoc(docRef, { threadId: docRef.id });
    } catch {}
  }
}

export async function updateNote(pairId, id, { body = '', html = '', plain = '', title = '' }) {
  if (!pairId || !db || !id) throw new Error('missing-context');
  await waitAuth();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const ref = f.doc(f.collection(db, 'pairs', pairId, 'notes'), id);
  const payload = {
    ...(body ? { body: String(body || '').trim() } : {}),
    ...(html ? { html: String(html || '') } : {}),
    ...(plain ? { plain: String(plain || '') } : {}),
    ...(title !== undefined ? (String(title).trim() ? { title: String(title).trim() } : { title: f.deleteField ? f.deleteField() : undefined }) : {}),
    updatedAt: f.serverTimestamp(),
  };
  await f.updateDoc(ref, payload);
}

export async function deleteNote(pairId, id) {
  if (!pairId || !id || !db) return;
  await waitAuth();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const ref = f.doc(f.collection(db, 'pairs', pairId, 'notes'), id);
  await f.deleteDoc(ref);
}

export async function listNotes(pairId, { max = 100 } = {}) {
  if (!pairId || !db) return [];
  await waitAuth();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'notes');
  const q = f.query(col, f.orderBy('createdAt', 'desc'), f.limit(max));
  const snap = await f.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listenNotes(pairId, { max = 100 } = {}, onChange) {
  if (!pairId || !db) return () => {};
  await waitAuth();
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
  await waitAuth();
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
  await waitAuth();
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
  await waitAuth();
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
