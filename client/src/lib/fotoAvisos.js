// Unread photo comments: the dot on «Galería» in the tab bar and on the photos of the grid. One listener for the
// whole app (the tab bar and the Gallery share it), started by the first one that needs it and stopped with the last
import { useSyncExternalStore } from 'react';
import { escucharNoLeidos } from './fotoComentarios';

const EMPTY = new Map();
let porFoto = EMPTY; // photoId → unread comments
let total = 0;
let confirmado = false; // the server has answered at least once (before that it is only what the cache had)
let firma = '';
const subs = new Set();
let stop = null;

function publish(list, deCache) {
  const nuevoConfirmado = confirmado || !deCache;
  // The metadata changes come with the same list: nothing to tell then
  const nuevaFirma = list.map((c) => `${c.id}:${c.photoId}`).sort().join('|');
  if (nuevoConfirmado === confirmado && nuevaFirma === firma) return;
  const next = new Map();
  list.forEach((c) => { if (c.photoId) next.set(c.photoId, (next.get(c.photoId) || 0) + 1); });
  porFoto = next;
  total = list.length;
  confirmado = nuevoConfirmado;
  firma = nuevaFirma;
  subs.forEach((cb) => cb());
}

function start() {
  let pairId = '';
  let identity = '';
  try {
    pairId = localStorage.getItem('pairId') || '';
    identity = localStorage.getItem('identity') || '';
  } catch {}
  stop = escucharNoLeidos(pairId, identity, publish, (e) => console.warn('Unread comments listener failed', e));
}

function subscribe(cb) {
  subs.add(cb);
  if (!stop) start();
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && stop) {
      stop();
      stop = null;
      porFoto = EMPTY;
      total = 0;
      confirmado = false;
      firma = '';
    }
  };
}

// Map photoId → number of comments still unread by this phone's person (the same Map until something changes)
export function useNoLeidos() {
  return useSyncExternalStore(subscribe, () => porFoto, () => EMPTY);
}

// Whether the unread ones above are the server's word and not only the cache's: a comment that came in while the app
// was closed is not in the cache. Without Firebase it never is
export function useNoLeidosConfirmados() {
  return useSyncExternalStore(subscribe, () => confirmado, () => false);
}

// How many comments are unread, for the tab bar
export function useGaleriaBadge() {
  return useSyncExternalStore(subscribe, () => total, () => 0);
}
