// Test de las reglas REALES de Firestore y Storage (cableadas en firebase.test.json) y de las callables de
// membresía. Falla con exit 1.
//   firebase emulators:exec --config firebase.test.json --only auth,functions,firestore,storage --project demo-relacion "node functions/test/rules.mjs"
// Peticiones REST con un JWT sin firmar (el emulador no verifica la firma, como en smoke.mjs). Permitido = 200 o
// 404 (la regla dejó pasar; el doc no existe); denegado = 403. La siembra va por Admin SDK, que se salta las reglas.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw new Error('FIRESTORE_EMULATOR_HOST no definido: ejecuta con emulators:exec');
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
const functionsBase = 'http://127.0.0.1:5001/demo-relacion/europe-southwest1';

const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid) => [{ alg: 'none', typ: 'JWT' }, { sub: uid, user_id: uid, aud: 'demo-relacion', iss: 'https://securetoken.google.com/demo-relacion', iat: 1, exp: 9999999999, firebase: { sign_in_provider: 'anonymous', identities: {} } }]
  .map(b64url).join('.') + '.';
const auth = (uid) => (uid ? { Authorization: `Bearer ${jwt(uid)}` } : {});
const base = `http://${host}/v1/projects/demo-relacion/databases/(default)/documents`;
const req = async (method, p, { uid, body } = {}) => {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth(uid) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
};
const allowed = (s) => s === 200 || s === 404;
const expectAllow = async (label, method, p, opts) => { const s = await req(method, p, opts); check(allowed(s), `ALLOW ${label} (status ${s})`); };
const expectDeny = async (label, method, p, opts) => { const s = await req(method, p, opts); check(s === 403, `DENY  ${label} (status ${s})`); };

// Storage por su API REST (la del SDK web): GET de metadatos y subida simple
const bucket = 'demo-relacion.appspot.com';
const sreq = async (method, p, uid) => {
  const o = encodeURIComponent(p);
  const url = method === 'POST'
    ? `http://${storageHost}/v0/b/${bucket}/o?name=${o}`
    : `http://${storageHost}/v0/b/${bucket}/o/${o}`;
  const res = await fetch(url, { method, headers: { 'Content-Type': 'image/jpeg', ...auth(uid) }, body: method === 'POST' ? 'x' : undefined });
  return res.status;
};
const expectStorage = async (want, label, method, p, uid) => {
  const s = await sreq(method, p, uid);
  check(want === 'allow' ? allowed(s) : s === 403, `${want === 'allow' ? 'ALLOW' : 'DENY '} storage ${label} (status ${s})`);
};

// Callables: { status, error } con el código de HttpsError ('' si fue bien)
const call = async (name, data, uid) => {
  const res = await fetch(`${functionsBase}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(uid) },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, error: json.error?.status || '', result: json.result };
};
const expectCall = async (label, name, data, uid, wantError = '') => {
  const r = await call(name, data, uid);
  check(r.error === wantError, `CALL  ${label} (${r.status} ${r.error || 'ok'}${wantError ? `, se esperaba ${wantError}` : ''})`);
  return r;
};

// Colecciones que usa la app: se leen del código del cliente, para que una nueva sin cubrir rompa este test
const here = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = path.join(here, '..', '..', 'client', 'src');
const used = new Set();
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/'pairs',\s*[A-Za-z.]+,\s*'([A-Za-z]+)'/g)) used.add(m[1]);
    }
  }
};
walk(clientSrc);
const COLLECTIONS = ['locations', 'notes', 'photos', 'meta', 'pushSubs', 'mapState', 'music', 'events', 'photoComments', 'albums'];
// members: el cliente la lee (Ajustes) pero no la escribe nunca
const READ_ONLY = ['members'];
check(used.size > 0 && [...used].every((c) => COLLECTIONS.includes(c) || READ_ONLY.includes(c)), `el cliente solo usa colecciones cubiertas aquí (${[...used].sort().join(', ')})`);

initializeApp({ projectId: 'demo-relacion' });
const db = getFirestore();
const PAIR = 'SEB1998';
const OTHER = 'OTRA4242';
const ME = 'uid-me';
const STRANGER = 'uid-extrano';
for (const c of COLLECTIONS) await db.collection('pairs').doc(PAIR).collection(c).doc('d1').set({ x: 1 });
await db.doc(`pairs/${PAIR}/members/${ME}`).set({ joinedAt: Timestamp.now() });
await db.doc(`pairs/${OTHER}/members/uid-de-otra`).set({ joinedAt: Timestamp.now() });
await db.doc(`pairs/${OTHER}/notes/d1`).set({ x: 1 });
await db.doc(`pairs/${OTHER}`).set({ locked: true });

const write = { fields: { x: { integerValue: '2' } } };
// pushSubs se escribe con el uid de quien escribe, como hace el cliente desde la 1.6
const writeAs = (c, uid) => (c === 'pushSubs' ? { fields: { ...write.fields, uid: { stringValue: uid } } } : write);

// --- Pareja abierta (sin pairs/{p} o sin locked): todo como hasta la 3.0, también para clientes 2.5.1 y 3.0 ---
for (const c of COLLECTIONS) {
  await expectAllow(`abierta, no miembro list ${c}`, 'GET', `/pairs/${PAIR}/${c}`, { uid: STRANGER });
  await expectAllow(`abierta, no miembro get ${c}/d1`, 'GET', `/pairs/${PAIR}/${c}/d1`, { uid: STRANGER });
  await expectAllow(`abierta, no miembro write ${c}/d2`, 'PATCH', `/pairs/${PAIR}/${c}/d2`, { uid: STRANGER, body: writeAs(c, STRANGER) });
  await expectAllow(`abierta, no miembro delete ${c}/d2`, 'DELETE', `/pairs/${PAIR}/${c}/d2`, { uid: STRANGER });
}
// Pareja nueva (código recién escrito en el onboarding o llegado por ?pair=): aún sin documentos
await expectAllow('list notes de una pareja nueva', 'GET', '/pairs/NUEVA42/notes', { uid: ME });
await expectAllow('alta de pushSubs en una pareja nueva', 'PATCH', '/pairs/NUEVA42/pushSubs/ella-abc', { uid: 'uid-otro', body: writeAs('pushSubs', 'uid-otro') });
// pushSubs: solo con el uid propio, abierta o cerrada; un doc viejo sin uid se puede reescribir con el propio
await expectDeny('abierta, pushSubs con el uid de otro', 'PATCH', `/pairs/${PAIR}/pushSubs/d3`, { uid: STRANGER, body: writeAs('pushSubs', ME) });
await expectDeny('abierta, pushSubs sin uid', 'PATCH', `/pairs/${PAIR}/pushSubs/d3`, { uid: STRANGER, body: write });
await expectDeny('abierta, pushSubs: tocar un doc sin dejar el uid propio', 'PATCH', `/pairs/${PAIR}/pushSubs/d1?updateMask.fieldPaths=x`, { uid: STRANGER, body: write });
await db.doc(`pairs/${PAIR}/pushSubs/viejo`).set({ endpoint: 'https://example.invalid/viejo' });
await expectAllow('abierta, un doc viejo sin uid se reescribe con el propio (merge)', 'PATCH', `/pairs/${PAIR}/pushSubs/viejo?updateMask.fieldPaths=uid`, { uid: STRANGER, body: { fields: { uid: { stringValue: STRANGER } } } });
await db.doc(`pairs/${PAIR}/pushSubs/viejo`).delete();
// pairs/{p} existe pero sin locked (o locked: false): sigue abierta
await db.doc('pairs/ABIERTA1').set({ locked: false });
await expectAllow('locked: false sigue abierta', 'GET', '/pairs/ABIERTA1/notes', { uid: STRANGER });
await db.doc('pairs/ABIERTA2').set({ otra: 1 });
await expectAllow('pairs/{p} sin campo locked sigue abierta', 'GET', '/pairs/ABIERTA2/notes', { uid: STRANGER });
// Abierta no quiere decir que members o el doc padre se abran
await expectDeny('abierta, no miembro lee la lista de miembros', 'GET', `/pairs/${PAIR}/members`, { uid: STRANGER });
await expectDeny('abierta, no miembro se da de alta solo', 'PATCH', `/pairs/${PAIR}/members/${STRANGER}`, { uid: STRANGER, body: write });
await expectDeny(`abierta, no miembro lee /pairs/${PAIR}`, 'GET', `/pairs/${PAIR}`, { uid: STRANGER });
await expectStorage('allow', 'abierta, no miembro sube una foto', 'POST', `pairs/${PAIR}/photos/p0/thumb.jpg`, STRANGER);
await expectStorage('allow', 'abierta, no miembro lee una foto', 'GET', `pairs/${PAIR}/photos/p0/thumb.jpg`, STRANGER);

// --- Pareja cerrada (locked: true): solo miembros ---
await db.doc(`pairs/${PAIR}`).set({ locked: true });

// Un miembro: todo lo que usa la app
for (const c of COLLECTIONS) {
  await expectAllow(`miembro list ${c}`, 'GET', `/pairs/${PAIR}/${c}`, { uid: ME });
  await expectAllow(`miembro get ${c}/d1`, 'GET', `/pairs/${PAIR}/${c}/d1`, { uid: ME });
  await expectAllow(`miembro write ${c}/d2`, 'PATCH', `/pairs/${PAIR}/${c}/d2`, { uid: ME, body: writeAs(c, ME) });
  await expectAllow(`miembro delete ${c}/d2`, 'DELETE', `/pairs/${PAIR}/${c}/d2`, { uid: ME });
}
await expectAllow('miembro lee la lista de miembros', 'GET', `/pairs/${PAIR}/members`, { uid: ME });
await expectAllow(`miembro lee /pairs/${PAIR} (locked)`, 'GET', `/pairs/${PAIR}`, { uid: ME });

// Un uid con sesión que sabe el código pero no es miembro: nada
for (const c of COLLECTIONS) {
  await expectDeny(`no miembro list ${c}`, 'GET', `/pairs/${PAIR}/${c}`, { uid: STRANGER });
  await expectDeny(`no miembro get ${c}/d1`, 'GET', `/pairs/${PAIR}/${c}/d1`, { uid: STRANGER });
  await expectDeny(`no miembro write ${c}/d2`, 'PATCH', `/pairs/${PAIR}/${c}/d2`, { uid: STRANGER, body: writeAs(c, STRANGER) });
}
await expectDeny('cerrada, miembro escribe pushSubs con el uid de otro', 'PATCH', `/pairs/${PAIR}/pushSubs/d3`, { uid: ME, body: writeAs('pushSubs', STRANGER) });
await expectDeny('no miembro lee la lista de miembros', 'GET', `/pairs/${PAIR}/members`, { uid: STRANGER });
await expectDeny(`no miembro lee /pairs/${PAIR}`, 'GET', `/pairs/${PAIR}`, { uid: STRANGER });

// Ser miembro de una pareja no abre otra cerrada
await expectDeny('miembro de otra pareja: list notes', 'GET', `/pairs/${OTHER}/notes`, { uid: ME });
await expectDeny('miembro de otra pareja: write notes', 'PATCH', `/pairs/${OTHER}/notes/d2`, { uid: ME, body: write });

// members y pairInvites solo los escribe el Admin SDK (las callables)
await expectDeny('miembro no se escribe en members (otro uid)', 'PATCH', `/pairs/${PAIR}/members/uid-nuevo`, { uid: ME, body: write });
await expectDeny('miembro no modifica su propio member', 'PATCH', `/pairs/${PAIR}/members/${ME}`, { uid: ME, body: write });
await expectDeny('miembro no borra members', 'DELETE', `/pairs/${PAIR}/members/${ME}`, { uid: ME });
await expectDeny('no miembro no se da de alta solo', 'PATCH', `/pairs/${PAIR}/members/${STRANGER}`, { uid: STRANGER, body: write });
await expectDeny('nadie lee pairInvites', 'GET', '/pairInvites', { uid: ME });
await expectDeny('nadie escribe pairInvites', 'PATCH', '/pairInvites/x', { uid: ME, body: write });

// Sin sesión no entra nadie
await expectDeny('list notes sin auth', 'GET', `/pairs/${PAIR}/notes`);
await expectDeny('write notes sin auth', 'PATCH', `/pairs/${PAIR}/notes/d3`, { body: write });

// No se puede enumerar /pairs ni escribir el doc padre: ahí viven los códigos de pareja y `locked`
await expectDeny('list /pairs', 'GET', '/pairs', { uid: ME });
await expectDeny('list /pairs?showMissing=true', 'GET', '/pairs?showMissing=true', { uid: ME });
await expectDeny(`write /pairs/${PAIR} (locked)`, 'PATCH', `/pairs/${PAIR}`, { uid: ME, body: { fields: { locked: { booleanValue: false } } } });
await expectDeny('subcolección más profunda (la app no la usa)', 'GET', `/pairs/${PAIR}/notes/d1/sub/x`, { uid: ME });

// Storage cerrada: la misma membresía, leída de Firestore
await expectStorage('allow', 'miembro sube una foto', 'POST', `pairs/${PAIR}/photos/p1/thumb.jpg`, ME);
await expectStorage('allow', 'miembro lee una foto', 'GET', `pairs/${PAIR}/photos/p1/thumb.jpg`, ME);
await expectStorage('allow', 'miembro sube música', 'POST', `pairs/${PAIR}/music/m1/orig`, ME);
await expectStorage('deny', 'no miembro lee una foto', 'GET', `pairs/${PAIR}/photos/p1/thumb.jpg`, STRANGER);
await expectStorage('deny', 'no miembro sube una foto', 'POST', `pairs/${PAIR}/photos/p2/thumb.jpg`, STRANGER);
await expectStorage('deny', 'no miembro lee música', 'GET', `pairs/${PAIR}/music/m1/orig`, STRANGER);
await expectStorage('deny', 'miembro de otra pareja sube una foto', 'POST', `pairs/${OTHER}/photos/p1/thumb.jpg`, ME);
await expectStorage('deny', 'sin auth lee una foto', 'GET', `pairs/${PAIR}/photos/p1/thumb.jpg`);

// --- Callables de membresía (pareja de prueba propia, para no mezclar con lo de arriba) ---
const J = 'JOIN2024';
const A = 'uid-a'; const B = 'uid-b'; const C = 'uid-c'; const D = 'uid-d'; const N = 'uid-nuevo-con-codigo';
// Cuentas anónimas en el emulador de Auth con su fecha de alta: A y B son de antes del corte (TRUSTED_BEFORE en
// index.js), como los móviles de la pareja; las demás, de después. uid-sin-cuenta no existe en Auth
await getAuth().importUsers([
  ...[A, B].map((uid) => ({ uid, metadata: { creationTime: '2025-01-01T00:00:00Z', lastSignInTime: '2025-01-01T00:00:00Z' } })),
  ...[C, D, N].map((uid) => ({ uid, metadata: { creationTime: '2026-11-01T00:00:00Z', lastSignInTime: '2026-11-01T00:00:00Z' } })),
]);
await expectCall('joinPair sin sesión', 'joinPair', { pairId: J }, null, 'UNAUTHENTICATED');
await expectCall('joinPair con un código mal formado', 'joinPair', { pairId: 'a/b' }, A, 'INVALID_ARGUMENT');
// Abierta: basta con el código, como antes (así los móviles de hoy entran solos al abrir la 3.1)
await expectCall('joinPair en una pareja abierta', 'joinPair', { pairId: J, label: 'iPhone' }, A);
// La etiqueta la pone el servidor: el label del cliente no cuenta, y sin user agent conocido se numera
check((await db.doc(`pairs/${J}/members/${A}`).get()).get('label') === 'Dispositivo 1', 'joinPair ignora el label del cliente y numera un user agent desconocido');
await expectAllow('tras joinPair, el nuevo miembro lee', 'GET', `/pairs/${J}/notes`, { uid: A });
await expectCall('joinPair es idempotente', 'joinPair', { pairId: J }, A);
await expectCall('joinPair acepta minúsculas', 'joinPair', { pairId: J.toLowerCase() }, B);
check((await db.doc(`pairs/${J}/members/${B}`).get()).get('label') === 'Dispositivo 2', 'el siguiente desconocido es el 2');
await fetch(`${functionsBase}/joinPair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', ...auth('uid-ipad') },
  body: JSON.stringify({ data: { pairId: J, touch: true, label: '<b>iPhone de ella</b>' } }),
});
check((await db.doc(`pairs/${J}/members/uid-ipad`).get()).get('label') === 'iPad', 'joinPair saca la etiqueta del user agent (un iPad dice Macintosh, con táctil)');
await db.doc(`pairs/${J}/members/uid-ipad`).delete();
// Solo los miembros invitan, cierran o quitan
await expectCall('createInvite de un no miembro', 'createInvite', { pairId: J }, C, 'PERMISSION_DENIED');
await expectCall('lockPair de un no miembro', 'lockPair', { pairId: J }, C, 'PERMISSION_DENIED');
await expectCall('removeMember de un no miembro', 'removeMember', { pairId: J, uid: B }, C, 'PERMISSION_DENIED');
await expectCall('sendTestPush de un no miembro', 'sendTestPush', { pairId: J }, C, 'PERMISSION_DENIED');
// Con la pareja abierta cualquiera con el código es miembro: una cuenta nueva entra y lee, pero no cierra, ni
// quita, ni invita. Una cuenta de antes del corte sí (los móviles de siempre)
check((await db.doc(`pairs/${J}/members/${A}`).get()).get('via') === 'code' && (await db.doc(`pairs/${J}/members/${A}`).get()).get('trusted') === true, 'un móvil de antes del corte entra por código y queda de confianza');
await expectCall('joinPair de una cuenta nueva en abierta', 'joinPair', { pairId: J }, N);
check((await db.doc(`pairs/${J}/members/${N}`).get()).get('trusted') === false, 'la cuenta nueva queda marcada sin confianza (para Ajustes)');
await expectAllow('la cuenta nueva lee, como hoy', 'GET', `/pairs/${J}/notes`, { uid: N });
await expectCall('lockPair de una cuenta nueva', 'lockPair', { pairId: J }, N, 'PERMISSION_DENIED');
await expectCall('removeMember de una cuenta nueva', 'removeMember', { pairId: J, uid: A }, N, 'PERMISSION_DENIED');
await expectCall('createInvite de una cuenta nueva', 'createInvite', { pairId: J }, N, 'PERMISSION_DENIED');
await expectCall('joinPair de un uid que Auth no conoce', 'joinPair', { pairId: J }, 'uid-sin-cuenta');
await expectCall('lockPair de un uid que Auth no conoce', 'lockPair', { pairId: J }, 'uid-sin-cuenta', 'PERMISSION_DENIED');
check((await db.doc(`pairs/${J}`).get()).get('locked') !== true, 'nada de lo anterior ha cerrado la pareja');
await expectCall('un móvil de antes del corte quita a la cuenta nueva', 'removeMember', { pairId: J, uid: N }, A);
await expectCall('un móvil de antes del corte quita al uid sin cuenta', 'removeMember', { pairId: J, uid: 'uid-sin-cuenta' }, A);
// Al cerrar se borran las suscripciones push que no son de un miembro (también las sin uid); las de los miembros
// se quedan, así que sus móviles siguen recibiendo sin volver a pedir nada
const subsJ = { 'yo-a': A, 'ella-b': B, 'yo-quitado': N, 'ella-extrana': 'uid-x', 'sin-uid': null };
for (const [id, uid] of Object.entries(subsJ)) await db.doc(`pairs/${J}/pushSubs/${id}`).set({ endpoint: `https://example.invalid/${id}`, keys: { p256dh: 'k', auth: 'a' }, ...(uid ? { uid } : {}) });
await expectCall('lockPair de un miembro', 'lockPair', { pairId: J }, A);
check((await db.doc(`pairs/${J}`).get()).get('locked') === true, 'lockPair deja locked: true');
const leftJ = (await db.collection(`pairs/${J}/pushSubs`).get()).docs.map((d) => d.id).sort();
check(JSON.stringify(leftJ) === JSON.stringify(['ella-b', 'yo-a']), `lockPair deja solo las pushSubs de los miembros (${leftJ})`);
await expectAllow('tras cerrar, un miembro vuelve a escribir su pushSub', 'PATCH', `/pairs/${J}/pushSubs/yo-a`, { uid: A, body: writeAs('pushSubs', A) });
await expectDeny('tras cerrar, un no miembro no la escribe', 'PATCH', `/pairs/${J}/pushSubs/ella-extrana`, { uid: 'uid-x', body: writeAs('pushSubs', 'uid-x') });
// Cerrada: sin invitación no, con una mala no, con una buena sí y solo una vez
await expectCall('joinPair en una pareja cerrada sin invitación', 'joinPair', { pairId: J }, C, 'FAILED_PRECONDITION');
await expectCall('joinPair con una invitación inventada', 'joinPair', { pairId: J, invite: 'ABCDEFGH' }, C, 'PERMISSION_DENIED');
await expectCall('un miembro sigue entrando en su pareja cerrada', 'joinPair', { pairId: J }, A);
const inv = await expectCall('createInvite de un miembro', 'createInvite', { pairId: J }, A);
const code = inv.result?.code || '';
check(/^[A-Z2-9]{8}$/.test(code) && inv.result?.expiresAt > Date.now(), `createInvite devuelve un código de 8 y su caducidad (${code})`);
const stored = await db.collection('pairInvites').where('pairId', '==', J).get();
check(stored.size === 1 && !stored.docs.some((d) => JSON.stringify(d.data()).includes(code) || d.id.includes(code)), 'la invitación se guarda hasheada');
await expectCall('la invitación de otra pareja no vale', 'joinPair', { pairId: OTHER, invite: code }, C, 'PERMISSION_DENIED');
await expectCall('joinPair con la invitación (con guion y minúsculas)', 'joinPair', { pairId: J, invite: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` }, C);
check((await db.doc(`pairs/${J}/members/${C}`).get()).get('via') === 'invite', 'el member invitado queda marcado');
check((await db.doc(`pairs/${J}/members/${C}`).get()).get('trusted') === true, 'el invitado es de confianza aunque su cuenta sea nueva');
await expectCall('la invitación es de un solo uso', 'joinPair', { pairId: J, invite: code }, D, 'PERMISSION_DENIED');
const invC = await expectCall('el invitado (cuenta nueva) puede invitar', 'createInvite', { pairId: J }, C);
// Caducada: se siembra con el mismo hash que usa la función
const expired = 'KKKKKKKK';
await db.collection('pairInvites').doc(createHash('sha256').update(`${J}:${expired}`).digest('hex'))
  .set({ pairId: J, expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
await expectCall('una invitación caducada no vale', 'joinPair', { pairId: J, invite: expired }, D, 'PERMISSION_DENIED');
// Quitar un dispositivo: pierde el acceso y sus suscripciones push
await db.doc(`pairs/${J}/pushSubs/sub-c`).set({ uid: C, endpoint: 'https://example.invalid/c' });
await db.doc(`pairs/${J}/pushSubs/sub-a`).set({ uid: A, endpoint: 'https://example.invalid/a' });
await expectCall('un miembro no se quita a sí mismo', 'removeMember', { pairId: J, uid: A }, A, 'FAILED_PRECONDITION');
await expectCall('removeMember de un miembro', 'removeMember', { pairId: J, uid: C }, A);
check(!(await db.doc(`pairs/${J}/members/${C}`).get()).exists, 'el member quitado ya no existe');
check(!(await db.doc(`pairs/${J}/pushSubs/sub-c`).get()).exists && (await db.doc(`pairs/${J}/pushSubs/sub-a`).get()).exists, 'se borran solo sus pushSubs');
await expectDeny('el dispositivo quitado ya no lee', 'GET', `/pairs/${J}/notes`, { uid: C });
// Sus invitaciones se van con él, y una que quedase de alguien que ya no es miembro tampoco vale
check(!(await db.collection('pairInvites').where('pairId', '==', J).get()).docs.some((d) => d.get('createdBy') === C), 'removeMember borra las invitaciones del quitado');
await expectCall('la invitación del quitado ya no vale', 'joinPair', { pairId: J, invite: invC.result?.code }, D, 'PERMISSION_DENIED');
const huerfana = 'MMMMMMMM';
await db.collection('pairInvites').doc(createHash('sha256').update(`${J}:${huerfana}`).digest('hex'))
  .set({ pairId: J, createdBy: 'uid-que-ya-no-es-miembro', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
await expectCall('una invitación cuyo creador ya no es miembro no vale', 'joinPair', { pairId: J, invite: huerfana }, D, 'PERMISSION_DENIED');
await expectCall('el dispositivo quitado no vuelve a entrar sin invitación', 'joinPair', { pairId: J }, C, 'FAILED_PRECONDITION');

// --- Coste de las reglas: llamadas a exists()/get() por petición, contadas en el informe de cobertura del
// emulador (antes y después de cada petición). Cada documento distinto que miran se factura como una lectura ---
const coverageCalls = async () => {
  const c = await (await fetch(`http://${host}/emulator/v1/projects/demo-relacion:ruleCoverage`)).json();
  const content = c.rules.files[0].content;
  const out = {};
  const walk = (nodes) => {
    for (const n of nodes || []) {
      const p = n.sourcePosition || {};
      const txt = content.slice(p.currentOffset, p.endOffset);
      // Las llamadas de verdad: exists(...members...), exists(pair) y get(pair); no data.get('locked', …). Solo
      // cuentan los valores evaluados (el informe también lista nodos con valor `undefined`)
      const key = /^exists\(/.test(txt) ? (/members/.test(txt) ? 'exists(members/uid)' : 'exists(pairs/p)')
        : /^get\((?!')/.test(txt) ? 'get(pairs/p)' : '';
      if (key) {
        for (const v of n.values || []) {
          if ('boolValue' in v.value || 'mapValue' in v.value) out[key] = (out[key] || 0) + v.count;
        }
      }
      walk(n.children);
    }
  };
  walk(c.report);
  return out;
};
const cost = async (label, method, p, opts) => {
  const before = await coverageCalls();
  const s = await req(method, p, opts);
  const after = await coverageCalls();
  const delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - (before[k] || 0)]).filter(([, d]) => d > 0));
  // exists(pair) y get(pair) miran el mismo documento
  const docs = (delta['exists(members/uid)'] ? 1 : 0) + (delta['exists(pairs/p)'] || delta['get(pairs/p)'] ? 1 : 0);
  console.log(`COSTE ${label} (status ${s}): ${JSON.stringify(delta)} → ${docs} doc(s)`);
  return docs;
};
await db.doc('pairs/COSTE1/members/uid-c1').set({ joinedAt: Timestamp.now() });
for (let i = 0; i < 10; i++) await db.doc(`pairs/COSTE1/notes/n${i}`).set({ x: i });
await db.doc('pairs/COSTE2/members/uid-c2').set({ joinedAt: Timestamp.now() });
await db.doc('pairs/COSTE2').set({ locked: true });
// Miembro: un documento por petición, abierta o cerrada; una consulta cuenta una vez, no por documento devuelto
check(await cost('abierta sin doc, miembro 3.1, get', 'GET', '/pairs/COSTE1/notes/n1', { uid: 'uid-c1' }) === 1, 'coste: miembro, get = 1 doc');
check(await cost('abierta sin doc, miembro 3.1, list de 10 notas', 'GET', '/pairs/COSTE1/notes', { uid: 'uid-c1' }) === 1, 'coste: miembro, list de 10 = 1 doc');
check(await cost('abierta sin doc, miembro 3.1, write', 'PATCH', '/pairs/COSTE1/notes/n1', { uid: 'uid-c1', body: write }) === 1, 'coste: miembro, write = 1 doc');
check(await cost('cerrada, miembro, get', 'GET', '/pairs/COSTE2/notes/x', { uid: 'uid-c2' }) === 1, 'coste: cerrada, miembro, get = 1 doc');
// Cliente viejo (o 3.1 aún sin unirse) en una pareja abierta: dos documentos (members/uid y pairs/p)
check(await cost('abierta sin doc, cliente viejo (no miembro), get', 'GET', '/pairs/COSTE1/notes/n1', { uid: 'uid-viejo' }) === 2, 'coste: no miembro en abierta, get = 2 docs');
check(await cost('abierta sin doc, cliente viejo, list de 10 notas', 'GET', '/pairs/COSTE1/notes', { uid: 'uid-viejo' }) === 2, 'coste: no miembro en abierta, list de 10 = 2 docs');
check(await cost('cerrada, no miembro, get (denegado)', 'GET', '/pairs/COSTE2/notes/x', { uid: 'uid-viejo' }) === 2, 'coste: no miembro en cerrada = 2 docs');

if (failures.length) { console.error(`reglas FALLÓ: ${failures.length} check(s) en rojo`); process.exit(1); }
console.log('reglas OK');
process.exit(0);
