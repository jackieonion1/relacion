// Many photos at once (3.1, selection mode): their date (takenAt) and favourites, and finding the uploads done all
// at once, which is what «Fecha en bloque» is for
import { db, whenAuthed } from './firebase';
import { madridDayKey } from './photos';

// Writes per batch: under Firestore's 500, as the design says
export const LOTE = 400;
// From this many photos uploaded the same day without a date, the Gallery offers to date them
export const DE_GOLPE = 15;

let _fb;
async function fb() {
  if (!_fb) _fb = await import('firebase/firestore');
  return _fb;
}

// The same update on every photo of `ids`, in batches of LOTE; cambio(firestoreLib) gives the fields. A batch with a
// photo deleted meanwhile fails whole (F2), so then that batch goes again photo by photo, skipping the ones that are
// gone. updateDoc, never setDoc: nothing deleted comes back. Resolves with { hechas, borradas: [ids], fallidas: [ids] }
// once the server has answered (offline it waits: the writes are queued and go when the connection is back)
export async function actualizarEnLote(pairId, ids, cambio) {
  const res = { hechas: 0, borradas: [], fallidas: [] };
  if (!pairId || !db || !ids?.length) return res;
  await whenAuthed();
  const f = await fb();
  const col = f.collection(db, 'pairs', pairId, 'photos');
  for (let i = 0; i < ids.length; i += LOTE) {
    const trozo = ids.slice(i, i + LOTE);
    const batch = f.writeBatch(db);
    trozo.forEach((id) => batch.update(f.doc(col, id), cambio(f)));
    try {
      await batch.commit();
      res.hechas += trozo.length;
    } catch (e) {
      const unoAUno = await Promise.allSettled(trozo.map((id) => f.updateDoc(f.doc(col, id), cambio(f))));
      unoAUno.forEach((r, k) => {
        if (r.status === 'fulfilled') res.hechas += 1;
        else if (r.reason?.code === 'not-found') res.borradas.push(trozo[k]);
        else res.fallidas.push(trozo[k]);
      });
    }
  }
  return res;
}

// takenAt of every photo of `ids`: noon in Madrid of that day (madridMediodia), or null to take it away
export function ponerFecha(pairId, ids, takenAtMs) {
  return actualizarEnLote(pairId, ids, (f) => ({ takenAt: takenAtMs == null ? f.deleteField() : new Date(takenAtMs) }));
}

// Our name added to (or taken from) the favourites of every photo of `ids`
export function ponerFavorita(pairId, ids, identity, on) {
  return actualizarEnLote(pairId, ids, (f) => ({ favBy: on ? f.arrayUnion(identity) : f.arrayRemove(identity) }));
}

// madridDayKey goes through Intl: remembered per instant, since the grid asks again on every thumb that arrives
const dias = new Map();
function diaDe(ms) {
  let d = dias.get(ms);
  if (!d) {
    if (dias.size > 5000) dias.clear();
    d = madridDayKey(new Date(ms));
    dias.set(ms, d);
  }
  return d;
}

// The days (Madrid, by upload) with at least `min` photos still without a date, among the loaded ones: the
// uploads done all at once. Biggest first: [{ dia: 'YYYY-MM-DD', ms, ids }]. In the client, 0 reads
export function subidasDeGolpe(items, min = DE_GOLPE) {
  const porDia = new Map();
  (items || []).forEach((it) => {
    if (it.takenAt != null || !it.createdAt) return;
    const dia = diaDe(it.createdAt);
    if (!porDia.has(dia)) porDia.set(dia, { dia, ms: it.createdAt, ids: [] });
    porDia.get(dia).ids.push(it.id);
  });
  return [...porDia.values()].filter((d) => d.ids.length >= min).sort((a, b) => b.ids.length - a.ids.length || (a.dia < b.dia ? 1 : -1));
}

// The day ('YYYY-MM-DD', Madrid) all of these photos are dated, or '' when they have none or not the same one
export function fechaComun(items) {
  const comunes = new Set((items || []).map((it) => (it.takenAt != null ? diaDe(it.takenAt) : '')));
  return comunes.size === 1 ? [...comunes][0] : '';
}
