import { db, auth, authReady } from './firebase';

let _f;
async function f() {
  if (!_f) _f = await import('firebase/firestore');
  return _f;
}

async function swSubscribeFallback(reg, ask) {
  return new Promise((resolve, reject) => {
    try {
      const reqId = Math.random().toString(36).slice(2);
      const onMsg = (e) => {
        try {
          const d = e && e.data;
          if (!d || d.type !== 'subscribeResult' || d.reqId !== reqId) return;
          navigator.serviceWorker.removeEventListener('message', onMsg);
          resolve(d);
        } catch (err) {
          navigator.serviceWorker.removeEventListener('message', onMsg);
          reject(err);
        }
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      const payload = { type: 'subscribe', applicationServerKey: (ask && ask.buffer) ? ask.buffer : ask, reqId };
      if (reg?.active?.postMessage) reg.active.postMessage(payload);
      else if (navigator.serviceWorker.controller?.postMessage) navigator.serviceWorker.controller.postMessage(payload);
      setTimeout(() => {
        try { navigator.serviceWorker.removeEventListener('message', onMsg); } catch {}
        reject(new Error('sw-subscribe-timeout'));
      }, 5000);
    } catch (e) {
      reject(e);
    }
  });
}

async function waitAuth(timeout = 1200) {
  if (!authReady) return;
  try {
    await Promise.race([authReady, new Promise((res) => setTimeout(res, timeout))]);
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function normalizeVapidKey(key) {
  let s = String(key || '').trim();
  // Remove surrounding quotes if present
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function deviceId() {
  try {
    const key = 'pushDeviceId';
    let id = localStorage.getItem(key);
    if (!id) {
      const cryptoObj = (typeof window !== 'undefined' && window.crypto) || null;
      if (cryptoObj?.getRandomValues) {
        id = cryptoObj.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
      } else {
        id = String(Math.random()).slice(2) + String(Math.random()).slice(2);
      }
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return String(Math.random()).slice(2);
  }
}

// Minimal persistent diagnostics for iOS PWA (no console/alerts available sometimes)
const DIAG_KEY = 'pushDiag';
export function getPushDiag() {
  try { return localStorage.getItem(DIAG_KEY) || ''; } catch { return ''; }
}
function setPushDiag(msg, extra) {
  try {
    const ts = new Date().toISOString();
    const s = [ts, msg, extra ? JSON.stringify(extra).slice(0, 400) : ''].filter(Boolean).join(' | ');
    const prev = localStorage.getItem(DIAG_KEY) || '';
    const joined = prev ? `${prev}\n${s}` : s;
    const lines = joined.split('\n');
    const tail = lines.slice(-8).join('\n');
    localStorage.setItem(DIAG_KEY, tail);
  } catch {}
}

export async function getPushSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(pairId, identity, vapidPublicKey) {
  if (!pairId) throw new Error('missing-pair');
  if (!('serviceWorker' in navigator)) throw new Error('no-sw');
  if (!('Notification' in window)) throw new Error('no-notification');
  if (Notification.permission !== 'granted') {
    setPushDiag('no-permission', { permission: Notification.permission });
    throw new Error('no-permission');
  }
  if (!vapidPublicKey) throw new Error('missing-vapid');

  await waitAuth();
  if (!auth?.currentUser) throw new Error('no-auth');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const vapid = normalizeVapidKey(vapidPublicKey);
  const ask = urlBase64ToUint8Array(vapid);
  if (ask.length !== 65) {
    console.warn('VAPID public key length is not 65 bytes, check REACT_APP_VAPID_PUBLIC_KEY');
    setPushDiag('bad-vapid', { len: ask.length, prefix: vapid.slice(0,8) });
    throw new Error(`bad-vapid; len=${ask.length}; prefix=${vapid.slice(0,8)}`);
  }
  const envInfo = { ua: navigator.userAgent, permission: Notification.permission, scope: reg.scope };
  try {
    const swState = (reg && reg.active && reg.active.state) || '';
    const standalone = typeof navigator.standalone !== 'undefined' ? !!navigator.standalone : undefined;
    const ua = navigator.userAgent;
    setPushDiag('start', { permission: Notification.permission, scope: reg.scope, swState, standalone, ua });
  } catch {}
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ask });
      setPushDiag('after-subscribe', { have: !!sub });
    } catch (err) {
      setPushDiag('subscribe-throw', { name: err?.name || 'Error', msg: (err?.message || '').slice(0, 160) });
      // Safari/iOS quirk: try ArrayBuffer fallback
      try {
        const ab = ask && ask.buffer ? ask.buffer : ask;
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ab });
        setPushDiag('after-subscribe-buffer', { have: !!sub });
      } catch (err2) {
        setPushDiag('subscribe-throw-buffer', { name: err2?.name || 'Error', msg: (err2?.message || '').slice(0, 160) });
        throw err2;
      }
    }
  }
  let json = (typeof sub.toJSON === 'function') ? sub.toJSON() : {};
  // Some browsers might not include endpoint/keys in toJSON(); use fallbacks
  const toB64url = (buf) => {
    if (!buf) return '';
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };
  let endpoint = sub.endpoint || json.endpoint;
  let keys = json.keys || {};
  console.info('Push sub (pre-validate)', { envInfo, haveEndpoint: !!endpoint, jsonKeys: Object.keys(json || {}), hasToJSON: typeof sub.toJSON === 'function' });
  setPushDiag('pre-validate', { haveEndpoint: !!endpoint, hasKeys: !!(keys && keys.p256dh && keys.auth) });
  if (!keys.p256dh || !keys.auth) {
    try {
      const k1 = typeof sub.getKey === 'function' ? sub.getKey('p256dh') : null;
      const k2 = typeof sub.getKey === 'function' ? sub.getKey('auth') : null;
      if (k1 && k2) keys = { p256dh: toB64url(k1), auth: toB64url(k2) };
    } catch {}
  }
  // Give iOS a moment to populate endpoint/keys
  if (!endpoint || !keys.p256dh || !keys.auth) {
    setPushDiag('polling-begin', { haveEndpoint: !!endpoint, hasKeys: !!(keys && keys.p256dh && keys.auth) });
    for (let i = 0; i < 15 && (!endpoint || !keys.p256dh || !keys.auth); i++) {
      await sleep(200);
      const again = await reg.pushManager.getSubscription();
      if (again) {
        sub = again;
        json = (typeof sub.toJSON === 'function') ? sub.toJSON() : {};
        endpoint = sub.endpoint || json.endpoint || endpoint;
        let k1 = json.keys;
        if (!k1 || !k1.p256dh || !k1.auth) {
          try {
            const p = typeof sub.getKey === 'function' ? sub.getKey('p256dh') : null;
            const a = typeof sub.getKey === 'function' ? sub.getKey('auth') : null;
            if (p && a) k1 = { p256dh: toB64url(p), auth: toB64url(a) };
          } catch {}
        }
        if (k1 && k1.p256dh && k1.auth) keys = k1;
      }
    }
    if (!endpoint || !keys.p256dh || !keys.auth) setPushDiag('polling-timeout', { haveEndpoint: !!endpoint, hasKeys: !!(keys && keys.p256dh && keys.auth) });
  }
  // Try SW-side subscribe before destructive unsubscribe on iOS
  if (!endpoint || !keys.p256dh || !keys.auth) {
    try {
      setPushDiag('sw-subscribe-start');
      const resp = await swSubscribeFallback(reg, ask);
      setPushDiag('sw-subscribe-resp', { ok: !!resp?.ok, haveEndpoint: !!resp?.endpoint, hasKeys: !!(resp?.keys && resp.keys.p256dh && resp.keys.auth) });
      const again = await reg.pushManager.getSubscription();
      const j3 = (again && typeof again.toJSON === 'function') ? again.toJSON() : {};
      endpoint = (again && again.endpoint) || j3.endpoint || endpoint;
      keys = j3.keys || keys;
      if ((!keys || !keys.p256dh || !keys.auth) && again && typeof again.getKey === 'function') {
        try {
          const p = again.getKey('p256dh');
          const a = again.getKey('auth');
          if (p && a) keys = { p256dh: toB64url(p), auth: toB64url(a) };
        } catch {}
      }
    } catch (e) {
      setPushDiag('sw-subscribe-fail', { msg: (e && e.message) ? e.message : String(e) });
    }
  }
  // If malformed, try once to recreate the subscription
  if (!endpoint || !keys.p256dh || !keys.auth) {
    try { await sub.unsubscribe(); } catch {}
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ask });
    let j2 = (typeof sub.toJSON === 'function') ? sub.toJSON() : {};
    endpoint = sub.endpoint || j2.endpoint;
    keys = j2.keys || keys;
    if ((!keys.p256dh || !keys.auth) && typeof sub.getKey === 'function') {
      try {
        const k1 = sub.getKey('p256dh');
        const k2 = sub.getKey('auth');
        if (k1 && k2) keys = { p256dh: toB64url(k1), auth: toB64url(k2) };
      } catch {}
    }
    // Poll once more after resubscribe
    if (!endpoint || !keys.p256dh || !keys.auth) {
      setPushDiag('polling2-begin', { haveEndpoint: !!endpoint, hasKeys: !!(keys && keys.p256dh && keys.auth) });
      for (let i = 0; i < 15 && (!endpoint || !keys.p256dh || !keys.auth); i++) {
        await sleep(200);
        const again = await reg.pushManager.getSubscription();
        if (again) {
          sub = again;
          j2 = (typeof sub.toJSON === 'function') ? sub.toJSON() : {};
          endpoint = sub.endpoint || j2.endpoint || endpoint;
          let k1 = j2.keys;
          if (!k1 || !k1.p256dh || !k1.auth) {
            try {
              const p = typeof sub.getKey === 'function' ? sub.getKey('p256dh') : null;
              const a = typeof sub.getKey === 'function' ? sub.getKey('auth') : null;
              if (p && a) k1 = { p256dh: toB64url(p), auth: toB64url(a) };
            } catch {}
          }
          if (k1 && k1.p256dh && k1.auth) keys = k1;
        }
      }
      if (!endpoint || !keys.p256dh || !keys.auth) setPushDiag('polling2-timeout', { haveEndpoint: !!endpoint, hasKeys: !!(keys && keys.p256dh && keys.auth) });
    }
    console.info('Push sub (post-resubscribe)', { envInfo, haveEndpoint: !!endpoint, j2Keys: Object.keys(j2 || {}), hasToJSON: typeof sub.toJSON === 'function' });
    setPushDiag('post-resubscribe', { haveEndpoint: !!endpoint, hasKeys: !!(keys && keys.p256dh && keys.auth) });
  }
  // Final fallback: ask SW to subscribe and then read subscription
  if (!endpoint || !keys.p256dh || !keys.auth) {
    try {
      setPushDiag('sw-subscribe-start');
      const resp = await swSubscribeFallback(reg, ask);
      setPushDiag('sw-subscribe-resp', { ok: !!resp?.ok, haveEndpoint: !!resp?.endpoint, hasKeys: !!(resp?.keys && resp.keys.p256dh && resp.keys.auth) });
      const again = await reg.pushManager.getSubscription();
      const j3 = (again && typeof again.toJSON === 'function') ? again.toJSON() : {};
      endpoint = (again && again.endpoint) || j3.endpoint || endpoint;
      keys = j3.keys || keys;
      if ((!keys || !keys.p256dh || !keys.auth) && again && typeof again.getKey === 'function') {
        try {
          const p = again.getKey('p256dh');
          const a = again.getKey('auth');
          if (p && a) keys = { p256dh: toB64url(p), auth: toB64url(a) };
        } catch {}
      }
    } catch (e) {
      setPushDiag('sw-subscribe-fail', { msg: (e && e.message) ? e.message : String(e) });
    }
  }
  if (!endpoint) {
    console.warn('Push subscription missing endpoint', { envInfo, json });
    const host = endpoint && endpoint.indexOf('://') > 0 ? endpoint.split('/')[2] : '';
    const hasKeys = !!(keys && keys.p256dh && keys.auth);
    setPushDiag('bad-subscription', { permission: Notification.permission, scope: reg.scope, haveEndpoint: !!endpoint, hasKeys, host });
    throw new Error(`bad-subscription; perm=${Notification.permission}; scope=${reg.scope}; haveEndpoint=${!!endpoint}; hasKeys=${hasKeys}; host=${host}`);
  }

  const { collection, doc, setDoc, serverTimestamp } = await f();
  const col = collection(db, 'pairs', pairId, 'pushSubs');
  const id = `${identity || 'yo'}-${deviceId()}`;
  await setDoc(doc(col, id), {
    endpoint,
    keys,
    identity: identity || 'yo',
    uid: auth.currentUser.uid,
    ua: navigator.userAgent,
    createdAt: serverTimestamp ? serverTimestamp() : new Date(),
    updatedAt: serverTimestamp ? serverTimestamp() : new Date(),
    enabled: true,
  }, { merge: true });
  try {
    const host = endpoint.indexOf('://') > 0 ? endpoint.split('/')[2] : '';
    setPushDiag('ok', { host });
  } catch {}

  return sub;
}

export async function unsubscribeFromPush(pairId, identity) {
  try {
    const sub = await getPushSubscription();
    if (sub) await sub.unsubscribe();
  } catch {}
  try {
    await waitAuth();
    if (!auth?.currentUser || !pairId) return;
    const { collection, doc, deleteDoc } = await f();
    const col = collection(db, 'pairs', pairId, 'pushSubs');
    const id = `${identity || 'yo'}-${deviceId()}`;
    await deleteDoc(doc(col, id));
  } catch {}
}
