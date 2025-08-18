import { auth, db, storage, authReady } from './firebase';
import { getOrig, putOrig, pruneOrig, deleteOrig } from './audioCache';

// Helpers
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

// Subtitles API
export async function uploadSubtitles(pairId, id, file) {
  if (!pairId || !id || !file) return false;
  const fblib = await fb();
  const ext = ((file.name || '').split('.').pop() || '').toLowerCase();
  const type = ext || 'txt';
  // Save local copy (text only)
  try {
    const text = await file.text();
    writeLocalSubs(pairId, id, { type, text, name: file.name || `subs.${type}` });
  } catch {}
  if (db && storage && fblib) {
    try {
      await waitAuth();
      const { ref, uploadBytes, getDownloadURL, collection, doc, setDoc } = fblib;
      const base = `pairs/${pairId}/music/${id}`;
      const sRef = ref(storage, `${base}/subs.${type}`);
      const meta = { contentType: 'text/plain; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' };
      await uploadBytes(sRef, file, meta);
      const url = await getDownloadURL(sRef);
      await setDoc(doc(collection(db, 'pairs', pairId, 'music'), id), { subsUrl: url, subsType: type, subsName: file.name || `subs.${type}` }, { merge: true });
      return true;
    } catch {
      // ignore network errors, local cache exists
    }
  }
  return true;
}

export async function getSubtitles(pairId, id) {
  const local = readLocalSubs(pairId, id);
  if (local && local.text) return local;
  const fblib = await fb();
  if (db && fblib) {
    try {
      await waitAuth();
      const { collection, doc, getDoc } = fblib;
      const dRef = doc(collection(db, 'pairs', pairId, 'music'), id);
      const snap = await getDoc(dRef);
      const data = snap?.exists?.() ? snap.data() : null;
      const url = data?.subsUrl || '';
      const type = data?.subsType || '';
      const name = data?.subsName || '';
      if (url) {
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            const text = await resp.text();
            writeLocalSubs(pairId, id, { type, text, name });
            return { type, text, name };
          }
        } catch {}
      }
    } catch {}
  }
  return { type: '', text: '', name: '' };
}

export async function renameMusic(pairId, id, name) {
  const fblib = await fb();
  if (db && fblib) {
    try {
      await waitAuth();
      const { collection, doc, setDoc } = fblib;
      await setDoc(doc(collection(db, 'pairs', pairId, 'music'), id), { name }, { merge: true });
    } catch (e) {
      // ignore remote error; still update local
    }
  }
  try {
    const meta = readLocalMeta(pairId);
    const idx = meta.findIndex(m => m.id === id);
    if (idx !== -1) {
      meta[idx] = { ...meta[idx], name };
      writeLocalMeta(pairId, meta);
    }
  } catch {}
}

async function probeDuration(fileOrBlob) {
  // First try via HTMLAudioElement metadata
  const viaTag = await new Promise((resolve) => {
    try {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      const url = URL.createObjectURL(fileOrBlob);
      const cleanup = () => { try { URL.revokeObjectURL(url); } catch {} };
      audio.onloadedmetadata = () => {
        const secs = isFinite(audio.duration) ? Math.max(0, audio.duration) : 0;
        cleanup();
        resolve(Math.round(secs));
      };
      audio.onerror = () => { cleanup(); resolve(0); };
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
  if (viaTag && viaTag > 0) return viaTag;
  // Fallback: decode with WebAudio for reliable duration (works for most formats)
  try {
    const AC = (window.AudioContext || window.webkitAudioContext);
    if (!AC) return 0;
    const ctx = new AC({ latencyHint: 'interactive' });
    const buf = await fileOrBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    try { ctx.close(); } catch {}
    if (!decoded) return 0;
    const secs = Math.max(0, decoded.duration || 0);
    return Math.round(secs);
  } catch {
    return 0;
  }
}

// Local fallback store for metadata
function localKey(pairId) { return `music:${pairId}`; }
function readLocalMeta(pairId) {
  try { return JSON.parse(localStorage.getItem(localKey(pairId)) || '[]'); } catch { return []; }
}
function writeLocalMeta(pairId, arr) {
  try { localStorage.setItem(localKey(pairId), JSON.stringify(arr)); } catch {}
}

// Local lyrics helpers
function localLyricsKey(pairId, id) { return `music_lyrics:${pairId}:${id}`; }
function readLocalLyrics(pairId, id) {
  try { return localStorage.getItem(localLyricsKey(pairId, id)) || ''; } catch { return ''; }
}
function writeLocalLyrics(pairId, id, text) {
  try { localStorage.setItem(localLyricsKey(pairId, id), text || ''); } catch {}
}

// Local subtitles helpers
function localSubsKey(pairId, id) { return `music_subs:${pairId}:${id}`; }
function readLocalSubs(pairId, id) {
  try {
    const raw = localStorage.getItem(localSubsKey(pairId, id));
    return raw ? JSON.parse(raw) : null; // { type, text, name }
  } catch { return null; }
}
function writeLocalSubs(pairId, id, obj) {
  try { localStorage.setItem(localSubsKey(pairId, id), JSON.stringify(obj || {})); } catch {}
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

export async function listMusic(pairId, max = 100) {
  const items = [];
  const fblib = await fb();
  if (db && fblib) {
    try {
      await waitAuth();
      const { collection, getDocs, query, orderBy, limit } = fblib;
      const col = collection(db, 'pairs', pairId, 'music');
      const q = query(col, orderBy('createdAt', 'desc'), limit(max));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        const id = docSnap.id;
        const data = docSnap.data();
        items.push({ id, name: data?.name || id, createdAt: data?.createdAt?.toMillis?.() || Date.now(), duration: data?.duration || 0 });
      }
      // Merge with local meta (to show unsynced uploads if remote write failed)
      const local = readLocalMeta(pairId);
      const byId = new Map(items.map((x) => [x.id, x]));
      for (const m of local) {
        if (!byId.has(m.id)) {
          byId.set(m.id, { id: m.id, name: m.name || m.id, createdAt: m.createdAt, duration: m.duration || 0 });
        }
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return merged.slice(0, max);
    } catch (e) {
      // Fall through to local
    }
  }
  // Local-only
  const meta = readLocalMeta(pairId);
  for (const m of meta) {
    items.push({ id: m.id, name: m.name || m.id, createdAt: m.createdAt, duration: m.duration || 0 });
  }
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
      let url = '';
      try {
        const dRef = doc(collection(db, 'pairs', pairId, 'music'), id);
        const dsnap = await getDoc(dRef);
        url = dsnap?.exists?.() && dsnap.data()?.origUrl ? dsnap.data().origUrl : '';
      } catch {}
      // Treat legacy/invalid URLs as missing so we regenerate
      const invalid = url && (/\.appspot\.com\//.test(url) || url.indexOf('alt=media') === -1);
      let fetched = null;
      if (url && !invalid) {
        try {
          const resp = await fetch(url);
          if (resp.ok) fetched = await resp.blob();
        } catch {}
      }
      if (!fetched) {
        try {
          const oRef = ref(storage, `pairs/${pairId}/music/${id}/orig`);
          const freshUrl = await getDownloadURL(oRef);
          try {
            const dRef = doc(collection(db, 'pairs', pairId, 'music'), id);
            await setDoc(dRef, { origUrl: freshUrl }, { merge: true });
          } catch {}
          const resp2 = await fetch(freshUrl);
          if (resp2.ok) fetched = await resp2.blob();
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

export async function getOriginalUrl(pairId, id) {
  const fblib = await fb();
  if (!(storage && fblib)) return '';
  try {
    await waitAuth();
    const { ref, getDownloadURL, collection, doc, getDoc, setDoc } = fblib;
    let url = '';
    try {
      const dRef = doc(collection(db, 'pairs', pairId, 'music'), id);
      const dsnap = await getDoc(dRef);
      url = dsnap?.exists?.() && dsnap.data()?.origUrl ? dsnap.data().origUrl : '';
    } catch {}
    // Regenerate if legacy/invalid
    const invalid = url && (/\.appspot\.com\//.test(url) || url.indexOf('alt=media') === -1);
    if (!url || invalid) {
      const oRef = ref(storage, `pairs/${pairId}/music/${id}/orig`);
      url = await getDownloadURL(oRef);
      try {
        const dRef = doc(collection(db, 'pairs', pairId, 'music'), id);
        await setDoc(dRef, { origUrl: url }, { merge: true });
      } catch {}
    }
    return url || '';
  } catch {
    return '';
  }
}

export async function uploadMusic(pairId, file, identity = 'yo') {
  const id = genId();
  const origBlob = file; // no processing
  const duration = await probeDuration(file).catch(() => 0);
  // Display name without extension (keep original file untouched)
  const displayName = (file?.name || id).replace(/\.[^/.]+$/, '');

  // cache locally
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
      const base = `pairs/${pairId}/music/${id}`;
      const oRef = ref(storage, `${base}/orig`);
      const cacheMeta = { contentType: file.type || 'audio/mpeg', cacheControl: 'public, max-age=31536000, immutable' };
      await uploadBytes(oRef, origBlob, cacheMeta);
      const origUrlRemote = await getDownloadURL(oRef);
      await setDoc(doc(collection(db, 'pairs', pairId, 'music'), id), {
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        identity,
        name: displayName,
        mime: file.type || '',
        size: file.size || 0,
        duration,
        origUrl: origUrlRemote,
      });
      remoteOk = true;
    } catch (e) {
      // ignore, we already cached locally
    }
  }

  // local meta
  const meta = readLocalMeta(pairId);
  meta.push({ id, createdAt: now, identity, name: displayName, duration });
  writeLocalMeta(pairId, meta);

  return { id, name: displayName, createdAt: now, duration, remote: remoteOk };
}

export async function deleteMusic(pairId, id) {
  const fblib = await fb();
  try {
    await waitAuth();
  } catch {}

  if (db && storage && fblib) {
    try {
      const { ref, deleteObject, collection, doc, deleteDoc } = fblib;
      const base = `pairs/${pairId}/music/${id}`;
      const oRef = ref(storage, `${base}/orig`);
      await deleteObject(oRef).catch(() => {});
      await deleteDoc(doc(collection(db, 'pairs', pairId, 'music'), id)).catch(() => {});
    } catch (e) {
      // proceed to local cleanup even if remote fails
      console.warn('Remote delete (music) failed or partial:', e);
    }
  }

  // Local cache cleanup
  try { await deleteOrig(id); } catch {}
  // Local meta cleanup
  try {
    const meta = readLocalMeta(pairId).filter((m) => m.id !== id);
    writeLocalMeta(pairId, meta);
  } catch {}
}

// Lyrics API
export async function setLyrics(pairId, id, text) {
  writeLocalLyrics(pairId, id, text || '');
  const fblib = await fb();
  if (db && fblib) {
    try {
      await waitAuth();
      const { collection, doc, setDoc } = fblib;
      await setDoc(doc(collection(db, 'pairs', pairId, 'music'), id), { lyrics: text || '' }, { merge: true });
    } catch {}
  }
}

export async function getLyrics(pairId, id) {
  const local = readLocalLyrics(pairId, id);
  if (local) return local;
  const fblib = await fb();
  if (db && fblib) {
    try {
      await waitAuth();
      const { collection, doc, getDoc } = fblib;
      const dRef = doc(collection(db, 'pairs', pairId, 'music'), id);
      const snap = await getDoc(dRef);
      const text = snap?.exists?.() ? (snap.data()?.lyrics || '') : '';
      if (text) writeLocalLyrics(pairId, id, text);
      return text;
    } catch {}
  }
  return '';
}
