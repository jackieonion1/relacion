import { auth, db, storage, authReady } from './firebase';
import { getThumb, putThumb, getOrig, putOrig, pruneOrig, deleteThumb, deleteOrig } from './photoCache';

// Helpers
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

async function fileToCanvas(file) {
  const img = document.createElement('img');
  img.decoding = 'async';
  img.loading = 'eager';
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
  } finally {
    URL.revokeObjectURL(url);
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return { img, canvas, ctx };
}

function drawContain(img, max) {
  const ratio = Math.min(max / img.width, max / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  return { w, h };
}

// Wait for anonymous auth to be ready (avoid first-operation race)
async function waitAuth(timeout = 1200) {
  if (!authReady) return;
  try {
    await Promise.race([
      authReady,
      new Promise((resolve) => setTimeout(resolve, timeout)),
    ]);
  } catch {}
}

async function resizeToBlob(file, maxSize, quality = 0.85) {
  const { img, canvas, ctx } = await fileToCanvas(file);
  const { w, h } = drawContain(img, maxSize);
  canvas.width = w; canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob;
}

// Local fallback store for metadata
function localKey(pairId) { return `photos:${pairId}`; }
function readLocalMeta(pairId) {
  try { return JSON.parse(localStorage.getItem(localKey(pairId)) || '[]'); } catch { return []; }
}
function writeLocalMeta(pairId, arr) {
  try { localStorage.setItem(localKey(pairId), JSON.stringify(arr)); } catch {}
}

// Firebase imports lazy to avoid bundling when not needed
let _fb;
async function fb() {
  if (!_fb) {
    try {
      const { ref, uploadBytes, getDownloadURL, deleteObject } = await import('firebase/storage');
      const { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit, serverTimestamp, deleteDoc } = await import('firebase/firestore');
      _fb = { ref, uploadBytes, getDownloadURL, deleteObject, collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit, serverTimestamp, deleteDoc };
    } catch (e) {
      _fb = null;
    }
  }
  return _fb;
}

export async function listPhotos(pairId, max = 100) {
  const items = [];
  const fblib = await fb();
  if (db && fblib) {
    try {
      await waitAuth();
      const { collection, getDocs, query, orderBy, limit } = fblib;
      const col = collection(db, 'pairs', pairId, 'photos');
      const q = query(col, orderBy('createdAt', 'desc'), limit(max));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        const id = docSnap.id;
        const data = docSnap.data();
        // try cached thumb first
        let thumbUrl = '';
        const blob = await getThumb(id);
        if (blob) {
          thumbUrl = URL.createObjectURL(blob);
        } else {
          // No cached blob: resolve a correct remote URL, then try to fetch to blob immediately.
          try {
            const { ref, getDownloadURL, collection, doc, setDoc } = fblib;
            let displayUrl = data?.thumbUrl || '';
            // Accept .firebasestorage.app as correct; treat legacy .appspot.com or missing alt=media as invalid
            const invalid = displayUrl && (/\.appspot\.com\//.test(displayUrl) || displayUrl.indexOf('alt=media') === -1);
            if (!displayUrl || invalid) {
              const tRef = ref(storage, `pairs/${pairId}/photos/${id}/thumb.jpg`);
              displayUrl = await getDownloadURL(tRef);
              try {
                const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
                await setDoc(dRef, { thumbUrl: displayUrl }, { merge: true });
              } catch {}
            }
            // Try to fetch the remote URL into a Blob so we can use a blob: URL (more reliable on iOS)
            try {
              const resp = await fetch(displayUrl, { mode: 'cors', cache: 'force-cache' });
              if (resp.ok) {
                const b = await resp.blob();
                await putThumb(id, b);
                thumbUrl = URL.createObjectURL(b);
              } else {
                thumbUrl = displayUrl;
              }
            } catch {
              // Fallback to remote URL if CORS blocks fetch
              thumbUrl = displayUrl;
            }
          } catch {}
        }
        items.push({ id, thumbUrl, createdAt: data?.createdAt?.toMillis?.() || Date.now() });
      }
      return items;
    } catch (e) {
      // Fall back to local
    }
  }
  // Local-only
  const meta = readLocalMeta(pairId);
  for (const m of meta) {
    const b = await getThumb(m.id);
    const thumbUrl = b ? URL.createObjectURL(b) : '';
    items.push({ id: m.id, thumbUrl, createdAt: m.createdAt });
  }
  // Sort desc by createdAt
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return items.slice(0, max);
}

export async function getOriginal(pairId, id) {
  const cached = await getOrig(id);
  if (cached) return cached;
  const fblib = await fb();
  if (storage && fblib) {
    try {
      await waitAuth();
      const { ref, getDownloadURL, collection, doc, getDoc, setDoc } = fblib;
      // Prefer URL saved in Firestore (works across users)
      let url = '';
      try {
        const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
        const dsnap = await getDoc(dRef);
        url = dsnap?.exists?.() && dsnap.data()?.origUrl ? dsnap.data().origUrl : '';
      } catch {}

      // Try to fetch using saved URL first
      let fetched = null;
      if (url) {
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            fetched = await resp.blob();
          }
        } catch {}
      }
      // Fallback to generating a fresh URL from Storage (handles wrong/expired URLs)
      if (!fetched) {
        try {
          const oRef = ref(storage, `pairs/${pairId}/photos/${id}/orig.jpg`);
          const freshUrl = await getDownloadURL(oRef);
          try {
            const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
            await setDoc(dRef, { origUrl: freshUrl }, { merge: true });
          } catch {}
          const resp2 = await fetch(freshUrl);
          if (resp2.ok) {
            fetched = await resp2.blob();
          }
        } catch {}
      }
      if (fetched) {
        await putOrig(id, fetched);
        await pruneOrig(20);
        return fetched;
      }
    } catch {}
  }
  return null;
}

// Get a remote URL for the original image (no fetch), for online viewing fallback
export async function getOriginalUrl(pairId, id) {
  const fblib = await fb();
  if (!(storage && fblib)) return '';
  try {
    await waitAuth();
    const { ref, getDownloadURL, collection, doc, getDoc, setDoc } = fblib;
    let url = '';
    try {
      const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
      const dsnap = await getDoc(dRef);
      url = dsnap?.exists?.() && dsnap.data()?.origUrl ? dsnap.data().origUrl : '';
    } catch {}
    // Accept .firebasestorage.app; treat legacy .appspot.com or missing alt=media as invalid
    const invalid = url && (/\.appspot\.com\//.test(url) || url.indexOf('alt=media') === -1);
    if (!url || invalid) {
      const oRef = ref(storage, `pairs/${pairId}/photos/${id}/orig.jpg`);
      url = await getDownloadURL(oRef);
      try {
        const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
        await setDoc(dRef, { origUrl: url }, { merge: true });
      } catch {}
    }
    return url || '';
  } catch {
    return '';
  }
}

export async function uploadPhoto(pairId, file, identity = 'yo') {
  const id = genId();
  // make derivatives
  const thumbBlob = await resizeToBlob(file, 480, 0.8);
  const origBlob = await resizeToBlob(file, 1600, 0.9);

  // cache locally
  await putThumb(id, thumbBlob);
  await putOrig(id, origBlob);
  await pruneOrig(20);

  const now = Date.now();
  let remoteOk = false;

  const fblib = await fb();
  if (db && storage && fblib) {
    try {
      if (authReady) await authReady;
      if (!auth?.currentUser) throw new Error('no-auth');
      const { ref, uploadBytes, collection, doc, setDoc, serverTimestamp, getDownloadURL } = fblib;
      const base = `pairs/${pairId}/photos/${id}`;
      const tRef = ref(storage, `${base}/thumb.jpg`);
      const oRef = ref(storage, `${base}/orig.jpg`);
      const cacheMeta = { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' };
      await uploadBytes(tRef, thumbBlob, cacheMeta);
      await uploadBytes(oRef, origBlob, cacheMeta);
      const [thumbUrlRemote, origUrlRemote] = await Promise.all([
        getDownloadURL(tRef),
        getDownloadURL(oRef),
      ]);
      await setDoc(doc(collection(db, 'pairs', pairId, 'photos'), id), {
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        identity,
        thumbUrl: thumbUrlRemote,
        origUrl: origUrlRemote,
      });
      remoteOk = true;
    } catch (e) {
      // ignore, we already cached locally
    }
  }

  // local meta
  const meta = readLocalMeta(pairId);
  meta.push({ id, createdAt: now, identity });
  writeLocalMeta(pairId, meta);

  return { id, thumbUrl: URL.createObjectURL(thumbBlob), createdAt: now, remote: remoteOk };
}

// Delete photo from Storage, Firestore and local cache/meta
export async function deletePhoto(pairId, id) {
  const fblib = await fb();
  try {
    await waitAuth();
  } catch {}

  if (db && storage && fblib) {
    try {
      const { ref, deleteObject, collection, doc, deleteDoc } = fblib;
      const base = `pairs/${pairId}/photos/${id}`;
      const tRef = ref(storage, `${base}/thumb.jpg`);
      const oRef = ref(storage, `${base}/orig.jpg`);
      await Promise.all([
        deleteObject(tRef).catch(() => {}),
        deleteObject(oRef).catch(() => {}),
      ]);
      await deleteDoc(doc(collection(db, 'pairs', pairId, 'photos'), id)).catch(() => {});
    } catch (e) {
      // proceed to local cleanup even if remote fails
      console.warn('Remote delete failed or partial:', e);
    }
  }

  // Local cache cleanup
  try { await deleteThumb(id); } catch {}
  try { await deleteOrig(id); } catch {}
  // Local meta cleanup
  try {
    const meta = readLocalMeta(pairId).filter((m) => m.id !== id);
    writeLocalMeta(pairId, meta);
  } catch {}
}
