import { db, auth, whenAuthed, listenWhenAuthed } from './firebase';

export async function getMapState() {
  try {
    const pairId = localStorage.getItem('pairId') || '';
    if (!pairId || !db) return 'home';
    
    // Bounded wait: without a session this falls back to the local copy instead of "Cargando…" forever
    await whenAuthed();
    if (!auth?.currentUser) return localStorage.getItem('mapState') || 'home';

    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'pairs', pairId, 'mapState', 'current'));
    
    if (snap.exists()) {
      const data = snap.data();
      return data.state || 'home';
    }
    
    return 'home';
  } catch (e) {
    console.error('Error getting map state:', e);
    return localStorage.getItem('mapState') || 'home';
  }
}

// Resolves once the write is queued (persistence keeps it offline) and returns { committed }, which settles
// with the server ack; it also rejects if the write could not even be queued (e.g. no session)
export async function setMapState(state) {
  // Save locally first
  try { localStorage.setItem('mapState', state); } catch {}
  let committed;
  try {
    const pairId = localStorage.getItem('pairId') || '';
    if (!pairId || !db) return { committed: Promise.resolve() };

    await whenAuthed();
    if (!auth?.currentUser) throw new Error('no-auth');

    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    committed = setDoc(
      doc(db, 'pairs', pairId, 'mapState', 'current'),
      {
        state,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid
      },
      { merge: true }
    );
  } catch (e) {
    committed = Promise.reject(e);
  }
  committed.catch((e) => console.error('Error setting map state:', e)); // no unhandled rejection for callers that ignore it
  return { committed };
}

// Returns the unsubscribe synchronously; without a session yet it keeps waiting and subscribes when it arrives
export function subscribeToMapState(callback) {
  const pairId = localStorage.getItem('pairId') || '';
  if (!pairId || !db) return () => {};
  return listenWhenAuthed(async () => {
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'pairs', pairId, 'mapState', 'current'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const state = data.state || 'home';
          localStorage.setItem('mapState', state);
          callback(state);
        }
      },
      (error) => {
        console.error('Error listening to map state:', error);
      }
    );
  }, (e) => console.warn('Map state listener:', e?.code || e?.message || e));
}
