import React, { useCallback, useEffect, useRef, useState } from 'react';
import { thumbDeItem } from '../lib/photos';
import { fechaCorta } from '../lib/recuerdos';
import { fechaEfectiva } from '../lib/fotoFecha';

// The thumbs of a list of photos: { urls: id → url } and the `poner(id, url)` that lib/photos calls as each one
// arrives (its onThumb). The blob URLs are revoked when the screen goes, and one that arrives after that is
// revoked at once
export function useMiniaturas() {
  const [urls, setUrls] = useState({});
  const creadas = useRef(new Set());
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    const aRevocar = creadas.current;
    return () => {
      vivo.current = false;
      aRevocar.forEach((u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
      aRevocar.clear();
    };
  }, []);
  const poner = useCallback((id, url) => {
    if (!url) return;
    if (!vivo.current) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
    creadas.current.add(url);
    setUrls((u) => (u[id] ? u : { ...u, [id]: url }));
  }, []);
  return [urls, poner];
}

// True from the first time the element behind `ref` is within a screen of the viewport on (and always, where there
// is no IntersectionObserver): what a card with a cover waits for before asking for it
export function useVisible() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);
  return [ref, visible];
}

// Loads a list of photos while `deps` stay the same. `cargar(poner)` returns { items, thumbsDone? } from lib/recuerdos
// or lib/albumes (pass `poner` as its onThumb). { fase: 'carga' | 'lista' | 'error', fotos, urls, poner, listo,
// reintentar }; `listo` is true when the thumbs that were asked for have come in
export function useFotosDe(cargar, deps) {
  const [urls, poner] = useMiniaturas();
  const [estado, setEstado] = useState({ fase: 'carga', fotos: [], listo: false });
  const [intento, setIntento] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;
  useEffect(() => {
    let cancelado = false;
    setEstado({ fase: 'carga', fotos: [], listo: false });
    (async () => {
      try {
        const r = await cargarRef.current(poner);
        if (cancelado) return;
        setEstado({ fase: 'lista', fotos: r.items, listo: !r.thumbsDone });
        r.thumbsDone?.catch(() => {}).then(() => { if (!cancelado) setEstado((e) => ({ ...e, listo: true })); });
      } catch {
        if (!cancelado) setEstado({ fase: 'error', fotos: [], listo: false });
      }
    })();
    return () => { cancelado = true; };
  }, [...deps, intento, poner]);
  return { ...estado, urls, poner, reintentar: () => setIntento((k) => k + 1) };
}

function Celda({ foto, url, listo, pairId, poner, onTocar, seleccionando, marcada, i }) {
  const ref = useRef(null);
  // Once the thumbs of the first photos are in, the ones that were not asked for (see listarConTope) are fetched
  // when they come near the screen
  useEffect(() => {
    if (url || !listo || !pairId) return undefined;
    const pedir = () => thumbDeItem(pairId, foto).then((u) => poner(foto.id, u)).catch(() => {});
    if (typeof IntersectionObserver === 'undefined') { pedir(); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); pedir(); } }, { rootMargin: '240px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [url, listo, pairId, foto, poner]);

  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => onTocar(foto)}
        aria-label={`Foto del ${fechaCorta(fechaEfectiva(foto))}`}
        aria-pressed={seleccionando ? marcada : undefined}
        className={`mosaico-celda${marcada ? ' marcada' : ''}`}
        style={{ animationDelay: `${Math.min(i, 11) * 20}ms` }}
      >
        {url ? <img src={url} alt="" loading="lazy" /> : <span className="recuerdo-hueco" />}
        {seleccionando && (
          <span className="mosaico-marca" aria-hidden="true">
            {marcada && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

// A grid of photos (3 across, as in the gallery). `fotos` come from lib/recuerdos or lib/albumes and `urls` from
// useMiniaturas; `listo` says the first thumbs are in. `onTocar(foto)` opens one (or marks it, with `seleccion`, a
// Set of ids, which turns the grid into a selecting one)
export default function FotosMosaico({ fotos, urls, listo = true, pairId, poner, onTocar, seleccion = null, label = 'Fotos' }) {
  return (
    <ul className="grid grid-cols-3 gap-0.5" aria-label={label}>
      {fotos.map((foto, i) => (
        <Celda
          key={foto.id} foto={foto} url={urls[foto.id] || foto.thumbUrl} listo={listo} pairId={pairId} poner={poner}
          onTocar={onTocar} seleccionando={!!seleccion} marcada={!!seleccion?.has(foto.id)} i={i}
        />
      ))}
    </ul>
  );
}
