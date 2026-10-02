import { db, auth, whenAuthed } from './firebase';

// Ajustes › Dispositivos: who is in the pair and whether it is locked. Reads go through the rules (members only);
// every change goes through a callable, since the client can't write members nor the pair doc

let _fb;
async function fb() {
  if (!_fb) {
    const mod = await import('firebase/firestore');
    _fb = mod;
  }
  return _fb;
}

async function call(name, data) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const fn = httpsCallable(getFunctions(undefined, 'europe-southwest1'), name);
  return (await fn(data)).data;
}

// { locked, members: [{ uid, label, joinedAt (ms), me }] }, oldest first
export async function getPairInfo(pairId) {
  if (!pairId || !db) return { locked: false, members: [] };
  await whenAuthed();
  const f = await fb();
  const [pair, snap] = await Promise.all([
    f.getDoc(f.doc(db, 'pairs', pairId)),
    f.getDocs(f.collection(db, 'pairs', pairId, 'members')),
  ]);
  const me = auth?.currentUser?.uid || '';
  const members = snap.docs
    .map((d) => ({ uid: d.id, label: d.data().label || '', joinedAt: d.data().joinedAt?.toMillis?.() || 0, me: d.id === me }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return { locked: pair.exists() && pair.data().locked === true, members };
}

// { code, expiresAt (ms) }
export const createInvite = (pairId) => call('createInvite', { pairId });
export const lockPair = (pairId) => call('lockPair', { pairId });
export const removeMember = (pairId, uid) => call('removeMember', { pairId, uid });
