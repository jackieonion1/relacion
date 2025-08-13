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

export async function listEvents(pairId, { futureOnly = true, max = 50 } = {}) {
  if (!pairId || !db) return [];
  await waitAuth();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'events');
  let q;
  if (futureOnly) {
    const now = f.Timestamp.fromDate(new Date());
    q = f.query(col, f.where('start', '>=', now), f.orderBy('start', 'asc'), f.limit(max));
  } else {
    q = f.query(col, f.orderBy('start', 'asc'), f.limit(max));
  }
  const snap = await f.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addEvent(pairId, { title, date, time, endDate, location = '', eventType = 'conjunto', seeEachOther = false }, identity = 'yo') {
  if (!pairId || !db) throw new Error('missing-context');
  await waitAuth();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  
  // Parse date and time
  const [y, m, d] = (date || '').split('-').map(Number);
  let hh = 12, mm = 0;
  if (time && /^(\d{1,2}):(\d{2})$/.test(time)) {
    const parts = time.split(':');
    hh = Math.min(23, Math.max(0, Number(parts[0])));
    mm = Math.min(59, Math.max(0, Number(parts[1])));
  }
  const startDate = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
  const start = f.Timestamp.fromDate(startDate);
  
  const payload = {
    title: String(title || '').trim(),
    location: String(location || '').trim(),
    start,
    createdAt: f.serverTimestamp(),
    createdBy: auth.currentUser.uid,
    identity,
    eventType: eventType || 'conjunto',
    seeEachOther: !!seeEachOther,
  };

  // Add end date if provided
  if (endDate) {
    const [ey, em, ed] = (endDate || '').split('-').map(Number);
    if (ey && em && ed) {
      const finalDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      if (finalDate > startDate) {
        payload.end = f.Timestamp.fromDate(finalDate);
      }
    }
  }
  
  const col = f.collection(db, 'pairs', pairId, 'events');
  await f.addDoc(col, payload);
}

export async function deleteEvent(pairId, id) {
  if (!pairId || !id || !db) return;
  await waitAuth();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');
  const ref = f.doc(f.collection(db, 'pairs', pairId, 'events'), id);
  await f.deleteDoc(ref);
}

export async function listenEvents(pairId, { futureOnly = true, max = 50 } = {}, onChange) {
  if (!pairId || !db) return () => {};
  await waitAuth();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'events');
  let q;
  if (futureOnly) {
    const now = f.Timestamp.fromDate(new Date());
    q = f.query(col, f.where('start', '>=', now), f.orderBy('start', 'asc'), f.limit(max));
  } else {
    q = f.query(col, f.orderBy('start', 'asc'), f.limit(max));
  }
  return f.onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange(list);
  });
}
