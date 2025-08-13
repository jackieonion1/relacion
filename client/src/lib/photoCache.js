// Simple IndexedDB-based photo cache with LRU for standard images
const DB_NAME = 'photo-cache-v1';
const DB_VERSION = 2;
const THUMBS = 'thumbs';
const ORIG = 'orig';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(THUMBS)) {
        db.createObjectStore(THUMBS, { keyPath: 'id' }); // { id, blob }
      }
      if (!db.objectStoreNames.contains(ORIG)) {
        const store = db.createObjectStore(ORIG, { keyPath: 'id' }); // { id, data|blob, type, ts }
        store.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(db, name, mode = 'readonly') {
  const tx = db.transaction(name, mode);
  return [tx, tx.objectStore(name)];
}

async function get(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const [tx, store] = txStore(db, storeName, 'readonly');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function set(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const [tx, store] = txStore(db, storeName, 'readwrite');
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function del(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const [tx, store] = txStore(db, storeName, 'readwrite');
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function count(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const [tx, store] = txStore(db, storeName, 'readonly');
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

export async function getThumb(id) {
  const rec = await get(THUMBS, id);
  return rec ? rec.blob : null;
}

export async function putThumb(id, blob) {
  await set(THUMBS, { id, blob });
}

export async function getOrig(id) {
  const rec = await get(ORIG, id);
  if (!rec) return null;
  // touch LRU (without mutating stored data shape)
  await set(ORIG, { ...rec, ts: Date.now() });
  // Legacy shape with blob
  if (rec.blob) {
    try {
      // Some iOS PWA cases return zero-sized blobs from IDB; treat as miss
      if (typeof rec.blob.size === 'number' && rec.blob.size < 32) return null;
    } catch {}
    return rec.blob;
  }
  // New shape with ArrayBuffer + type
  if (rec.data) {
    try {
      const buf = rec.data;
      const type = rec.type || 'image/jpeg';
      const blob = new Blob([buf], { type });
      if (blob.size < 32) return null;
      return blob;
    } catch {
      return null;
    }
  }
  return null;
}

export async function putOrig(id, blob) {
  try {
    const arr = await blob.arrayBuffer();
    const record = { id, data: arr, type: blob.type || 'image/jpeg', ts: Date.now() };
    await set(ORIG, record);
  } catch {
    // Fallback to legacy shape if arrayBuffer fails
    await set(ORIG, { id, blob, ts: Date.now() });
  }
}

export async function pruneOrig(max = 20) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const [tx, store] = txStore(db, ORIG, 'readwrite');
    const idx = store.index('ts');
    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result || 0;
      const toDelete = Math.max(0, total - max);
      if (toDelete <= 0) return resolve();
      let removed = 0;
      const curReq = idx.openCursor();
      curReq.onsuccess = () => {
        const cursor = curReq.result;
        if (cursor && removed < toDelete) {
          store.delete(cursor.primaryKey);
          removed += 1;
          cursor.continue();
        } else {
          resolve();
        }
      };
      curReq.onerror = () => reject(curReq.error);
    };
    countReq.onerror = () => reject(countReq.error);
  });
}

export async function deleteThumb(id) {
  await del(THUMBS, id);
}

export async function deleteOrig(id) {
  await del(ORIG, id);
}
