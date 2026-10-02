// Smoke test para el emulador (falla con exit 1 si algo no funciona). Ejecutar desde la raíz del repo:
//   firebase emulators:exec --config firebase.test.json --only functions,firestore --project demo-relacion "node functions/test/smoke.mjs"
// firebase.test.json carga firestore.rules reales; la siembra por Admin SDK se las salta.
// index.js se traga los errores de los triggers, así que se asserta sobre efectos observables: un servidor
// HTTPS local hace de endpoint push y responde 410; web-push solo habla https, y el emulador de functions
// acepta el certificado autofirmado gracias a functions/.env.demo-relacion (NODE_TLS_REJECT_UNAUTHORIZED=0).
import crypto from 'node:crypto';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST no definido: ejecuta con emulators:exec');

const TIMEOUT_MS = 30000;
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Servidor push falso: cuenta peticiones por ruta y responde 410 (Gone)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/k.pem`, '-out', `${dir}/c.pem`, '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
const hits = {};
const server = https.createServer({ key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) }, (req, res) => {
  hits[req.url] = (hits[req.url] || 0) + 1;
  req.resume();
  res.writeHead(req.url.endsWith('/ok') ? 201 : 410).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

initializeApp({ projectId: 'demo-relacion' });
const db = getFirestore();

// Un par por trigger, para atribuir cada petición a su origen
async function seedSub(pairId, uid) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const ref = db.collection('pairs').doc(pairId).collection('pushSubs').doc('x');
  await ref.set({
    endpoint: `https://127.0.0.1:${port}/${pairId}`,
    keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(crypto.randomBytes(16)) },
    enabled: true,
    identity: 'smoke',
    uid,
  });
  return ref;
}
const subNote = await seedSub('NOTE', 'sub-uid');
const subEvent = await seedSub('EVENT', 'sub-uid');
const subTest = await seedSub('TEST', 'sub-uid');

// 1) sendTestPush sin auth -> unauthenticated y sin envío
const callUrl = 'http://127.0.0.1:5001/demo-relacion/europe-southwest1/sendTestPush';
const call = async (headers, pairId = 'TEST') => {
  const res = await fetch(callUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ data: { pairId } }) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const anon = await call({}).catch((e) => fail(`sendTestPush sin auth: fetch falló (${e?.message || e})`));
check(anon.json?.error?.status === 'UNAUTHENTICATED', `sendTestPush sin auth -> UNAUTHENTICATED (status ${anon.status}, ${JSON.stringify(anon.json)})`);
check(!hits['/TEST'], 'sendTestPush sin auth no envía ningún push');

// 2) sendTestPush con auth. El emulador no verifica la firma del ID token: basta un JWT sin firmar
const jwt = [{ alg: 'none', typ: 'JWT' }, { sub: 'caller-uid', user_id: 'caller-uid', aud: 'demo-relacion', iss: 'https://securetoken.google.com/demo-relacion', iat: 1, exp: 9999999999, firebase: { sign_in_provider: 'anonymous', identities: {} } }]
  .map((p) => b64url(JSON.stringify(p))).join('.') + '.';
const authed = await call({ Authorization: `Bearer ${jwt}` }).catch((e) => fail(`sendTestPush con auth: fetch falló (${e?.message || e})`));
check(authed.status === 200 && authed.json?.result?.ok === true, `sendTestPush con auth responde ok (status ${authed.status}, ${JSON.stringify(authed.json)})`);

// 2b) Dedupe por endpoint, exclusión por uid y 201 sin borrado. Par DEDUP: dos docs con el mismo endpoint
// vivo (/ok), uno del propio emisor (/self, excluido), dos docs con el mismo endpoint muerto (/dead) y uno de otro endpoint muerto
const seedDoc = async (pairId, id, endpoint, uid) => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const ref = db.collection('pairs').doc(pairId).collection('pushSubs').doc(id);
  await ref.set({ endpoint: `https://127.0.0.1:${port}/${endpoint}`, keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(crypto.randomBytes(16)) }, enabled: true, identity: id, uid });
  return ref;
};
const dd = {
  ok1: await seedDoc('DEDUP', 'ok1', 'ok', 'sub-uid'),
  ok2: await seedDoc('DEDUP', 'ok2', 'ok', 'sub-uid'),
  self: await seedDoc('DEDUP', 'self', 'self', 'caller-uid'),
  dead1: await seedDoc('DEDUP', 'dead1', 'dead', 'sub-uid'),
  dead2: await seedDoc('DEDUP', 'dead2', 'dead', 'sub-uid'),
  other: await seedDoc('DEDUP', 'other', 'other', 'sub-uid'),
};
const dedup = await call({ Authorization: `Bearer ${jwt}` }, 'DEDUP').catch((e) => fail(`sendTestPush DEDUP: fetch falló (${e?.message || e})`));
check(dedup.status === 200, `sendTestPush DEDUP responde 200 (status ${dedup.status})`);
check(hits['/ok'] === 1, `dos docs con el mismo endpoint -> un solo envío (peticiones: ${hits['/ok'] || 0})`);
check(!hits['/self'], `sub del emisor excluida por uid (peticiones: ${hits['/self'] || 0})`);
check(hits['/dead'] === 1, `endpoint compartido muerto -> un solo envío (peticiones: ${hits['/dead'] || 0})`);
check(hits['/other'] === 1, `endpoint distinto se envía (peticiones: ${hits['/other'] || 0})`);
const exists = async (k) => (await dd[k].get()).exists;
check((await exists('ok1')) && (await exists('ok2')), 'la dedupe y el 201 no borran docs');
check(await exists('self'), 'la sub excluida no se toca');
check(!(await exists('dead1')) && !(await exists('dead2')), '410 borra todos los docs que comparten el endpoint');
check(!(await exists('other')), '410 borra el doc del otro endpoint');

// 3) Triggers: crean nota y evento y esperamos a que intenten enviar
const pair = (id) => db.collection('pairs').doc(id);
await pair('NOTE').collection('notes').add({ title: 'Nota smoke', plain: 'Cuerpo de prueba', identity: 'otro', createdBy: 'otro-uid', createdAt: FieldValue.serverTimestamp() });
await pair('EVENT').collection('events').add({ title: 'Evento smoke', description: 'Descripción de prueba', createdBy: 'otro-uid', createdAt: FieldValue.serverTimestamp() });

// Efecto observable: petición recibida y, tras el 410, suscripción borrada
const deadline = Date.now() + TIMEOUT_MS;
const subs = { NOTE: subNote, EVENT: subEvent, TEST: subTest };
const gone = {};
while (Date.now() < deadline) {
  for (const [id, ref] of Object.entries(subs)) if (!gone[id] && hits[`/${id}`] && !(await ref.get()).exists) gone[id] = true;
  if (Object.keys(subs).every((id) => gone[id])) break;
  await sleep(250);
}
check(hits['/NOTE'] >= 1, `onNewNote intentó enviar (peticiones: ${hits['/NOTE'] || 0})`);
check(hits['/EVENT'] >= 1, `onNewEvent intentó enviar (peticiones: ${hits['/EVENT'] || 0})`);
check(hits['/TEST'] === 1, `sendTestPush con auth envió (peticiones: ${hits['/TEST'] || 0})`);
for (const id of Object.keys(subs)) check(gone[id] === true, `suscripción ${id} borrada tras 410`);

// 4) onNewPhotoComment: avisa al otro (ella) y no a quien comenta (yo), ni por identidad ni por uid
await seedDoc('COMMENT', 'ella', 'comment-ella', 'ella-uid');
await seedDoc('COMMENT', 'yo', 'comment-yo', 'yo-uid');
await seedDoc('COMMENT', 'yo-otro', 'comment-mismo-uid', 'yo-uid');
await pair('COMMENT').collection('photoComments').add({ photoId: 'F1', text: 'Qué foto más bonita', identity: 'yo', createdBy: 'yo-uid', unreadFor: ['ella'], createdAt: FieldValue.serverTimestamp() });
const commentDeadline = Date.now() + TIMEOUT_MS;
while (Date.now() < commentDeadline && !hits['/comment-ella']) await sleep(250);
await sleep(500); // por si llegara también a quien comenta
check(hits['/comment-ella'] === 1, `onNewPhotoComment avisa al otro (peticiones: ${hits['/comment-ella'] || 0})`);
check(!hits['/comment-yo'] && !hits['/comment-mismo-uid'], 'onNewPhotoComment no avisa a quien comenta');

server.close();
fs.rmSync(dir, { recursive: true, force: true });
if (failures.length) { console.error(`smoke FALLÓ: ${failures.length} check(s) en rojo (timeout ${TIMEOUT_MS} ms)`); process.exit(1); }
console.log('smoke OK');
process.exit(0);
