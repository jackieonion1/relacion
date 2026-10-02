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
  ...['yo-A', 'ella-A', 'yo-B', 'yo-C', 'yo-D'].map((uid) => ({ uid, metadata: OLD })),
  ...['mal-A', 'mal-B', 'mal-C', 'mal2-C'].map((uid) => ({ uid, metadata: NEW })),
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

// B. Suscripción push sembrada en abierto: no puede llevar el uid de otro, y no sobrevive al cierre ni a removeMember
{
  const P = 'ATKB';
  const sub = (uid) => ({ fields: { endpoint: { stringValue: 'https://attacker.example/push' }, keys: { mapValue: { fields: { p256dh: { stringValue: 'k' }, auth: { stringValue: 'a' } } } }, uid: { stringValue: uid }, identity: { stringValue: 'yo' }, enabled: { booleanValue: true } } });
  await call('joinPair', { pairId: P }, 'yo-B');
  await call('joinPair', { pairId: P }, 'mal-B');
  await db.doc(`pairs/${P}/pushSubs/yo-dev1`).set({ endpoint: 'https://push.example/yo', keys: { p256dh: 'k', auth: 'a' }, uid: 'yo-B' });
  check(await req('PATCH', `/pairs/${P}/pushSubs/yo-dev2`, 'mal-B', sub('yo-B')) === 403, 'B el extraño no escribe una pushSub con el uid de yo');
  check(await req('PATCH', `/pairs/${P}/pushSubs/yo-dev1`, 'mal-B', sub('yo-B')) === 403, 'B ni sobrescribe la de yo con el uid de yo');
  check(await req('PATCH', `/pairs/${P}/pushSubs/mal-dev`, 'mal-B', sub('mal-B')) === 200, 'B con su propio uid sí (abierta, como hoy)');
  check(await req('PATCH', `/pairs/${P}/pushSubs/nadie-dev`, 'nadie-B', sub('nadie-B')) === 200, 'B un no miembro también (abierta, como hoy)');
  await expectCall('B yo cierra', 'lockPair', { pairId: P }, 'yo-B');
  await expectCall('B yo quita al extraño', 'removeMember', { pairId: P, uid: 'mal-B' }, 'yo-B');
  const left = (await db.collection(`pairs/${P}/pushSubs`).get()).docs.map((d) => d.id).sort();
  check(JSON.stringify(left) === JSON.stringify(['yo-dev1']), `B tras cerrar y quitar solo queda la pushSub de yo (${left})`);
  check(await req('GET', `/pairs/${P}/pushSubs/yo-dev1`, 'mal-B') === 403, 'B el quitado no lee pushSubs');
}

// C. Un dispositivo invitado (de confianza) que luego se quita: sus invitaciones dejan de valer, y no vuelve
{
  const P = 'ATKC';
  await call('joinPair', { pairId: P }, 'yo-C');
  await call('lockPair', { pairId: P }, 'yo-C');
  const inv = await call('createInvite', { pairId: P }, 'yo-C');
  await expectCall('C entra un dispositivo con invitación', 'joinPair', { pairId: P, invite: inv.result?.code }, 'mal-C');
  const left = await expectCall('C el invitado deja otra invitación', 'createInvite', { pairId: P }, 'mal-C');
  await expectCall('C yo lo quita', 'removeMember', { pairId: P, uid: 'mal-C' }, 'yo-C');
  await expectCall('C otro uid no entra con la invitación que dejó', 'joinPair', { pairId: P, invite: left.result?.code }, 'mal2-C', 'PERMISSION_DENIED');
  check(await req('GET', `/pairs/${P}/notes/x`, 'yo-C') !== 403, 'C yo sigue dentro');
  check(JSON.stringify(await members(P)) === JSON.stringify(['yo-C']), 'C solo queda yo');
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

// I. Cápsula del tiempo: nadie (tampoco un miembro) lee el contenido antes de openAt, ni lo adelanta
{
  const P = 'ATKI';
  const docName = (p) => `projects/demo-relacion/databases/(default)/documents${p}`;
  const ts = (ms) => ({ timestampValue: new Date(ms).toISOString() });
  const FUTURO = Date.now() + 30 * 86400e3;
  const PASADO = Date.now() - 86400e3;
  await call('joinPair', { pairId: P }, 'yo-D');
  await call('lockPair', { pairId: P }, 'yo-D');
  // El sobre y el contenido, en un commit como el writeBatch del cliente; la foto, en Storage
  const sobre = (openAt) => ({ openAt: ts(openAt), fromIdentity: { stringValue: 'ella' }, forIdentity: { stringValue: 'yo' }, kind: { stringValue: 'foto' }, openedFor: { arrayValue: {} } });
  const secreto = (openAt) => ({ openAt: ts(openAt), text: { stringValue: 'sorpresa' }, mediaPath: { stringValue: `pairs/${P}/capsules/k1/${FUTURO}.jpg` } });
  const commit = async (uid, writes) => (await fetch(`${base}:commit`, { method: 'POST', headers: H(uid), body: JSON.stringify({ writes }) })).status;
  const crear = (id, a, b = a) => [
    { update: { name: docName(`/pairs/${P}/capsules/${id}`), fields: sobre(a) }, currentDocument: { exists: false } },
    { update: { name: docName(`/pairs/${P}/capsuleSecrets/${id}`), fields: secreto(b) }, currentDocument: { exists: false } },
  ];
  check(await commit('yo-D', crear('k1', FUTURO)) === 200, 'I se crea una cápsula sellada');
  check(await sstatus('POST', `pairs/${P}/capsules/k1/${FUTURO}.jpg`, 'yo-D') === 200, 'I se sube su foto');

  // Leer antes de tiempo: get, list, consultas (también filtrando por openAt), batchGet y collection group
  check(await req('GET', `/pairs/${P}/capsuleSecrets/k1`, 'yo-D') === 403, 'I get del contenido antes de openAt');
  check(await req('GET', `/pairs/${P}/capsuleSecrets`, 'yo-D') === 403, 'I list del contenido');
  const query = async (uid, structuredQuery, parent = `/pairs/${P}`) => (await fetch(`${base}${parent}:runQuery`, { method: 'POST', headers: H(uid), body: JSON.stringify({ structuredQuery }) })).status;
  check(await query('yo-D', { from: [{ collectionId: 'capsuleSecrets' }] }) === 403, 'I consulta sobre capsuleSecrets');
  check(await query('yo-D', { from: [{ collectionId: 'capsuleSecrets' }], where: { fieldFilter: { field: { fieldPath: 'openAt' }, op: 'LESS_THAN_OR_EQUAL', value: ts(Date.now()) } } }) === 403, 'I consulta con openAt <= ahora (las reglas no son filtros: se deniega entera)');
  check(await query('yo-D', { from: [{ collectionId: 'capsuleSecrets', allDescendants: true }] }, '') === 403, 'I collection group de capsuleSecrets');
  const batchGet = await fetch(`${base}:batchGet`, { method: 'POST', headers: H('yo-D'), body: JSON.stringify({ documents: [docName(`/pairs/${P}/capsuleSecrets/k1`)] }) });
  check(batchGet.status === 403, `I batchGet del contenido, sin caché que valga (status ${batchGet.status})`);
  // Storage: ni los metadatos (donde iría el token de descarga), ni los bytes, ni listar la carpeta
  check(await sstatus('GET', `pairs/${P}/capsules/k1/${FUTURO}.jpg`, 'yo-D') === 403, 'I Storage: metadatos de la foto antes de openAt');
  const media = await fetch(`http://${storageHost}/v0/b/demo-relacion.appspot.com/o/${encodeURIComponent(`pairs/${P}/capsules/k1/${FUTURO}.jpg`)}?alt=media`, { headers: { Authorization: `Bearer ${jwt('yo-D')}` } });
  check(media.status === 403, `I Storage: bytes de la foto antes de openAt (status ${media.status})`);
  const list = await fetch(`http://${storageHost}/v0/b/demo-relacion.appspot.com/o?prefix=${encodeURIComponent(`pairs/${P}/capsules/`)}`, { headers: { Authorization: `Bearer ${jwt('yo-D')}` } });
  check(list.status === 403, `I Storage: listar las fotos de las cápsulas (status ${list.status})`);
  check(await sstatus('POST', `pairs/${P}/capsules/k1/${FUTURO}.jpg`, 'yo-D') === 403, 'I Storage: reemplazar la foto sellada');

  // Adelantar la fecha: crear con openAt pasado, editar openAt (sobre o contenido), o borrar y recrear
  check(await commit('yo-D', crear('k2', PASADO)) === 403, 'I crear con openAt pasado');
  check(await commit('yo-D', crear('k3', FUTURO, PASADO)) === 403, 'I contenido con openAt pasado bajo un sobre futuro');
  check(await req('PATCH', `/pairs/${P}/capsules/k1?updateMask.fieldPaths=openAt`, 'yo-D', { fields: { openAt: ts(PASADO) } }) === 403, 'I editar openAt del sobre');
  check(await req('PATCH', `/pairs/${P}/capsuleSecrets/k1?updateMask.fieldPaths=openAt`, 'yo-D', { fields: { openAt: ts(PASADO) } }) === 403, 'I editar openAt del contenido');
  check(await req('PATCH', `/pairs/${P}/capsules/k1?updateMask.fieldPaths=openedFor&updateMask.fieldPaths=openAt`, 'yo-D', { fields: { openedFor: { arrayValue: {} }, openAt: ts(PASADO) } }) === 403, 'I colar openAt junto a openedFor');
  check(await commit('yo-D', [
    { delete: docName(`/pairs/${P}/capsuleSecrets/k1`) },
    { update: { name: docName(`/pairs/${P}/capsuleSecrets/k1`), fields: secreto(PASADO) } },
  ]) === 403, 'I borrar y recrear el contenido con openAt pasado');
  check(await req('GET', `/pairs/${P}/capsuleSecrets/k1`, 'yo-D') === 403, 'I tras todo lo anterior, el contenido sigue sellado');

  // De fuera de la pareja (cerrada): ni el sobre
  check(await req('GET', `/pairs/${P}/capsules/k1`, 'stranger') === 403, 'I extraño lee el sobre');
  check(await commit('stranger', crear('k4', FUTURO)) === 403, 'I extraño crea una cápsula');
}

// J. Cápsula, segunda ronda (adversario del lote C): borrar el sobre y el contenido y recrearlos con el mismo id y un
// openAt futuro pero cercano (+2 s) no adelanta la foto, que lleva su openAt en la ruta; la foto sellada tampoco se
// borra ni se reemplaza; y el texto no se recupera así (borrar el contenido lo destruye)
{
  const P = 'ATKJ';
  const docName = (p) => `projects/demo-relacion/databases/(default)/documents${p}`;
  const ts = (ms) => ({ timestampValue: new Date(ms).toISOString() });
  const so = `http://${storageHost}/v0/b/demo-relacion.appspot.com/o`;
  const commit = async (uid, writes) => (await fetch(`${base}:commit`, { method: 'POST', headers: H(uid), body: JSON.stringify({ writes }) })).status;
  const upload = async (p, uid, bytes) => (await fetch(`${so}?name=${encodeURIComponent(p)}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${jwt(uid)}` }, body: bytes })).status;
  const media = async (p, uid) => { const r = await fetch(`${so}/${encodeURIComponent(p)}?alt=media`, { headers: { Authorization: `Bearer ${jwt(uid)}` } }); return { status: r.status, body: r.status === 200 ? await r.text() : '' }; };
  const sdel = async (p, uid) => (await fetch(`${so}/${encodeURIComponent(p)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${jwt(uid)}` } })).status;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const foto = (p, id, openAt) => `pairs/${p}/capsules/${id}/${openAt}.jpg`;
  const sobre = (openAt) => ({ openAt: ts(openAt), fromIdentity: { stringValue: 'ella' }, forIdentity: { stringValue: 'yo' }, kind: { stringValue: 'foto' }, openedFor: { arrayValue: {} } });
  const secreto = (p, id, openAt, text, fotoAt = openAt) => ({ openAt: ts(openAt), text: { stringValue: text }, mediaPath: { stringValue: foto(p, id, fotoAt) } });
  const crear = (p, id, openAt, text, fotoAt) => [
    { update: { name: docName(`/pairs/${p}/capsules/${id}`), fields: sobre(openAt) }, currentDocument: { exists: false } },
    { update: { name: docName(`/pairs/${p}/capsuleSecrets/${id}`), fields: secreto(p, id, openAt, text, fotoAt) }, currentDocument: { exists: false } },
  ];
  const borrar = (p, id) => [{ delete: docName(`/pairs/${p}/capsules/${id}`) }, { delete: docName(`/pairs/${p}/capsuleSecrets/${id}`) }];
  const FUTURO = Date.now() + 30 * 86400e3;

  // Pareja cerrada: el otro miembro, curioso
  await call('joinPair', { pairId: P }, 'yo-D');
  await call('joinPair', { pairId: P }, 'yo-C');
  await call('lockPair', { pairId: P }, 'yo-D');
  check(await commit('yo-D', crear(P, 'j1', FUTURO, 'carta original')) === 200, 'J se crea una cápsula con foto');
  check(await upload(foto(P, 'j1', FUTURO), 'yo-D', 'FOTO-SECRETA') === 200, 'J se sube su foto');
  check((await media(foto(P, 'j1', FUTURO), 'yo-C')).status === 403, 'J el otro no lee la foto antes de tiempo');
  check(await commit('yo-C', borrar(P, 'j1')) === 200, 'J el otro borra sobre y contenido (borrar es de cualquiera)');
  const CERCA = Date.now() + 2000;
  check(await commit('yo-C', crear(P, 'j1', CERCA, 'falsa', FUTURO)) === 200, 'J el otro los recrea con openAt +2 s apuntando a la foto');
  await sleep(3000);
  const m = await media(foto(P, 'j1', FUTURO), 'yo-C');
  check(m.status === 403 && !m.body.includes('FOTO-SECRETA'), `J la foto sigue sellada tras recrear con openAt cercano (status ${m.status})`);
  const t = await fetch(`${base}/pairs/${P}/capsuleSecrets/j1`, { headers: H('yo-C') });
  const texto = t.status === 200 ? (await t.json()).fields?.text?.stringValue : '';
  check(texto !== 'carta original', `J el texto original no vuelve: se lee el recreado (${JSON.stringify(texto)})`);
  // La foto sellada no se borra ni se reemplaza (ni por la misma ruta)
  check(await sdel(foto(P, 'j1', FUTURO), 'yo-C') === 403, 'J borrar la foto sellada');
  check(await upload(foto(P, 'j1', FUTURO), 'yo-C', 'OTRA') === 403, 'J reemplazar la foto sellada');
  check(await upload(foto(P, 'j1', Date.now() - 1000), 'yo-C', 'OTRA') === 403, 'J subir una foto con openAt pasado');

  // Pareja abierta, un extraño que nunca se unió: misma vía
  const Q = 'ATKJ2';
  check(await commit('yo-B', crear(Q, 'j1', FUTURO, 'carta')) === 200, 'J abierta: se crea una cápsula con foto');
  check(await upload(foto(Q, 'j1', FUTURO), 'yo-B', 'FOTO-SECRETA') === 200, 'J abierta: se sube su foto');
  check(await commit('stranger', borrar(Q, 'j1')) === 200, 'J abierta: el extraño borra sobre y contenido');
  check(await commit('stranger', crear(Q, 'j1', Date.now() + 2000, 'x', FUTURO)) === 200, 'J abierta: el extraño los recrea con openAt +2 s');
  await sleep(3000);
  check((await media(foto(Q, 'j1', FUTURO), 'stranger')).status === 403, 'J abierta: el extraño no lee la foto sellada');

  // El sobre no se ensucia: openedFor solo crece con una identidad, sin campos enormes ni inventados, y nunca sin
  // su contenido (un sobre huérfano avisaría por la mañana y diría «Todavía no» para siempre)
  const openedFor = (...ids) => ({ fields: { openedFor: { arrayValue: ids.length ? { values: ids.map((s) => ({ stringValue: s })) } : {} } } });
  const marcar = (body) => req('PATCH', `/pairs/${P}/capsules/j2?updateMask.fieldPaths=openedFor`, 'yo-C', body);
  check(await commit('yo-D', crear(P, 'j2', FUTURO, 'carta')) === 200, 'J se crea otra cápsula');
  check(await marcar(openedFor('ella')) === 200, 'J openedFor admite una identidad');
  check(await marcar(openedFor('ella', 'yo')) === 200, 'J openedFor admite la otra después');
  check(await marcar(openedFor('ella')) === 403, 'J openedFor no se vacía (volvería a «Hoy se abre»)');
  check(await marcar(openedFor('ella', 'yo', 'x'.repeat(500))) === 403, 'J openedFor no admite basura');
  const P3 = 'j3';
  await db.doc(`pairs/${P}/capsules/${P3}`).set({ openAt: new Date(FUTURO), fromIdentity: 'yo', forIdentity: 'ella', kind: 'texto', openedFor: [] });
  check(await req('PATCH', `/pairs/${P}/capsules/${P3}?updateMask.fieldPaths=openedFor`, 'yo-C', openedFor('yo', 'ella')) === 403, 'J openedFor no gana dos identidades de golpe');
  const grande = crear(P, 'j4', FUTURO, 'carta');
  grande[0].update.fields.title = { stringValue: 'a'.repeat(900000) };
  check(await commit('yo-C', grande) === 403, 'J sobre con un title de 900 KB');
  const inventado = crear(P, 'j5', FUTURO, 'carta');
  inventado[0].update.fields.forIdentity = { stringValue: '<img src=x onerror=alert(1)>' };
  check(await commit('yo-C', inventado) === 403, 'J sobre con forIdentity inventado');
  check(await commit('yo-C', [crear(P, 'j6', FUTURO, 'carta')[0]]) === 403, 'J sobre sin contenido');
}

// K. El candado de morningReminders: si un cliente lo cogiera antes (create de mañana), no saldría ninguna push
{
  const manana = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  check(await req('PATCH', `/reminderLocks/ATKJ_${manana}`, 'yo-D', note) === 403, 'K un miembro no crea el candado de mañana');
  check(await req('PATCH', `/reminderLocks/ATKJ2_${manana}`, 'stranger', note) === 403, 'K en una pareja abierta, tampoco un extraño');
}

if (failures.length) { console.error(`ataques FALLÓ: ${failures.length} check(s) en rojo`); process.exit(1); }
console.log('ataques OK');
process.exit(0);
