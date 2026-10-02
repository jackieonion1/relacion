// Ataques a la membresía de pareja, como test de regresión: quien tiene el repo, el código de la pareja y una sesión
// anónima propia no debe poder echar a la pareja ni quedarse dentro tras el cierre. Falla con exit 1.
//   firebase emulators:exec --config firebase.test.json --only auth,functions,firestore,storage --project demo-relacion "node functions/test/attacks.mjs"
// Mismo método que rules.mjs: REST con un JWT sin firmar; la siembra va por Admin SDK.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw new Error('FIRESTORE_EMULATOR_HOST no definido: ejecuta con emulators:exec');
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
const functionsBase = 'http://127.0.0.1:5001/demo-relacion/europe-southwest1';
initializeApp({ projectId: 'demo-relacion' });
const db = getFirestore();

const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid) => [{ alg: 'none', typ: 'JWT' }, { sub: uid, user_id: uid, aud: 'demo-relacion', iss: 'https://securetoken.google.com/demo-relacion', iat: 1, exp: 9999999999, firebase: { sign_in_provider: 'anonymous', identities: {} } }]
  .map(b64url).join('.') + '.';
const H = (uid) => ({ 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${jwt(uid)}` } : {}) });
const base = `http://${host}/v1/projects/demo-relacion/databases/(default)/documents`;
const req = async (method, p, uid, body) => (await fetch(`${base}${p}`, { method, headers: H(uid), body: body ? JSON.stringify(body) : undefined })).status;
const call = async (name, data, uid) => {
  const res = await fetch(`${functionsBase}/${name}`, { method: 'POST', headers: H(uid), body: JSON.stringify({ data }) });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, error: j.error?.status || '', result: j.result };
};
const expectCall = async (label, name, data, uid, wantError = '') => {
  const r = await call(name, data, uid);
  check(r.error === wantError, `CALL  ${label} (${r.status} ${r.error || 'ok'}${wantError ? `, se esperaba ${wantError}` : ''})`);
  return r;
};
const sstatus = async (method, p, uid) => {
  const o = encodeURIComponent(p);
  const url = method === 'POST' ? `http://${storageHost}/v0/b/demo-relacion.appspot.com/o?name=${o}` : `http://${storageHost}/v0/b/demo-relacion.appspot.com/o/${o}`;
  return (await fetch(url, { method, headers: { 'Content-Type': 'image/jpeg', ...(uid ? { Authorization: `Bearer ${jwt(uid)}` } : {}) }, body: method === 'POST' ? 'x' : undefined })).status;
};
const members = async (p) => (await db.collection(`pairs/${p}/members`).get()).docs.map((d) => d.id).sort();
const note = { fields: { title: { stringValue: 'x' } } };

// Los móviles de la pareja tienen cuentas anónimas de antes del corte (TRUSTED_BEFORE); el atacante, una de ahora
const OLD = { creationTime: '2025-01-01T00:00:00Z', lastSignInTime: '2025-01-01T00:00:00Z' };
const NEW = { creationTime: '2026-11-01T00:00:00Z', lastSignInTime: '2026-11-01T00:00:00Z' };
await getAuth().importUsers([
  ...['yo-A', 'ella-A', 'yo-D'].map((uid) => ({ uid, metadata: OLD })),
  ...['mal-A'].map((uid) => ({ uid, metadata: NEW })),
]);

// A. Periodo abierto: un extraño con el código se une, pero no cierra ni echa a la pareja
{
  const P = 'ATKA';
  await db.doc(`pairs/${P}/notes/n1`).set({ title: 'privada' });
  await expectCall('A join yo', 'joinPair', { pairId: P }, 'yo-A');
  await expectCall('A join ella', 'joinPair', { pairId: P }, 'ella-A');
  await expectCall('A el extraño se une en abierta (como hoy)', 'joinPair', { pairId: P, label: 'iPhone' }, 'mal-A');
  await expectCall('A el extraño no cierra', 'lockPair', { pairId: P }, 'mal-A', 'PERMISSION_DENIED');
  await expectCall('A el extraño no quita a yo', 'removeMember', { pairId: P, uid: 'yo-A' }, 'mal-A', 'PERMISSION_DENIED');
  await expectCall('A el extraño no quita a ella', 'removeMember', { pairId: P, uid: 'ella-A' }, 'mal-A', 'PERMISSION_DENIED');
  await expectCall('A el extraño no invita', 'createInvite', { pairId: P }, 'mal-A', 'PERMISSION_DENIED');
  check((await db.doc(`pairs/${P}`).get()).get('locked') !== true, 'A la pareja sigue abierta');
  check([200].includes(await req('GET', `/pairs/${P}/notes/n1`, 'yo-A')), 'A yo sigue leyendo');
  check(JSON.stringify(await members(P)) === JSON.stringify(['ella-A', 'mal-A', 'yo-A']), 'A nadie ha salido de la lista');
  // La pareja cierra y lo quita: ya no vuelve
  await expectCall('A yo cierra', 'lockPair', { pairId: P }, 'yo-A');
  await expectCall('A yo quita al extraño', 'removeMember', { pairId: P, uid: 'mal-A' }, 'yo-A');
  check(await req('GET', `/pairs/${P}/notes/n1`, 'mal-A') === 403, 'A el extraño ya no lee');
  await expectCall('A el extraño no vuelve a entrar', 'joinPair', { pairId: P }, 'mal-A', 'FAILED_PRECONDITION');
}

// D. Carrera de doble uso: 8 joinPair concurrentes con la misma invitación dan un solo miembro nuevo
{
  const P = 'ATKD';
  await call('joinPair', { pairId: P }, 'yo-D');
  await call('lockPair', { pairId: P }, 'yo-D');
  const inv = await call('createInvite', { pairId: P }, 'yo-D');
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => call('joinPair', { pairId: P, invite: inv.result?.code }, `racer-${i}`)));
  check(rs.filter((r) => !r.error).length === 1 && rs.filter((r) => r.error === 'PERMISSION_DENIED').length === 7, `D una sola entrada con la invitación (${rs.map((r) => r.error || 'ok')})`);
  check((await members(P)).length === 2, 'D un solo miembro nuevo');

  // E. Fuerza bruta: sin límite de intentos, ninguno entra (el ritmo en el emulador es orientativo)
  const t0 = Date.now(); const errs = {};
  const one = async (i) => { const r = await call('joinPair', { pairId: P, invite: `ZZZZ${String(i).padStart(4, '2')}` }, `brute-${i % 3}`); errs[r.error || 'ok'] = (errs[r.error || 'ok'] || 0) + 1; };
  for (let i = 0; i < 100; i += 20) await Promise.all(Array.from({ length: 20 }, (_, k) => one(i + k)));
  console.log(`E fuerza bruta: 100 intentos en ${Date.now() - t0} ms`);
  check(errs.PERMISSION_DENIED === 100, `E ninguna invitación inventada entra (${JSON.stringify(errs)})`);
}

// F. Collection group sobre members y notes, y list de /pairs
{
  const run = async (collectionId, uid) => (await fetch(`${base}:runQuery`, { method: 'POST', headers: H(uid), body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }] } }) })).status;
  check(await run('members', 'stranger') === 403, 'F collection group members, extraño');
  check(await run('notes', 'stranger') === 403, 'F collection group notes, extraño');
  check(await run('members', 'yo-D') === 403, 'F collection group members, miembro de otra pareja');
  check(await req('GET', '/pairs', 'stranger') === 403, 'F list /pairs');
}

// G. Pareja cerrada: rutas más profundas, doc padre y Storage fuera de photos/music
{
  const P = 'ATKD';
  check(await req('PATCH', `/pairs/${P}/notes/x/c/y`, 'stranger', note) === 403, 'G extraño escribe más hondo');
  check(await req('PATCH', `/pairs/${P}`, 'stranger', { fields: { locked: { booleanValue: false } } }) === 403, 'G extraño escribe el doc padre');
  check(await req('PATCH', `/pairs/${P}?updateMask.fieldPaths=locked`, 'yo-D', { fields: { locked: { booleanValue: false } } }) === 403, 'G un miembro no reabre la pareja');
  check(await sstatus('POST', `pairs/${P}/other/x`, 'stranger') === 403, 'G Storage fuera de photos/music');
  check(await sstatus('POST', `pairs/${P}/photos/a/b/c.jpg`, 'stranger') === 403, 'G Storage photos más hondo');
  check(await sstatus('POST', `pairs/${P}/photos/a/thumb.jpg`, 'stranger') === 403, 'G Storage photos, extraño');
  check(await sstatus('POST', `pairs/${P}/photos/a/thumb.jpg`, 'yo-D') === 200, 'G Storage photos, miembro');
}

// H. Callables desde fuera de la pareja, también con pairId con barras
{
  await expectCall('H sendTestPush de un extraño', 'sendTestPush', { pairId: 'ATKD', title: 'x' }, 'stranger', 'PERMISSION_DENIED');
  await expectCall('H sendTestPush con barras en pairId', 'sendTestPush', { pairId: 'ATKD/members/yo-D', title: 'x' }, 'stranger', 'PERMISSION_DENIED');
  await expectCall('H removeMember de un extraño', 'removeMember', { pairId: 'ATKD', uid: 'yo-D' }, 'stranger', 'PERMISSION_DENIED');
  await expectCall('H createInvite de un extraño', 'createInvite', { pairId: 'ATKD' }, 'stranger', 'PERMISSION_DENIED');
  await expectCall('H lockPair de un extraño en una pareja nueva', 'lockPair', { pairId: 'NEWPAIR' }, 'stranger', 'PERMISSION_DENIED');
}

if (failures.length) { console.error(`ataques FALLÓ: ${failures.length} check(s) en rojo`); process.exit(1); }
console.log('ataques OK');
process.exit(0);
