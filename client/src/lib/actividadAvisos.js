// The bell of Inicio: what the other one has done, and how much of it is unseen. One listener for the whole app
// (the entries and the «visto» doc), started by the first one that needs it and stopped with the last, like fotoAvisos
import { useSyncExternalStore } from 'react';
import { escucharActividad, escucharVisto, marcarVisto, paraMi, noLeidas } from './actividad';
import { CAMBIO_IDENTIDAD } from './fotoAvisos';

const EMPTY = { lista: [], vistoHasta: 0, noLeidas: 0, listo: false };
let estado = EMPTY;
let todas = [];
let visto = 0;
let llegaron = { lista: false, visto: false };
let quien = { pairId: '', identity: '' };
const subs = new Set();
let stops = null;

function publish() {
  const lista = paraMi(todas, quien.identity);
  // Until «visto» has answered nothing is unseen: a cold start would light the bell for everything
  const listo = llegaron.lista && llegaron.visto;
  estado = { lista, vistoHasta: visto, noLeidas: listo ? noLeidas(lista, visto) : 0, listo };
  subs.forEach((cb) => cb());
}

function start() {
  let pairId = '';
  let identity = '';
  try {
    pairId = localStorage.getItem('pairId') || '';
    identity = localStorage.getItem('identity') || '';
  } catch {}
  quien = { pairId, identity };
  const warn = (e) => console.warn('Activity listener failed', e);
  stops = [
    escucharActividad(pairId, (list) => { todas = list; llegaron = { ...llegaron, lista: true }; publish(); }, warn),
    escucharVisto(pairId, identity, (ms) => { visto = Math.max(visto, ms); llegaron = { ...llegaron, visto: true }; publish(); }, warn),
  ];
}

function reset() {
  stops.forEach((s) => s());
  stops = null;
  estado = EMPTY;
  todas = [];
  visto = 0;
  llegaron = { lista: false, visto: false };
}

function onIdentidad() {
  if (!stops) return;
  reset();
  start();
  subs.forEach((cb) => cb());
}

function subscribe(cb) {
  subs.add(cb);
  if (!stops) {
    start();
    window.addEventListener(CAMBIO_IDENTIDAD, onIdentidad);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && stops) {
      window.removeEventListener(CAMBIO_IDENTIDAD, onIdentidad);
      reset();
    }
  };
}

// { lista (newest first, for this phone's person), vistoHasta (ms), noLeidas, listo }
export function useActividad() {
  return useSyncExternalStore(subscribe, () => estado, () => EMPTY);
}

// Everything shown is seen: the bell goes out now, and one write tells the other phones of this person. Nothing new,
// no write
export function verActividad() {
  const newest = estado.lista[0]?.ms || 0;
  if (!stops || newest <= visto) return;
  visto = newest;
  publish();
  marcarVisto(quien.pairId, quien.identity, newest).catch((e) => console.warn('Activity seen failed', e));
}
