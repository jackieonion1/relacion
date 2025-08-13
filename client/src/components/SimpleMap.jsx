import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { db, auth, authReady } from '../lib/firebase';

const STORAGE_KEY = (pairId, role) => `pair_${pairId || 'default'}_${role}_location`;

let _fb;
async function fb() {
  if (!_fb) {
    _fb = await import('firebase/firestore');
  }
  return _fb;
}

async function waitAuth(timeout = 1200) {
  if (!authReady) return;
  try {
    await Promise.race([
      authReady,
      new Promise((res) => setTimeout(res, timeout)),
    ]);
  } catch {}
}

function kmDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const geocodeCache = new Map();
function withTimeout(promise, ms = 6000) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) resolve(null); }, ms);
    promise.then((v) => { settled = true; clearTimeout(t); resolve(v); })
           .catch(() => { settled = true; clearTimeout(t); resolve(null); });
  });
}
async function geocodeCity(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  // Primary: Open-Meteo
  const url1 = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}&count=1&language=es&format=json`;
  const p1 = (async () => {
    const res = await fetch(url1, { mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lon: r.longitude };
  })();
  let out = await withTimeout(p1, 6000);
  // Fallback: maps.co (Nominatim proxy) if primary fails/times out
  if (!out) {
    const url2 = `https://geocode.maps.co/search?q=${encodeURIComponent(key)}&format=json&limit=1`;
    const p2 = (async () => {
      const res = await fetch(url2, { mode: 'cors' });
      if (!res.ok) return null;
      const data = await res.json();
      const r = Array.isArray(data) ? data[0] : null;
      if (!r) return null;
      const lat = parseFloat(r.lat); const lon = parseFloat(r.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
      return null;
    })();
    out = await withTimeout(p2, 6000);
  }
  if (out) geocodeCache.set(key, out);
  return out;
}

export default function SimpleMap({ onDistanceChange }) {
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);

  // Stored addresses
  const [novio, setNovio] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY(pairId, 'novio')) || '{}'); } catch { return {}; }
  });
  const [novia, setNovia] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY(pairId, 'novia')) || '{}'); } catch { return {}; }
  });

  // Distance state
  const [distanceKm, setDistanceKm] = useState(null);
  const [loadingDist, setLoadingDist] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ city: '', addr1: '', addr2: '' });

  // Firestore listener to sync locations across clients
  useEffect(() => {
    if (!pairId || !db) return;
    let unsubscribe = null;
    (async () => {
      const f = await fb();
      const col = f.collection(db, 'pairs', pairId, 'locations');
      unsubscribe = f.onSnapshot(col, (snap) => {
        let n = {}, v = {};
        snap.forEach((doc) => {
          if (doc.id === 'novio') n = doc.data();
          if (doc.id === 'novia') v = doc.data();
        });
        setNovio(n);
        setNovia(v);
        // Keep a local cache as fallback
        try { localStorage.setItem(STORAGE_KEY(pairId, 'novio'), JSON.stringify(n || {})); } catch {}
        try { localStorage.setItem(STORAGE_KEY(pairId, 'novia'), JSON.stringify(v || {})); } catch {}
      });
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [pairId]);

  // Recompute distance when cities change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cityA = novio?.city || '';
      const cityB = novia?.city || '';
      if (!cityA || !cityB) { setDistanceKm(null); return; }
      setLoadingDist(true);
      try {
        const [a, b] = await Promise.all([geocodeCity(cityA), geocodeCity(cityB)]);
        if (!a || !b) { if (!cancelled) setDistanceKm(null); return; }
        const km = kmDistance(a.lat, a.lon, b.lat, b.lon);
        if (!cancelled) setDistanceKm(Math.round(km * 100) / 100);
      } finally {
        if (!cancelled) setLoadingDist(false);
      }
    })();
    return () => { cancelled = true; };
  }, [novio?.city, novia?.city]);

  // Notify parent (container view) about current distance and cities
  useEffect(() => {
    if (typeof onDistanceChange === 'function') {
      onDistanceChange({
        distanceKm,
        loading: loadingDist,
        cities: {
          novio: novio?.city || '',
          novia: novia?.city || '',
        },
      });
    }
  }, [onDistanceChange, distanceKm, loadingDist, novio?.city, novia?.city]);

  // Open modal prefilled for current identity
  function openUpdateModal() {
    const role = identity === 'ella' ? 'novia' : 'novio';
    const current = role === 'novia' ? novia : novio;
    setForm({ city: current?.city || '', addr1: current?.addr1 || '', addr2: current?.addr2 || '' });
    setIsModalOpen(true);
  }

  function onChangeField(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function saveLocation(e) {
    e.preventDefault();
    const role = identity === 'ella' ? 'novia' : 'novio';
    const payload = { city: form.city.trim(), addr1: form.addr1.trim(), addr2: form.addr2.trim() };
    // Always keep local cache
    try { localStorage.setItem(STORAGE_KEY(pairId, role), JSON.stringify(payload)); } catch {}
    // Firestore write for sync (if configured)
    try {
      if (pairId && db) {
        await waitAuth();
        const f = await fb();
        const ref = f.doc(f.collection(db, 'pairs', pairId, 'locations'), role);
        await f.setDoc(ref, { ...payload, updatedAt: f.serverTimestamp() }, { merge: true });
      }
    } catch (err) {
      // Non-fatal; local cache remains
      console.warn('Failed to write location to Firestore', err);
    }
    if (role === 'novio') setNovio(payload); else setNovia(payload);
    setIsModalOpen(false);
  }

  return (
    <div className="mt-2 p-2 bg-gray-50 rounded-xl">
      <div className="relative h-32 bg-gradient-to-br from-blue-100 to-green-100 rounded-lg overflow-hidden">
        {/* Novio marker (left side) */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-center">
          <div className="text-2xl mb-1">📍</div>
          <div className="text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded shadow-sm">
            Novio
          </div>
        </div>

        {/* Novia marker (right side) */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-center">
          <div className="text-2xl mb-1">📍</div>
          <div className="text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded shadow-sm">
            Novia
          </div>
        </div>

        {/* Arrow between cities */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center text-gray-600">
            <div className="w-16 h-0.5 bg-gray-400" />
            <div className="text-lg">→</div>
            <div className="w-16 h-0.5 bg-gray-400" />
          </div>
        </div>

        {/* Distance label */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2">
          <div className="text-xs font-medium text-gray-600 bg-white px-2 py-1 rounded shadow-sm">
            {loadingDist ? 'Calculando…' : (distanceKm != null ? `${distanceKm} km` : '— km')}
          </div>
        </div>
      </div>

      {/* Address details */}
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-gray-600">
        <div className="text-left">
          <div className="font-medium text-gray-800">{novio?.city || '—'}</div>
          {novio?.addr1 ? <div>{novio.addr1}</div> : null}
          {novio?.addr2 ? <div>{novio.addr2}</div> : null}
        </div>
        <div className="text-right">
          <div className="font-medium text-gray-800">{novia?.city || '—'}</div>
          {novia?.addr1 ? <div>{novia.addr1}</div> : null}
          {novia?.addr2 ? <div>{novia.addr2}</div> : null}
        </div>
      </div>

      {/* FAB to update location */}
      {createPortal(
        <button
          className="fab btn-primary shadow-lg rounded-full px-5 py-3 font-semibold"
          onClick={openUpdateModal}
        >
          Actualizar ubicación
        </button>,
        document.body
      )}

      {/* Modal update */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={saveLocation} className="p-6 space-y-4">
          <h3 className="font-semibold text-lg">Actualizar ubicación ({identity === 'ella' ? 'Novia' : 'Novio'})</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Ciudad</label>
              <input
                name="city"
                className="input w-full"
                value={form.city}
                onChange={onChangeField}
                placeholder="Ciudad"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Dirección 1 (opcional)</label>
              <input
                name="addr1"
                className="input w-full"
                value={form.addr1}
                onChange={onChangeField}
                placeholder="Calle, número"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Dirección 2 (opcional)</label>
              <input
                name="addr2"
                className="input w-full"
                value={form.addr2}
                onChange={onChangeField}
                placeholder="Barrio, CP, provincia"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-ghost">Cancelar</button>
            <button className="btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
