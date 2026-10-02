import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import webpush from 'web-push';
import { createHash, randomInt } from 'node:crypto';
import { eventBody } from './pushLogic.js';
import { deviceLabel } from './membershipLogic.js';
import { madridDate, remindersFor, skipPairs } from './reminders.js';
import { capsuleDay, capsulePushes } from './capsulas.js';

// Global options
setGlobalOptions({ region: 'europe-southwest1', maxInstances: 5 });

// Callable: manual test push
export const sendTestPush = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Autenticación requerida');
  const data = request.data || {};
  const pairId = data.pairId;
  const title = data.title || 'Test push';
  const body = data.body || 'Hola!';
  const url = data.url || '/';
  if (!pairId) throw new HttpsError('invalid-argument', 'pairId requerido');
  await requireMember(String(pairId), auth.uid);
  try {
    await sendToPair(pairId, { title, body, url, icon: '/icon.svg', badge: '/icon.svg', data: { type: 'test', pairId } }, { excludeUid: auth?.uid });
    return { ok: true };
  } catch (e) {
    console.warn('sendTestPush error', e);
    throw new HttpsError('internal', e?.message || 'error');
  }
});

// Init Admin (modular)
if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();

// --- Pair membership ---
// firestore.rules and storage.rules only let in uids listed in pairs/{pairId}/members/{uid}, and only these
// callables write there. While pairs/{pairId} has no `locked: true`, knowing the code is enough (as before);
// once locked, a new device needs a one-time invite from a member (Ajustes › Añadir un dispositivo).
const PAIR_RE = /^[A-Z0-9]{4,12}$/;
// No 0/O, 1/I/L: it is read on one phone and typed on another
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_LEN = 8;
const INVITE_TTL_MS = 15 * 60 * 1000;
// While the pair is open anyone with the (public) code becomes a member, so being one is not enough to lock the
// pair, take devices out or hand out invites. Those need a trusted device: one that came in with an invite, or
// whose anonymous Auth account was created before this date (the pair's phones, signed in long before 3.1; it
// is set by Auth, not by the caller). A real phone that gets a new uid after this date (Safari wiped its data, a
// reinstall) can still use the app but not lock nor remove: the other phone can, and an invite from it makes
// this one trusted again
const TRUSTED_BEFORE = Date.parse('2026-10-02T00:00:00Z');
const pairRef = (pairId) => db.collection('pairs').doc(pairId);
const memberRef = (pairId, uid) => pairRef(pairId).collection('members').doc(uid);
// Only the hash is stored: whoever reads pairInvites (no client can) still cannot use an invite
const inviteRef = (pairId, code) => db.collection('pairInvites').doc(createHash('sha256').update(`${pairId}:${code}`).digest('hex'));

function readPairId(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticación requerida');
  const pairId = String(request.data?.pairId || '').trim().toUpperCase();
  if (!PAIR_RE.test(pairId)) throw new HttpsError('invalid-argument', 'pairId no válido');
  return pairId;
}

async function requireMember(pairId, uid) {
  const snap = await memberRef(pairId, uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Este dispositivo no es de la pareja');
  return snap;
}

// An account Auth can't find (or with no date) is not trusted
async function accountIsOld(uid) {
  try {
    const created = Date.parse((await getAuth().getUser(uid)).metadata.creationTime);
    return created < TRUSTED_BEFORE;
  } catch {
    return false;
  }
}

// Members only, and of those only trusted devices (see TRUSTED_BEFORE). Ajustes reads the error message
async function requireTrusted(pairId, uid) {
  const snap = await requireMember(pairId, uid);
  if (snap.get('via') === 'invite') return;
  if (!(await accountIsOld(uid))) throw new HttpsError('permission-denied', 'trusted');
}

// Callable: makes this uid a member. Idempotent; the app calls it before its first read on a new uid.
// Errors the client acts on: failed-precondition 'locked' (ask for an invite), permission-denied 'invite' (bad one)
export const joinPair = onCall(async (request) => {
  const pairId = readPairId(request);
  const uid = request.auth.uid;
  const invite = String(request.data?.invite || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const kind = deviceLabel(String(request.rawRequest?.headers?.['user-agent'] || ''), request.data?.touch === true);
  // Only for Ajustes, which greys out what this device can't do; the callables ask Auth themselves
  const old = await accountIsOld(uid);
  return db.runTransaction(async (tx) => {
    const me = memberRef(pairId, uid);
    const [pair, mine] = await Promise.all([tx.get(pairRef(pairId)), tx.get(me)]);
    if (mine.exists) return { ok: true };
    const locked = pair.get('locked') === true;
    if (locked) {
      if (!invite) throw new HttpsError('failed-precondition', 'locked');
      const ref = inviteRef(pairId, invite);
      const inv = await tx.get(ref);
      if (!inv.exists || inv.get('pairId') !== pairId || inv.get('expiresAt').toMillis() < Date.now()) {
        throw new HttpsError('permission-denied', 'invite');
      }
      // An invite dies with its creator: a device taken out can't come back through one it left behind
      const creator = await tx.get(memberRef(pairId, String(inv.get('createdBy') || '-')));
      if (!creator.exists) throw new HttpsError('permission-denied', 'invite');
    }
    // Reads before writes (transaction): an unknown kind is numbered after the devices already in
    const label = kind || `Dispositivo ${(await tx.get(pairRef(pairId).collection('members'))).size + 1}`;
    if (locked) tx.delete(inviteRef(pairId, invite)); // single use
    tx.set(me, { joinedAt: FieldValue.serverTimestamp(), label, via: locked ? 'invite' : 'code', trusted: locked || old });
    return { ok: true };
  });
});

// Callable (trusted members only): a one-time code for another device, valid for 15 minutes
export const createInvite = onCall(async (request) => {
  const pairId = readPairId(request);
  const uid = request.auth.uid;
  await requireTrusted(pairId, uid);
  const code = Array.from({ length: INVITE_LEN }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('');
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + INVITE_TTL_MS);
  // Expired invites of this pair are swept here; nothing else lists them
  const old = await db.collection('pairInvites').where('pairId', '==', pairId).get();
  const batch = db.batch();
  old.forEach((d) => { if (d.get('expiresAt')?.toMillis() < now) batch.delete(d.ref); });
  batch.set(inviteRef(pairId, code), { pairId, expiresAt, createdBy: uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { code, expiresAt: expiresAt.toMillis() };
});

// Callable (trusted members only): from now on joinPair asks new devices for an invite. One-way from the app on purpose.
// Push subscriptions whose uid is not a member's (or have none) go too: while open anyone could write one, and
// sendToPair sends to every doc. The members' own carry their uid and stay
export const lockPair = onCall(async (request) => {
  const pairId = readPairId(request);
  const uid = request.auth.uid;
  await requireTrusted(pairId, uid);
  await pairRef(pairId).set({ locked: true, lockedAt: FieldValue.serverTimestamp(), lockedBy: uid }, { merge: true });
  const [members, subs] = await Promise.all([pairRef(pairId).collection('members').get(), pairRef(pairId).collection('pushSubs').get()]);
  const ids = new Set(members.docs.map((d) => d.id));
  const batch = db.batch();
  let dropped = 0;
  subs.forEach((d) => { if (!ids.has(d.get('uid'))) { batch.delete(d.ref); dropped++; } });
  if (dropped) await batch.commit();
  console.log('lockPair', JSON.stringify({ pairId, members: ids.size, subs: subs.size, dropped }));
  return { ok: true };
});

// Callable (trusted members only): takes another device out of the pair, with its push subscriptions and the
// invites it made
export const removeMember = onCall(async (request) => {
  const pairId = readPairId(request);
  const uid = request.auth.uid;
  const target = String(request.data?.uid || '');
  if (!target || target.includes('/')) throw new HttpsError('invalid-argument', 'uid requerido');
  if (target === uid) throw new HttpsError('failed-precondition', 'No puedes quitar este dispositivo');
  await requireTrusted(pairId, uid);
  const [subs, invites] = await Promise.all([
    pairRef(pairId).collection('pushSubs').where('uid', '==', target).get(),
    db.collection('pairInvites').where('pairId', '==', pairId).get(),
  ]);
  const batch = db.batch();
  subs.forEach((d) => batch.delete(d.ref));
  invites.forEach((d) => { if (d.get('createdBy') === target) batch.delete(d.ref); });
  batch.delete(memberRef(pairId, target));
  await batch.commit();
  return { ok: true };
});

// VAPID config from dotenv env (see: https://firebase.google.com/docs/functions/config-env)
function loadVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const contact = process.env.VAPID_CONTACT || 'mailto:admin@example.com';
  if (!pub || !priv) throw new Error('Missing VAPID keys in environment');
  webpush.setVapidDetails(contact, pub, priv);
  return { pub, priv, contact };
}

async function listSubscriptions(pairId) {
  const snap = await db.collection('pairs').doc(pairId).collection('pushSubs').get();
  const subs = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d?.enabled !== false && d?.endpoint && d?.keys && d?.keys.p256dh && d?.keys.auth) {
      subs.push({ id: doc.id, endpoint: d.endpoint, keys: d.keys, identity: d.identity, uid: d.uid });
    }
  });
  return { subs, total: snap.size };
}

async function sendToPair(pairId, payload, { excludeIdentity, excludeUid } = {}) {
  // Ensure VAPID is configured at runtime (avoids requiring env at module load time)
  loadVapid();
  const { subs, total } = await listSubscriptions(pairId);
  const body = JSON.stringify(payload);
  const targets = subs
    .filter((s) => (excludeIdentity ? s.identity !== excludeIdentity : true))
    .filter((s) => (excludeUid ? s.uid !== excludeUid : true));
  // Dos docs con el mismo endpoint son el mismo dispositivo: un solo envío (sin borrar nada)
  const byEndpoint = new Map();
  for (const s of targets) if (!byEndpoint.has(s.endpoint)) byEndpoint.set(s.endpoint, s);
  const summary = { pairId, type: payload?.data?.type, total, usable: subs.length, afterFilter: targets.length, unique: byEndpoint.size, sent: 0, failed: 0, statuses: [], deleted: 0 };
  const tasks = [...byEndpoint.values()].map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
      summary.sent++;
    } catch (e) {
      const status = e?.statusCode || e?.status || 0;
      summary.failed++;
      summary.statuses.push(status);
      if (status === 404 || status === 410) {
        // Endpoint muerto: se borran todos los docs que lo comparten
        const col = db.collection('pairs').doc(pairId).collection('pushSubs');
        for (const dead of subs.filter((x) => x.endpoint === s.endpoint)) {
          await col.doc(dead.id).delete().then(() => { summary.deleted++; }, () => {});
        }
      } else {
        console.warn('sendNotification error', status, e?.message || e);
      }
    }
  });
  await Promise.allSettled(tasks);
  // Una línea por envío; sin endpoints ni claves
  console.log('push', JSON.stringify(summary));
  return summary;
}

function truncate(str = '', n = 120) {
  try {
    const s = String(str || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  } catch { return ''; }
}

export const onNewNote = onDocumentCreated('pairs/{pairId}/notes/{noteId}', async (event) => {
  try {
    const { pairId } = event.params;
    const data = event.data?.data();
    if (!data) return;
    const title = data.title && String(data.title).trim() ? `Nueva nota: ${data.title}` : 'Nueva nota';
    const body = data.plain || data.body || '';
    await sendToPair(pairId, {
      title,
      body: truncate(body),
      url: '/notes',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { type: 'note', noteId: event.params.noteId, pairId },
    }, { excludeIdentity: data.identity, excludeUid: data.createdBy });
  } catch (e) {
    console.warn('onNewNote error', e);
  }
});

export const onNewEvent = onDocumentCreated('pairs/{pairId}/events/{eventId}', async (event) => {
  try {
    const { pairId, eventId } = event.params;
    const data = event.data?.data();
    if (!data) return;
    const title = data.title && String(data.title).trim() ? `Nuevo evento: ${data.title}` : 'Nuevo evento';
    await sendToPair(pairId, {
      title,
      body: truncate(eventBody(data)),
      url: '/calendar',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { type: 'event', eventId, pairId },
    }, { excludeUid: data.createdBy });
  } catch (e) {
    console.warn('onNewEvent error', e);
  }
});

// A comment on a photo: a push to the other one (never to whoever wrote it), which opens that photo
export const onNewPhotoComment = onDocumentCreated('pairs/{pairId}/photoComments/{commentId}', async (event) => {
  try {
    const { pairId, commentId } = event.params;
    const data = event.data?.data();
    if (!data || !data.photoId) return;
    const who = data.identity === 'ella' ? '🍪' : data.identity === 'yo' ? '🫒' : '';
    await sendToPair(pairId, {
      title: who ? `${who} ha comentado una foto` : 'Nuevo comentario en una foto',
      body: truncate(data.text),
      url: `/gallery?photo=${encodeURIComponent(String(data.photoId))}`,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { type: 'photoComment', commentId, photoId: String(data.photoId), pairId },
    }, { excludeIdentity: data.identity, excludeUid: data.createdBy });
  } catch (e) {
    console.warn('onNewPhotoComment error', e);
  }
});

// Every morning at 9:00 Madrid time: the monthiversary (every 24th, anniversary in November), birthdays and the time
// capsules that open today. What is due is decided in reminders.js and capsulas.js; each identity gets its own text
export const morningReminders = onSchedule({ schedule: '0 9 * * *', timeZone: 'Europe/Madrid' }, async () => {
  const now = new Date();
  const due = remindersFor(now);
  // Pairs listed in REMINDER_SKIP_PAIRS (functions/.env, comma-separated) get nothing; none by default
  const skip = skipPairs(process.env.REMINDER_SKIP_PAIRS);
  const { year, month, day } = madridDate(now);
  const today = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const { start, end } = capsuleDay(now);
  // listDocuments also returns pair ids that only have subcollections (no pair doc of their own)
  const pairs = await db.collection('pairs').listDocuments();
  for (const pair of pairs) {
    if (skip.has(pair.id)) continue;
    // Capsules opening today: a range on a single field, so the automatic index serves it
    let capsules = {};
    try {
      const snap = await pair.collection('capsules')
        .where('openAt', '>=', Timestamp.fromDate(start)).where('openAt', '<', Timestamp.fromDate(end)).get();
      capsules = capsulePushes(snap.docs.map((d) => d.data()));
    } catch (e) {
      console.warn('morningReminders capsules error', pair.id, e);
    }
    if (due.length === 0 && Object.keys(capsules).length === 0) continue;
    // One lock per pair and day: if Scheduler delivers the run twice, the second finds it and sends nothing
    try {
      await pair.collection('meta').doc(`reminders-${today}`).create({ at: FieldValue.serverTimestamp() });
    } catch (e) {
      // 6 = ALREADY_EXISTS; any other failure sends anyway (a duplicate beats a missed greeting)
      if (e?.code === 6) continue;
      console.warn('morningReminders lock error', pair.id, e);
    }
    for (const reminder of due) {
      for (const [identity, text] of Object.entries(reminder.texts)) {
        try {
          await sendToPair(pair.id, {
            title: text.title,
            body: text.body,
            url: reminder.kind === 'birthday' ? '/calendar' : '/',
            icon: '/icon.svg',
            badge: '/icon.svg',
            data: { type: reminder.kind, pairId: pair.id },
          }, { excludeIdentity: identity === 'yo' ? 'ella' : 'yo' });
        } catch (e) {
          console.warn('morningReminders error', pair.id, e);
        }
      }
    }
    for (const [identity, text] of Object.entries(capsules)) {
      try {
        await sendToPair(pair.id, {
          title: text.title,
          body: text.body,
          url: '/recuerdos/capsulas',
          icon: '/icon.svg',
          badge: '/icon.svg',
          data: { type: 'capsule', pairId: pair.id },
        }, { excludeIdentity: identity === 'yo' ? 'ella' : 'yo' });
      } catch (e) {
        console.warn('morningReminders capsule error', pair.id, e);
      }
    }
  }
});
