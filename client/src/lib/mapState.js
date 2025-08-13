import { db, auth, authReady } from './firebase';

export async function getMapState() {
  try {
    const pairId = localStorage.getItem('pairId') || '';
    if (!pairId || !db) return 'home';
    
    if (authReady) await authReady;
    if (!auth?.currentUser) return 'home';
    
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

export async function setMapState(state) {
  try {
    // Save locally first
    localStorage.setItem('mapState', state);
    
    const pairId = localStorage.getItem('pairId') || '';
    if (!pairId || !db) return;
    
    if (authReady) await authReady;
    if (!auth?.currentUser) return;
    
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    await setDoc(
      doc(db, 'pairs', pairId, 'mapState', 'current'),
      {
        state,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid
      },
      { merge: true }
    );
  } catch (e) {
    console.error('Error setting map state:', e);
    // Still save locally even if Firestore fails
    localStorage.setItem('mapState', state);
  }
}

export function subscribeToMapState(callback) {
  let unsubscribe = () => {};
  
  (async () => {
    try {
      const pairId = localStorage.getItem('pairId') || '';
      if (!pairId || !db) return;
      
      if (authReady) await authReady;
      if (!auth?.currentUser) return;
      
      const { doc, onSnapshot } = await import('firebase/firestore');
      unsubscribe = onSnapshot(
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
    } catch (e) {
      console.error('Error subscribing to map state:', e);
    }
  })();
  
  return () => unsubscribe();
}
