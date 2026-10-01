// Test de las reglas REALES de Firestore (firestore.rules, cableadas en firebase.test.json). Falla con exit 1.
//   firebase emulators:exec --config firebase.test.json --only functions,firestore --project demo-relacion "node functions/test/rules.mjs"
// Peticiones REST con un JWT sin firmar (el emulador no verifica la firma, como en smoke.mjs). Permitido = 200 o
// 404 (la regla dejó pasar; el doc no existe); denegado = 403. La siembra va por Admin SDK, que se salta las reglas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw new Error('FIRESTORE_EMULATOR_HOST no definido: ejecuta con emulators:exec');

const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid) => [{ alg: 'none', typ: 'JWT' }, { sub: uid, user_id: uid, aud: 'demo-relacion', iss: 'https://securetoken.google.com/demo-relacion', iat: 1, exp: 9999999999, firebase: { sign_in_provider: 'anonymous', identities: {} } }]
  .map(b64url).join('.') + '.';
const base = `http://${host}/v1/projects/demo-relacion/databases/(default)/documents`;
const req = async (method, p, { uid, body } = {}) => {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${jwt(uid)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
};
const allowed = (s) => s === 200 || s === 404;
const expectAllow = async (label, method, p, opts) => { const s = await req(method, p, opts); check(allowed(s), `ALLOW ${label} (status ${s})`); };
const expectDeny = async (label, method, p, opts) => { const s = await req(method, p, opts); check(s === 403, `DENY  ${label} (status ${s})`); };

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
const COLLECTIONS = ['locations', 'notes', 'photos', 'meta', 'pushSubs', 'mapState', 'music', 'events'];
check(used.size > 0 && [...used].every((c) => COLLECTIONS.includes(c)), `el cliente solo usa colecciones cubiertas aquí (${[...used].sort().join(', ')})`);

initializeApp({ projectId: 'demo-relacion' });
const db = getFirestore();
const PAIR = 'SEB1998';
for (const c of COLLECTIONS) await db.collection('pairs').doc(PAIR).collection(c).doc('d1').set({ x: 1 });

const ME = 'uid-me';
const write = { fields: { x: { integerValue: '2' } } };

// Todo lo que usa la app (entrada normal, por ?pair=, código de pareja y onboarding acaban en estas rutas)
for (const c of COLLECTIONS) {
  await expectAllow(`list ${c}`, 'GET', `/pairs/${PAIR}/${c}`, { uid: ME });
  await expectAllow(`get ${c}/d1`, 'GET', `/pairs/${PAIR}/${c}/d1`, { uid: ME });
  await expectAllow(`write ${c}/d2`, 'PATCH', `/pairs/${PAIR}/${c}/d2`, { uid: ME, body: write });
  await expectAllow(`delete ${c}/d2`, 'DELETE', `/pairs/${PAIR}/${c}/d2`, { uid: ME });
}
// Pareja nueva (código recién escrito en el onboarding o llegado por ?pair=): aún sin documentos
await expectAllow('list notes de una pareja nueva', 'GET', '/pairs/NUEVA42/notes', { uid: ME });
await expectAllow('alta de pushSubs en una pareja nueva', 'PATCH', '/pairs/NUEVA42/pushSubs/ella-abc', { uid: 'uid-otro', body: write });
await expectAllow('otro uid anónimo lee y escribe lo mismo (cambio de uid)', 'PATCH', `/pairs/${PAIR}/pushSubs/d1`, { uid: 'uid-otro', body: write });

// Sin sesión no entra nadie
await expectDeny('list notes sin auth', 'GET', `/pairs/${PAIR}/notes`);
await expectDeny('write notes sin auth', 'PATCH', `/pairs/${PAIR}/notes/d3`, { body: write });

// No se puede enumerar /pairs ni tocar el doc padre: ahí viven los códigos de pareja
await expectDeny('list /pairs', 'GET', '/pairs', { uid: ME });
await expectDeny('list /pairs?showMissing=true', 'GET', '/pairs?showMissing=true', { uid: ME });
await expectDeny(`get /pairs/${PAIR}`, 'GET', `/pairs/${PAIR}`, { uid: ME });
await expectDeny(`write /pairs/${PAIR}`, 'PATCH', `/pairs/${PAIR}`, { uid: ME, body: write });
await expectDeny('subcolección más profunda (la app no la usa)', 'GET', `/pairs/${PAIR}/notes/d1/sub/x`, { uid: ME });

if (failures.length) { console.error(`reglas FALLÓ: ${failures.length} check(s) en rojo`); process.exit(1); }
console.log('reglas OK');
process.exit(0);
