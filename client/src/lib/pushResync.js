// Resincroniza al abrir la app la suscripción push que ya tiene este dispositivo con su doc de Firestore.
// Solo LEE el PushManager (getSubscription): nunca subscribe ni unsubscribe y nunca pide permiso, porque en iOS
// un resync sin gesto que recree la suscripción puede dejar al dispositivo sin push (ver subscribeToPush).
// Sin imports de Firebase para poder probarlo con fakes (se cablea en push.js).
import { isValidPairCode } from './pairCode';

export const RESYNC_KEY = 'pushResync';
export const NOTICE_KEY = 'pushNotice';
export const RESYNC_EVERY_MS = 24 * 60 * 60 * 1000;
export const NOTICE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const NOTICE_AFTER_OPENS = 2;

const IDENTITIES = ['yo', 'ella'];

function toB64url(buf) {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// {endpoint, keys} solo si está completa; si no, null (y entonces no se escribe nada)
export function readSubscription(sub) {
  if (!sub) return null;
  let json = {};
  try { json = (typeof sub.toJSON === 'function' ? sub.toJSON() : {}) || {}; } catch {}
  const endpoint = sub.endpoint || json.endpoint || '';
  let keys = json.keys || {};
  if (!keys.p256dh || !keys.auth) {
    try {
      const k1 = typeof sub.getKey === 'function' ? sub.getKey('p256dh') : null;
      const k2 = typeof sub.getKey === 'function' ? sub.getKey('auth') : null;
      if (k1 && k2) keys = { p256dh: toB64url(k1), auth: toB64url(k2) };
    } catch {}
  }
  if (!endpoint || !keys.p256dh || !keys.auth) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null') || null; } catch { return null; }
}
function writeJson(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch {}
}

// Última sincronización con el servidor de este dispositivo ({at, ...huella}) o null
export function getResyncInfo(storage) {
  return readJson(storage, RESYNC_KEY);
}

// Anota que el doc quedó escrito (también lo llama subscribeToPush tras su setDoc)
export function recordSync(storage, { pairId, identity, uid, endpoint }, now = Date.now()) {
  writeJson(storage, RESYNC_KEY, { pairId, identity, uid, endpoint, at: now });
}

// Devuelve {status}:
//  'unsupported' | 'no-permission' (aún no concedido) | 'denied' | 'invalid' (sin pareja o identidad elegida)
//  'no-sw' (el SW no estuvo listo a tiempo: no se sabe si hay suscripción) | 'no-sub' | 'incomplete' | 'no-auth'
//  | 'skipped' (huella igual y reciente) | 'synced' | 'error'
export async function resyncSubscription({ pairId, identity, env, getUid, exists, write, stamp, storage, deviceId, ua = '', now = Date.now() }) {
  try {
    if (!isValidPairCode(pairId) || !IDENTITIES.includes(identity)) return { status: 'invalid' };
    if (!env.supported()) return { status: 'unsupported' };
    const perm = env.permission();
    if (perm === 'denied') return { status: 'denied' };
    if (perm !== 'granted') return { status: 'no-permission' };

    const pm = await env.getPushManager();
    // Sin SW a tiempo no es «sin suscripción»: contarlo como tal acabaría enseñando «Activar» a quien sí la tiene
    if (!pm) return { status: 'no-sw' };
    const sub = await pm.getSubscription();
    if (!sub) return { status: 'no-sub' };
    const read = readSubscription(sub);
    if (!read) return { status: 'incomplete' };

    const uid = await getUid();
    if (!uid) return { status: 'no-auth' };

    const prev = getResyncInfo(storage);
    const same = prev && prev.pairId === pairId && prev.identity === identity && prev.uid === uid && prev.endpoint === read.endpoint;
    if (same && typeof prev.at === 'number' && now - prev.at >= 0 && now - prev.at < RESYNC_EVERY_MS) return { status: 'skipped' };

    const id = `${identity}-${deviceId()}`;
    const missing = !(await exists(pairId, id));
    // identity y enabled siempre: si el doc desapareció entre exists() y write() (un 410, una lectura de caché),
    // el merge lo recrearía sin ellos. createdAt solo si el doc no existe; nunca se reescribe
    const data = { endpoint: read.endpoint, keys: read.keys, identity, enabled: true, uid, ua, updatedAt: stamp() };
    if (missing) data.createdAt = stamp();
    await write(pairId, id, data);
    recordSync(storage, { pairId, identity, uid, endpoint: read.endpoint }, now);
    return { status: 'synced' };
  } catch {
    return { status: 'error' };
  }
}

// ¿Enseñar «Activar notificaciones»? Con permiso aún sin pedir, sí; con permiso concedido pero sin
// suscripción, solo si se repite en NOTICE_AFTER_OPENS aperturas (un null puntual no cuenta). Nunca en
// denied, error o suscripción dudosa. «Luego» lo silencia NOTICE_SNOOZE_MS.
export function decideNotice(status, storage, now = Date.now()) {
  const st = readJson(storage, NOTICE_KEY) || {};
  let nulls = Number(st.nulls) || 0;
  if (status === 'no-sub') nulls += 1;
  else if (status === 'synced' || status === 'skipped' || status === 'incomplete') nulls = 0;
  if (nulls !== (Number(st.nulls) || 0)) writeJson(storage, NOTICE_KEY, { ...st, nulls });
  if (typeof st.dismissedAt === 'number' && now - st.dismissedAt >= 0 && now - st.dismissedAt < NOTICE_SNOOZE_MS) return false;
  if (status === 'no-permission') return true;
  if (status === 'no-sub') return nulls >= NOTICE_AFTER_OPENS;
  return false;
}

export function dismissNotice(storage, now = Date.now()) {
  writeJson(storage, NOTICE_KEY, { ...(readJson(storage, NOTICE_KEY) || {}), dismissedAt: now });
}
