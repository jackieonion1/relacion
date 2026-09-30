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
    // Newest first so the limit cuts the oldest events, not the upcoming ones
    q = f.query(col, f.orderBy('start', 'desc'), f.limit(max));
  }
  const snap = await f.getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Keep returning ascending order (as futureOnly does)
  return futureOnly ? list : list.reverse();
}

// Fields the form manages, identical on create and edit (toTimestamp: Timestamp.fromDate)
export function buildEventFields({ title, date, time, endDate, location = '', eventType = 'conjunto', seeEachOther = false }, toTimestamp) {
  // Parse date and time
  const [y, m, d] = (date || '').split('-').map(Number);
  let hh = 12, mm = 0;
  if (time && /^(\d{1,2}):(\d{2})$/.test(time)) {
    const parts = time.split(':');
    hh = Math.min(23, Math.max(0, Number(parts[0])));
    mm = Math.min(59, Math.max(0, Number(parts[1])));
  }
  const startDate = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);

  const fields = {
    title: String(title || '').trim(),
    location: String(location || '').trim(),
    start: toTimestamp(startDate),
    eventType: eventType || 'conjunto',
    seeEachOther: !!seeEachOther,
  };

  // Add end date if provided
  if (endDate) {
    const [ey, em, ed] = (endDate || '').split('-').map(Number);
    if (ey && em && ed) {
      const finalDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      if (finalDate > startDate) {
        fields.end = toTimestamp(finalDate);
      }
    }
  }
  return fields;
}

const pad2 = (n) => String(n).padStart(2, '0');
const localDay = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

// Inverse of buildEventFields: form input values in LOCAL time (toISOString would give UTC and shift the day)
export function eventToFormValues(ev) {
  const start = ev?.start?.toDate?.();
  const end = ev?.end?.toDate?.();
  return {
    title: ev?.title || '',
    location: ev?.location || '',
    date: start ? localDay(start) : '',
    time: start ? `${pad2(start.getHours())}:${pad2(start.getMinutes())}` : '',
    endDate: end ? localDay(end) : '',
    eventType: ev?.eventType || 'conjunto',
    seeEachOther: !!ev?.seeEachOther,
  };
}

export async function addEvent(pairId, { title, date, time, endDate, location = '', eventType = 'conjunto', seeEachOther = false }, identity = 'yo') {
  if (!pairId || !db) throw new Error('missing-context');
  await waitAuth();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');

  const payload = {
    ...buildEventFields({ title, date, time, endDate, location, eventType, seeEachOther }, f.Timestamp.fromDate),
    createdAt: f.serverTimestamp(),
    createdBy: auth.currentUser.uid,
    identity,
  };

  const col = f.collection(db, 'pairs', pairId, 'events');
  // Resolves once the write is queued (persistence keeps it offline); `committed` settles with the server ack
  const committed = f.addDoc(col, payload);
  committed.catch(() => {}); // callers that ignore it must not raise an unhandled rejection
  return { committed };
}

export async function updateEvent(pairId, id, { title, date, time, endDate, location = '', eventType = 'conjunto', seeEachOther = false }) {
  if (!pairId || !id || !db) throw new Error('missing-context');
  await waitAuth();
  const f = await fb();
  if (!auth?.currentUser) throw new Error('no-auth');

  const payload = buildEventFields({ title, date, time, endDate, location, eventType, seeEachOther }, f.Timestamp.fromDate);
  // updateDoc keeps fields missing from the payload, so a cleared end date has to be removed explicitly
  if (!payload.end) payload.end = f.deleteField();

  const ref = f.doc(f.collection(db, 'pairs', pairId, 'events'), id);
  // updateDoc (not setDoc merge) so a deleted event is not resurrected; same non-blocking ack as addEvent
  const committed = f.updateDoc(ref, payload);
  committed.catch(() => {});
  return { committed };
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
