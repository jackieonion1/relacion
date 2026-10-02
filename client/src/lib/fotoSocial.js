// What each of the two does with a photo from the viewer: the live photo doc, reactions and favourites.
// Everything lives in the photo doc (photos/{id}): 0 extra reads for the grid, which already gets those fields
import { db, listenWhenAuthed, whenAuthed } from './firebase';
import { photoItem } from './photos';
import { REACCIONES, WHO } from './fotoCampos';

let _fb;
async function fb() {
  if (!_fb) _fb = await import('firebase/firestore');
  return _fb;
}

function photoRef(f, pairId, id) {
  return f.doc(f.collection(db, 'pairs', pairId, 'photos'), id);
}

// The open photo, live: the other's reaction, favourites, takenAt, commentCount, and the footer of a photo that is
// not in the loaded grid. onChange(item | null), null once the photo is gone. Returns the unsubscribe synchronously
export function escucharFoto(pairId, id, onChange, onError) {
  if (!pairId || !id || !db) return () => {};
  return listenWhenAuthed(async () => {
    const f = await fb();
    return f.onSnapshot(photoRef(f, pairId, id), (snap) => onChange(snap.exists() ? photoItem(snap) : null), onError);
  }, onError);
}

// updateDoc, never setDoc with merge: it does not bring back a photo deleted meanwhile. Resolves once the write is
// queued (persistence keeps it offline); `committed` settles with the server ack, like addNote
async function update(pairId, id, data) {
  if (!pairId || !id || !db) throw new Error('missing-context');
  await whenAuthed();
  const f = await fb();
  const committed = f.updateDoc(photoRef(f, pairId, id), data(f));
  committed.catch(() => {}); // callers that ignore it must not raise an unhandled rejection
  return { committed };
}

// One reaction per person (REACCIONES); null takes it away. A map field: the two phones never overwrite each other
export async function setReaccion(pairId, id, identity, emoji) {
  // identity goes into a field path: only the two known ones
  if (!WHO[identity] || (emoji && !REACCIONES.includes(emoji))) throw new Error('bad-reaction');
  return update(pairId, id, (f) => ({ [`reactions.${identity}`]: emoji || f.deleteField() }));
}
