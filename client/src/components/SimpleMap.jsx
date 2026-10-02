import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { createPortal } from 'react-dom';
import Sheet from './Sheet';
import Button from './Button';
import Field from './Field';
import { db, whenAuthed, listenWhenAuthed } from '../lib/firebase';
import { geocodeCity } from '../lib/weather';
import { ROLE_LABELS } from '../lib/eventTypes';

const STORAGE_KEY = (pairId, role) => `pair_${pairId || 'default'}_${role}_location`;

// 🫒 is him (novio), 🍪 is her (novia), as in the identity and the coin
const PEOPLE = [
  { role: 'novio', emoji: '🫒' },
  { role: 'novia', emoji: '🍪' },
];

let _fb;
async function fb() {
  if (!_fb) {
    _fb = await import('firebase/firestore');
  }
  return _fb;
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

// One person on the schematic map: centred on its point, the city chip below grows inwards so it never leaves the map
function Marker({ emoji, city, x, y, align }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-card shadow-flota text-xl" aria-hidden="true">{emoji}</span>
      <span className={`absolute top-full mt-1.5 ${align === 'right' ? 'right-0' : 'left-0'} max-w-[10rem] truncate px-2.5 py-1 rounded-[12px] bg-paper text-xs font-semibold text-ink-2`}>
        {city || 'Sin ciudad'}
      </span>
    </div>
  );
}

// The map of the "En casa" state. `children` (the state buttons) go between the distance and the two cities
export default function SimpleMap({ children }) {
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  // Each one edits only their own city; the other row is read-only
  const ownRole = identity === 'ella' ? 'novia' : 'novio';

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
  const [geoFailed, setGeoFailed] = useState(false); // both cities set but one could not be located (or timed out)
  const [retry, setRetry] = useState(0);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ city: '', addr1: '', addr2: '' });
  const [saveError, setSaveError] = useState(''); // write rejected after the modal was closed

  // Firestore listener to sync locations across clients
  useEffect(() => {
    if (!pairId || !db) return;
    // Sync unsubscribe: a cleanup before the session/import arrives still cancels it. On error the local cache stays
    const onError = (err) => console.warn('Locations listener:', err?.code || err?.message || err);
    return listenWhenAuthed(async () => {
      const f = await fb();
      const col = f.collection(db, 'pairs', pairId, 'locations');
      return f.onSnapshot(col, (snap) => {
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
      }, onError);
    }, onError);
  }, [pairId]);

  // Recompute distance when cities change, or on «Reintentar» (failed lookups are not cached, so it asks again)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cityA = novio?.city || '';
      const cityB = novia?.city || '';
      setGeoFailed(false);
      if (!cityA || !cityB) { setDistanceKm(null); return; }
      setLoadingDist(true);
      try {
        const [a, b] = await Promise.all([geocodeCity(cityA), geocodeCity(cityB)]);
        if (!a || !b) { if (!cancelled) { setDistanceKm(null); setGeoFailed(true); } return; }
        const km = kmDistance(a.lat, a.lon, b.lat, b.lon);
        if (!cancelled) setDistanceKm(Math.round(km * 100) / 100);
      } finally {
        if (!cancelled) setLoadingDist(false);
      }
    })();
    return () => { cancelled = true; };
  }, [novio?.city, novia?.city, retry]);

  // Open modal prefilled for current identity
  function openUpdateModal() {
    const current = ownRole === 'novia' ? novia : novio;
    setForm({ city: current?.city || '', addr1: current?.addr1 || '', addr2: current?.addr2 || '' });
    setIsModalOpen(true);
  }

  function onChangeField(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function saveLocation(e) {
    e.preventDefault();
    const role = ownRole;
    const payload = { city: form.city.trim(), addr1: form.addr1.trim(), addr2: form.addr2.trim() };
    // Always keep local cache
    try { localStorage.setItem(STORAGE_KEY(pairId, role), JSON.stringify(payload)); } catch {}
    // Close at once: offline the server ack never arrives (the write stays queued)
    if (role === 'novio') setNovio(payload); else setNovia(payload);
    setIsModalOpen(false);
    setSaveError('');
    // Firestore write for sync (if configured); only a rejection is shown
    try {
      if (pairId && db) {
        const user = await whenAuthed(Infinity); // modal already closed: wait out a slow sign-in instead of dropping the write
        if (!user) throw new Error('no-auth');
        const f = await fb();
        const ref = f.doc(f.collection(db, 'pairs', pairId, 'locations'), role);
        await f.setDoc(ref, { ...payload, updatedAt: f.serverTimestamp() }, { merge: true });
      }
    } catch (err) {
      // Non-fatal; local cache remains
      console.warn('Failed to write location to Firestore', err);
      setSaveError('No se pudo guardar la ubicación. La otra persona no la verá.');
    }
  }

  const places = { novio, novia };
  const ownEmoji = PEOPLE.find((p) => p.role === ownRole).emoji;
  const distanceText = loadingDist ? 'Calculando…' : (distanceKm != null ? `${distanceKm} km` : '— km');

  return (
    <>
      {geoFailed ? (
        <section role="alert" className="h-[280px] rounded-hero bg-sunk flex flex-col items-center justify-center gap-2.5 text-center p-6">
          <p className="text-base font-semibold text-ink">No se pudo cargar dónde estáis</p>
          <p className="text-[13px] text-ink-2 max-w-[260px]">Puede que falle la conexión o que no encuentre una de las ciudades.</p>
          <Button variant="sec" onClick={() => setRetry((n) => n + 1)}>Reintentar</Button>
        </section>
      ) : (
        <div
          role="img"
          aria-label={`Mapa: ${ROLE_LABELS.novio} en ${novio?.city || 'sin ciudad'}, ${ROLE_LABELS.novia} en ${novia?.city || 'sin ciudad'}`}
          className="mapa-plano relative h-[280px] rounded-hero overflow-hidden border border-line"
        >
          <svg viewBox="0 0 358 280" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 w-full h-full">
            <path d="M86 200 Q 170 40 272 84" fill="none" strokeWidth="2" strokeDasharray="6 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--lacre)' }} />
          </svg>
          <Marker emoji="🫒" city={novio?.city} x="24%" y="71.4%" align="left" />
          <Marker emoji="🍪" city={novia?.city} x="76%" y="30%" align="right" />
        </div>
      )}

      <div className="flex items-baseline justify-between px-1 pt-3.5">
        <span className="etiqueta">Distancia</span>
        <span className="serif num text-[28px] text-ink" aria-live="polite">🏠 {distanceText}</span>
      </div>

      {children}

      {/* Address details: your row opens the sheet, the other one is read-only */}
      <section aria-label="Dónde está cada uno" className="pt-[18px]">
        <div className="rounded-tarjeta bg-card border border-line overflow-hidden">
          {PEOPLE.map(({ role, emoji }, i) => {
            const place = places[role] || {};
            const own = role === ownRole;
            const Row = own ? 'button' : 'div';
            return (
              <Row
                key={role}
                {...(own ? { type: 'button', onClick: openUpdateModal } : {})}
                className={`flex items-center gap-3 w-full min-h-14 px-4 py-2.5 text-left ${i ? 'border-t border-line' : ''}`}
              >
                <span className="flex items-center justify-center flex-none w-10 h-10 rounded-full bg-sunk text-xl" aria-hidden="true">{emoji}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-xs font-semibold text-ink-2">{ROLE_LABELS[role]}{own ? ' · tú' : ''}</span>
                  <span className="text-base text-ink">{place.city || (own ? 'Añade tu ciudad' : '—')}</span>
                  {place.addr1 ? <span className="text-[13px] text-ink-2">{place.addr1}</span> : null}
                  {place.addr2 ? <span className="text-[13px] text-ink-2">{place.addr2}</span> : null}
                </span>
                {own && <><Icon name="editar" size={20} className="text-ink-2 flex-none" /><span className="sr-only">Editar tu ciudad</span></>}
              </Row>
            );
          })}
        </div>
      </section>

      {saveError && (
        <div role="alert" className="mt-3 flex items-center justify-between gap-3 px-1 text-[13px] text-danger">
          <span>{saveError}</span>
          <Button variant="txt" icon="cerrar" label="Cerrar aviso" onClick={() => setSaveError('')} />
        </div>
      )}

      {/* FAB to update location */}
      {createPortal(
        <Button size="m" icon="lugar" className="fab shadow-flota" onClick={openUpdateModal}>
          Actualizar ubicación
        </Button>,
        document.body
      )}

      {/* Sheet update */}
      <Sheet isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={saveLocation} className="flex flex-col gap-3 px-5 pt-2 pb-[34px]">
          <h2 className="serif text-[26px] leading-[1.15] font-normal flex items-center gap-2.5">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-sunk text-xl" aria-hidden="true">{ownEmoji}</span>
            Dónde estás
          </h2>
          <Field label="Ciudad" name="city" value={form.city} onChange={onChangeField} placeholder="Ciudad" required />
          <Field
            label={<>Dirección 1 <span className="normal-case tracking-normal font-medium">(opcional)</span></>}
            name="addr1"
            value={form.addr1}
            onChange={onChangeField}
            placeholder="Calle, número"
          />
          <Field
            label={<>Dirección 2 <span className="normal-case tracking-normal font-medium">(opcional)</span></>}
            name="addr2"
            value={form.addr2}
            onChange={onChangeField}
            placeholder="Barrio, CP, provincia"
          />
          <p className="text-[13px] text-ink-2">Solo la ve la otra persona, para el mapa y la distancia.</p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="sec" size="l" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button type="submit" size="l">Guardar</Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
