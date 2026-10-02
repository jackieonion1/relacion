import { auth, db, storage, whenAuthed } from './firebase';
import { getThumb, putThumb, getOrig, putOrig, pruneOrig, deleteThumb, deleteOrig } from './photoCache';
import { splitPage } from './pagination';
import { mapLimit } from './pool';

// Thumbnails resolved at once on a cold cache (each one: getDownloadURL + fetch + IndexedDB write)
const THUMB_CONCURRENCY = 6;

// Helpers
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

// Ensure the original (HD) is cached at most once per Madrid day
export async function prefetchOriginalOncePerDay(pairId, id) {
  if (!pairId || !id) return false;
  const dayKey = madridDayKey();
  const flagKey = `daily-prefetch:${pairId}:${id}:${dayKey}`;
  try {
    if (localStorage.getItem(flagKey) === '1') return false;
  } catch {}
  try {
    // If already cached and non-trivial size, just mark done
    const cached = await getOrig(id);
    if (cached && (!cached.size || cached.size > 32)) {
      try { localStorage.setItem(flagKey, '1'); } catch {}
      return false;
    }
  } catch {}
  // Fetch and cache via existing pipeline
  const blob = await getOriginal(pairId, id);
  if (blob && (!blob.size || blob.size > 32)) {
    try { localStorage.setItem(flagKey, '1'); } catch {}
    return true;
  }
  return false;
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
      const { collection, doc, setDoc, updateDoc, getDoc, getDocs, getCountFromServer, documentId, query, where, orderBy, limit, startAfter, serverTimestamp, deleteDoc, waitForPendingWrites } = await import('firebase/firestore');
      _fb = { ref, uploadBytes, getDownloadURL, deleteObject, collection, doc, setDoc, updateDoc, getDoc, getDocs, getCountFromServer, documentId, query, where, orderBy, limit, startAfter, serverTimestamp, deleteDoc, waitForPendingWrites };
    } catch (e) {
      _fb = null;
    }
  }
  return _fb;
}

// Thumb for one photo doc: cached blob first, else resolve the remote URL and cache it
async function resolveThumbUrl(fblib, pairId, docSnap) {
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
      const { ref, getDownloadURL, collection, doc, updateDoc } = fblib;
      let displayUrl = data?.thumbUrl || '';
      // Accept .firebasestorage.app as correct; treat legacy .appspot.com or missing alt=media as invalid
      const invalid = displayUrl && (/\.appspot\.com\//.test(displayUrl) || displayUrl.indexOf('alt=media') === -1);
      if (!displayUrl || invalid) {
        const tRef = ref(storage, `pairs/${pairId}/photos/${id}/thumb.jpg`);
        displayUrl = await getDownloadURL(tRef);
        try {
          // updateDoc (not setDoc merge): never re-creates a doc that was deleted
          const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
          await updateDoc(dRef, { thumbUrl: displayUrl });
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
  return thumbUrl;
}

export async function listPhotos(pairId, max = 100) {
  const items = [];
  const fblib = await fb();
  if (db && fblib) {
    try {
      await whenAuthed();
      const { collection, getDocs, query, orderBy, limit } = fblib;
      const col = collection(db, 'pairs', pairId, 'photos');
      const q = query(col, orderBy('createdAt', 'desc'), limit(max));
      const snap = await getDocs(q);
      const urls = await mapLimit(snap.docs, THUMB_CONCURRENCY, (docSnap) => resolveThumbUrl(fblib, pairId, docSnap));
      snap.docs.forEach((docSnap, i) => {
        items.push({ id: docSnap.id, thumbUrl: urls[i] || '', createdAt: docSnap.data()?.createdAt?.toMillis?.() || Date.now() });
      });
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

// The item the UI gets for a photo doc (thumbUrl is filled in later). Dates are ms; everything added in 3.1 is
// optional in the doc, so it comes with a neutral default (identity '' on the oldest photos, takenAt null)
export function photoItem(docSnap) {
  const d = docSnap.data() || {};
  return {
    id: docSnap.id,
    thumbUrl: '',
    createdAt: d.createdAt?.toMillis?.() || Date.now(),
    identity: d.identity || '', // who uploaded it ('yo' | 'ella')
    reactions: d.reactions || {}, // { yo?: '💖', ella?: '🥹' }
    favBy: Array.isArray(d.favBy) ? d.favBy : [],
    takenAt: d.takenAt?.toMillis?.() ?? null, // the day it was really taken, when set by hand
    commentCount: Math.max(0, d.commentCount || 0),
    albumIds: Array.isArray(d.albumIds) ? d.albumIds : [],
  };
}

// Resolves the thumbs of `docs` (6 at a time, cached first) into `items[i].thumbUrl`, or reports each one to
// onThumb(id, url) when given. A failed thumb leaves its slot empty
function fillThumbs(fblib, pairId, docs, items, onThumb) {
  return mapLimit(docs, THUMB_CONCURRENCY, async (docSnap, i) => {
    const url = await resolveThumbUrl(fblib, pairId, docSnap);
    if (onThumb) { if (url) onThumb(docSnap.id, url); } else items[i].thumbUrl = url || '';
  });
}

// Photos of any query over the pair's photos, with the same thumb pipeline as the gallery.
// buildQuery(firestoreLib, photosCollection) returns the query, with the functions of firebase/firestore that
// lib/photos loads (collection, query, where, orderBy, limit, startAfter, documentId…); dates go as Date.
// `keep(item)` drops items before their thumbs are resolved. Returns { items } (+ thumbsDone with onThumb, like
// listPhotosPage). Local-only (no Firebase) there are no photos to query: { items: [] }. A failed query throws
export async function listPhotosBy(pairId, buildQuery, { onThumb = null, keep = null } = {}) {
  const fblib = await fb();
  if (!(db && fblib)) return { items: [] };
  if (!(await whenAuthed())) throw Object.assign(new Error('no-auth'), { code: 'no-auth' });
  const snap = await fblib.getDocs(buildQuery(fblib, fblib.collection(db, 'pairs', pairId, 'photos')));
  const docs = [];
  const items = [];
  for (const docSnap of snap.docs) {
    const item = photoItem(docSnap);
    if (!keep || keep(item)) { docs.push(docSnap); items.push(item); }
  }
  const thumbs = fillThumbs(fblib, pairId, docs, items, onThumb);
  if (onThumb) return { items, thumbsDone: thumbs };
  await thumbs;
  return { items };
}

// One page of the gallery, newest first. `cursor` is the last doc of the previous page.
// Returns { items, cursor, hasMore } (+ thumbsDone with onThumb(id, url)). With Firebase a failed page throws,
// the first one too (also with no session after the wait), so the UI tells "could not load" from "empty"
// and can offer a retry.
export async function listPhotosPage(pairId, { pageSize = 60, cursor = null, onThumb = null } = {}) {
  const fblib = await fb();
  if (db && fblib) {
    if (!(await whenAuthed())) throw Object.assign(new Error('no-auth'), { code: 'no-auth' });
    const { collection, getDocs, query, orderBy, limit, startAfter } = fblib;
    const col = collection(db, 'pairs', pairId, 'photos');
    // pageSize + 1 tells us whether there is another page without an empty extra read
    const q = cursor
      ? query(col, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize + 1))
      : query(col, orderBy('createdAt', 'desc'), limit(pageSize + 1));
    const snap = await getDocs(q);
    const { page, hasMore } = splitPage(snap.docs, pageSize);
    const items = page.map(photoItem);
    const nextCursor = page.length ? page[page.length - 1] : cursor;
    const thumbs = fillThumbs(fblib, pairId, page, items, onThumb);
    // With onThumb: return the grid now (empty slots) and report each thumb as it arrives; the caller owns
    // those blob URLs, also the ones arriving after it moved on. Without it: wait and return them filled in
    if (onThumb) return { items, cursor: nextCursor, hasMore, thumbsDone: thumbs };
    await thumbs;
    return { items, cursor: nextCursor, hasMore };
  }
  // Local-only (no Firebase): everything in one page
  const items = [];
  for (const m of readLocalMeta(pairId)) {
    const b = await getThumb(m.id);
    const thumbUrl = b ? URL.createObjectURL(b) : '';
    items.push({ id: m.id, thumbUrl, createdAt: m.createdAt, identity: m.identity || '' });
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { items, cursor: null, hasMore: false };
}

// Europe/Madrid day key (YYYY-MM-DD)
export function madridDayKey(d = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const [dd, mm, yyyy] = fmt.format(d).split('/');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    // Fallback to local timezone if Intl not available
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

// FNV-1a barely changes its high bits when only the last character does (consecutive days), so it is
// finalized with murmur3's fmix32 before being used as a position
function mix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Position (0-based, oldest first) of the day's photo among `count` photos
export function dailyPhotoIndex(pairId, dayKey, count) {
  return mix32(hash32(`${pairId}|${dayKey}`)) % count;
}

// Get or compute the shared daily photo id for today (Europe/Madrid). Writes to Firestore so all devices share it.
export async function getDailyPhotoId(pairId) {
  if (!pairId) return '';
  const fblib = await fb();
  if (!(db && fblib)) return '';
  const dayKey = madridDayKey();
  try {
    await whenAuthed();
  } catch {}
  try {
    const { collection, doc, getDoc, setDoc, getDocs, query, orderBy, limit } = fblib;
    const metaCol = collection(db, 'pairs', pairId, 'meta');
    const metaRef = doc(metaCol, 'dailyPhoto');
    // If already set for today and photo exists, return it
    try {
      const snap = await getDoc(metaRef);
      const data = snap?.exists?.() ? snap.data() : null;
      if (data && data.dayKey === dayKey && data.photoId) {
        const pRef = doc(collection(db, 'pairs', pairId, 'photos'), data.photoId);
        const pSnap = await getDoc(pRef).catch(() => null);
        if (pSnap && pSnap.exists?.()) return data.photoId;
      }
    } catch {}

    // Compute deterministically
    const col = collection(db, 'pairs', pairId, 'photos');
    // Uniform over all photos, with no new field and no writes: count them, take k = hash mod count and read
    // the k-th photo in a total order (createdAt, then id). Counting costs 1 read per 1000 photos and the walk
    // starts from the nearer end, so at most count/2 + 1 documents (once a day per couple, the first to open)
    let count;
    try {
      count = (await fblib.getCountFromServer(col)).data().count;
    } catch {
      // Offline: the newest photo (from cache if need be), not persisted so it cannot override the other phone
      const newest = await getDocs(query(col, orderBy('createdAt', 'desc'), limit(1)));
      return newest.docs[0]?.id || '';
    }
    if (!count) return '';
    const k = dailyPhotoIndex(pairId, dayKey, count);
    const fromEnd = k >= count - 1 - k;
    const dir = fromEnd ? 'desc' : 'asc';
    const steps = (fromEnd ? count - 1 - k : k) + 1;
    const walk = await getDocs(query(col, orderBy('createdAt', dir), orderBy(fblib.documentId(), dir), limit(steps)));
    // Photos without createdAt fall out of the order; if the count ran ahead of them, settle for the last one read
    const chosen = walk.docs[walk.docs.length - 1]?.id;
    if (!chosen) return '';
    // Persist so all devices use the same
    // Not awaited: offline the write only resolves once the server confirms, and Inicio must paint meanwhile
    Promise.resolve(setDoc(metaRef, { dayKey, photoId: chosen, updatedAt: fblib.serverTimestamp ? fblib.serverTimestamp() : new Date() }, { merge: true })).catch(() => {});
    return chosen;
  } catch {
    return '';
  }
}

// Fetch the thumbUrl for a given photo id (regenerates if legacy/invalid)
export async function getPhotoThumbUrl(pairId, id) {
  const fblib = await fb();
  if (!(db && storage && fblib)) return '';
  try {
    await whenAuthed();
    const { collection, doc, getDoc, updateDoc, ref, getDownloadURL } = fblib;
    let url = '';
    try {
      const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
      const dsnap = await getDoc(dRef);
      url = dsnap?.exists?.() && dsnap.data()?.thumbUrl ? dsnap.data().thumbUrl : '';
    } catch {}
    const invalid = url && (/\.appspot\.com\//.test(url) || url.indexOf('alt=media') === -1);
    if (!url || invalid) {
      const tRef = ref(storage, `pairs/${pairId}/photos/${id}/thumb.jpg`);
      const freshUrl = await getDownloadURL(tRef);
      if (freshUrl !== url) {
        try {
          const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
          Promise.resolve(updateDoc(dRef, { thumbUrl: freshUrl })).catch(() => {});
        } catch {}
      }
      url = freshUrl;
    }
    return url || '';
  } catch {
    return '';
  }
}

export async function getOriginal(pairId, id) {
  const cached = await getOrig(id);
  if (cached) return cached;
  const fblib = await fb();
  if (storage && fblib) {
    try {
      await whenAuthed();
      const { ref, getDownloadURL, collection, doc, getDoc, updateDoc } = fblib;
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
          if (freshUrl !== url) {
            try {
              const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
              Promise.resolve(updateDoc(dRef, { origUrl: freshUrl })).catch(() => {});
            } catch {}
          }
          const resp2 = await fetch(freshUrl);
          if (resp2.ok) {
            fetched = await resp2.blob();
          }
        } catch {}
      }
      if (fetched) {
        await putOrig(id, fetched);
        await pruneOrig(20, getPendingIds(pairId));
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
    await whenAuthed();
    const { ref, getDownloadURL, collection, doc, getDoc, updateDoc } = fblib;
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
      const freshUrl = await getDownloadURL(oRef);
      if (freshUrl !== url) {
        try {
          const dRef = doc(collection(db, 'pairs', pairId, 'photos'), id);
          Promise.resolve(updateDoc(dRef, { origUrl: freshUrl })).catch(() => {});
        } catch {}
      }
      url = freshUrl;
    }
    return url || '';
  } catch {
    return '';
  }
}

// Photos cached on this device whose upload is not confirmed yet. The mark is written BEFORE
// uploading and removed only on success, so a hung/offline upload (or a closed app) doesn't lose it.
function pendingKey(pairId) { return `photos:pending:${pairId}`; }
function readPending(pairId) {
  try {
    const arr = JSON.parse(localStorage.getItem(pendingKey(pairId)) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writePending(pairId, arr) {
  try { localStorage.setItem(pendingKey(pairId), JSON.stringify(arr)); } catch {}
}
function addPending(pairId, entry) {
  writePending(pairId, [...readPending(pairId).filter((p) => p.id !== entry.id), entry]);
}
function removePending(pairId, id) {
  writePending(pairId, readPending(pairId).filter((p) => p.id !== id));
}
export function getPendingIds(pairId) {
  return readPending(pairId).map((p) => p.id);
}

// Pending photos as gallery items (thumb from the local cache), newest first
export async function listPendingPhotos(pairId) {
  const items = [];
  for (const p of readPending(pairId)) {
    let thumbUrl = '';
    try {
      const b = await getThumb(p.id);
      if (b) thumbUrl = URL.createObjectURL(b);
    } catch {}
    items.push({ id: p.id, thumbUrl, createdAt: p.createdAt || 0, identity: p.identity || '' });
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return items;
}

// Upload both files and create the doc. Idempotent (same id = same paths and same doc).
// One push per photo at a time: a second caller (retry, StrictMode) joins the one in flight.
// Cancel flag: deletePhoto adds the id to `deletedIds` (in memory, this tab only) and a push that finds it
// there stops before creating the doc. Not the pending mark: writePending swallows storage errors, so a
// missing mark can't be told apart from a photo that never got one.
const inflight = new Map();
const deletedIds = new Set();
function pushRemote(pairId, id, identity, thumbBlob, origBlob) {
  const key = `${pairId}:${id}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const fblib = await fb();
    if (!(db && storage && fblib)) throw new Error('no-firebase');
    // authReady never resolves without a session: bounded wait instead of hanging forever
    await whenAuthed(15000);
    if (!auth?.currentUser) throw new Error('no-auth');
    if (deletedIds.has(id)) throw new Error('cancelled');
    const { ref, uploadBytes, deleteObject, collection, doc, setDoc, serverTimestamp, getDownloadURL } = fblib;
    const base = `pairs/${pairId}/photos/${id}`;
    const tRef = ref(storage, `${base}/thumb.jpg`);
    const oRef = ref(storage, `${base}/orig.jpg`);
    const cacheMeta = { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' };
    let thumbUrlRemote;
    let origUrlRemote;
    try {
      await uploadBytes(tRef, thumbBlob, cacheMeta);
      await uploadBytes(oRef, origBlob, cacheMeta);
      [thumbUrlRemote, origUrlRemote] = await Promise.all([
        getDownloadURL(tRef),
        getDownloadURL(oRef),
      ]);
      if (deletedIds.has(id)) throw new Error('cancelled');
    } catch (e) {
      // Deleted while uploading: deletePhoto may already have removed thumb.jpg, so getDownloadURL
      // can fail before we notice. Either way drop what we uploaded (best effort) and never create the doc
      if (!deletedIds.has(id)) throw e;
      await Promise.allSettled([deleteObject(tRef), deleteObject(oRef)]);
      throw new Error('cancelled');
    }
    await setDoc(doc(collection(db, 'pairs', pairId, 'photos'), id), {
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      identity,
      thumbUrl: thumbUrlRemote,
      origUrl: origUrlRemote,
    });
    removePending(pairId, id);
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Returns { id, thumbUrl, createdAt, pending, error, done? }. `pending` = cached here but not uploaded (yet).
// error 'slow' = still uploading after UPLOAD_WAIT_MS; `done` settles when that upload ends.
const UPLOAD_WAIT_MS = 45 * 1000;
export async function uploadPhoto(pairId, file, identity = 'yo') {
  const id = genId();
  // make derivatives
  const thumbBlob = await resizeToBlob(file, 480, 0.8);
  const origBlob = await resizeToBlob(file, 1600, 0.9);

  // cache locally
  await putThumb(id, thumbBlob);
  await putOrig(id, origBlob);

  const now = Date.now();
  let pending = false;
  let error = null;
  let done = null;

  const fblib = await fb();
  if (db && storage && fblib) {
    // Write-ahead: mark as pending before touching the network
    addPending(pairId, { id, identity, createdAt: now });
    pending = true;
  }
  await pruneOrig(20, getPendingIds(pairId));

  if (pending) {
    if (isOffline()) {
      // Offline uploads don't fail, they hang: leave it pending, it is retried when the network is back
      error = new Error('offline');
    } else {
      // "Online" but useless network: the SDK keeps retrying for minutes. Stop waiting at 45 s without
      // cancelling: the push goes on (joined via `inflight`), the photo stays pending and `done` settles with it
      const push = pushRemote(pairId, id, identity, thumbBlob, origBlob);
      let timer;
      const slow = new Promise((resolve) => { timer = setTimeout(() => resolve('slow'), UPLOAD_WAIT_MS); });
      try {
        if (await Promise.race([push.then(() => 'sent'), slow]) === 'sent') pending = false;
        else {
          error = new Error('slow');
          done = push;
          push.catch(() => {}); // the caller may ignore `done`
        }
      } catch (e) {
        error = e; // stays pending, we already cached locally
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // Deleted meanwhile (also while the doc write waited for the server, or after a network error): nothing to
  // show, and it must not come back into the local meta
  if (deletedIds.has(id)) return { id, cancelled: true };

  // local meta
  const meta = readLocalMeta(pairId);
  meta.push({ id, createdAt: now, identity });
  writeLocalMeta(pairId, meta);

  return { id, thumbUrl: URL.createObjectURL(thumbBlob), createdAt: now, pending, error, ...(done ? { done } : {}) };
}

// Try again every pending photo of this pair. Returns { sent, failed, lost, offline, queued }.
// `lost` = the local copy is gone (cannot be recovered, the user has to pick it again).
// `queued` = ids whose write is already in the SDK queue waiting for the server (see confirmQueued).
let retryRun = null;
export function retryPendingPhotos(pairId) {
  if (retryRun) return retryRun;
  retryRun = (async () => {
    const result = { sent: 0, failed: 0, lost: 0, offline: false, queued: [] };
    const pending = readPending(pairId);
    if (!pending.length) return result;
    if (isOffline()) { result.offline = true; result.failed = pending.length; return result; }
    const fblib = await fb();
    if (!(db && storage && fblib)) { result.failed = pending.length; return result; }
    await whenAuthed(15000);
    const { collection, doc, getDoc } = fblib;
    for (const p of pending) {
      if (deletedIds.has(p.id)) { removePending(pairId, p.id); continue; } // deleted after the snapshot above
      // Still uploading (uploadPhoto stopped waiting at 45 s): joining it would hold this retry for minutes
      if (inflight.has(`${pairId}:${p.id}`)) continue;
      try {
        // The write may have gone through and only the mark survived: check before uploading again
        const snap = await getDoc(doc(collection(db, 'pairs', pairId, 'photos'), p.id));
        if (snap.exists()) {
          if (snap.metadata?.hasPendingWrites) { result.queued.push(p.id); continue; } // queued, not acknowledged yet
          removePending(pairId, p.id);
          result.sent += 1;
          continue;
        }
        const [thumbBlob, origBlob] = await Promise.all([getThumb(p.id), getOrig(p.id)]);
        if (!thumbBlob || !origBlob) {
          removePending(pairId, p.id);
          result.lost += 1;
          continue;
        }
        await pushRemote(pairId, p.id, p.identity || 'yo', thumbBlob, origBlob);
        result.sent += 1;
      } catch (e) {
        if (e?.message !== 'cancelled') result.failed += 1; // deleted while uploading: nothing to retry
      }
    }
    return result;
  })().finally(() => { retryRun = null; });
  return retryRun;
}

// Waits for the server to acknowledge the queued writes and drops the pending mark of those `ids`.
// Returns how many were confirmed. Offline it just stays waiting.
export async function confirmQueued(pairId, ids) {
  const fblib = await fb();
  if (!(db && fblib && ids?.length)) return 0;
  try {
    await fblib.waitForPendingWrites(db);
    let n = 0;
    for (const id of ids) {
      const snap = await fblib.getDoc(fblib.doc(fblib.collection(db, 'pairs', pairId, 'photos'), id));
      if (snap.exists() && !snap.metadata?.hasPendingWrites) { removePending(pairId, id); n += 1; }
    }
    return n;
  } catch {
    return 0;
  }
}

// The comments of a deleted photo (pairs/{p}/photoComments, 3.1) go with it, or their unread mark would keep the dot
// on «Galería» for good. Best effort and never throws: the photo is deleted whatever happens here
async function deleteComments({ collection, query, where, getDocs, deleteDoc }, pairId, id) {
  try {
    const snap = await getDocs(query(collection(db, 'pairs', pairId, 'photoComments'), where('photoId', '==', id)));
    await Promise.allSettled((snap?.docs || []).map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.warn('Comments delete failed (orphan comments left):', e);
  }
}

// Delete photo from Firestore, Storage and local cache/meta.
// Local state goes first, before any network await: offline the server calls don't resolve, and a
// pending mark left behind would make the retry upload the deleted photo again. The tombstone makes an
// upload in flight stop before creating the doc (see pushRemote).
// Then doc first: if that fails we throw. A Storage object left without a doc is harmless; a doc
// without its object would show up broken.
export async function deletePhoto(pairId, id) {
  deletedIds.add(id);
  removePending(pairId, id);
  try {
    const meta = readLocalMeta(pairId).filter((m) => m.id !== id);
    writeLocalMeta(pairId, meta);
  } catch {}
  try { await deleteThumb(id); } catch {}
  try { await deleteOrig(id); } catch {}

  const fblib = await fb();
  try {
    await whenAuthed();
  } catch {}

  if (db && storage && fblib) {
    const { ref, deleteObject, collection, doc, deleteDoc } = fblib;
    deleteComments(fblib, pairId, id); // not awaited: offline the query would hold the photo's own delete
    await deleteDoc(doc(collection(db, 'pairs', pairId, 'photos'), id));
    const base = `pairs/${pairId}/photos/${id}`;
    const results = await Promise.allSettled([
      deleteObject(ref(storage, `${base}/thumb.jpg`)),
      deleteObject(ref(storage, `${base}/orig.jpg`)),
    ]);
    // Missing objects are fine (e.g. a photo that never finished uploading); anything else is only logged:
    // the photo is already gone for the user
    results.forEach((r) => {
      if (r.status === 'rejected' && r.reason?.code !== 'storage/object-not-found') {
        console.warn('Storage delete failed (orphan object left):', r.reason);
      }
    });
  }
}
