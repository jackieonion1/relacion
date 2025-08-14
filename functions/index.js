import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import webpush from 'web-push';

// Global options
setGlobalOptions({ region: 'europe-southwest1', maxInstances: 5 });

// Callable: manual test push
export const sendTestPush = onCall(async (request) => {
  const auth = request.auth;
  const data = request.data || {};
  const pairId = data.pairId;
  const title = data.title || 'Test push';
  const body = data.body || 'Hola!';
  const url = data.url || '/';
  if (!pairId) throw new HttpsError('invalid-argument', 'pairId requerido');
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
  return subs;
}

async function sendToPair(pairId, payload, { excludeIdentity, excludeUid } = {}) {
  // Ensure VAPID is configured at runtime (avoids requiring env at module load time)
  loadVapid();
  const subs = await listSubscriptions(pairId);
  const body = JSON.stringify(payload);
  const tasks = subs
    .filter((s) => (excludeIdentity ? s.identity !== excludeIdentity : true))
    .filter((s) => (excludeUid ? s.uid !== excludeUid : true))
    .map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
      } catch (e) {
        const status = e?.statusCode || e?.status || 0;
        if (status === 404 || status === 410) {
          // Subscription no longer valid: delete it
          await db.collection('pairs').doc(pairId).collection('pushSubs').doc(s.id).delete().catch(() => {});
        } else {
          console.warn('sendNotification error', status, e?.message || e);
        }
      }
    });
  await Promise.allSettled(tasks);
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
    const desc = data.description || data.notes || '';
    await sendToPair(pairId, {
      title,
      body: truncate(desc),
      url: '/calendar',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { type: 'event', eventId, pairId },
    }, { excludeUid: data.createdBy });
  } catch (e) {
    console.warn('onNewEvent error', e);
  }
});
