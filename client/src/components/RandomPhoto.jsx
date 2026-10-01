import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { getDailyPhotoId, getOriginal, getOriginalUrl, madridDayKey } from '../lib/photos';

export default function RandomPhoto() {
  const [photo, setPhoto] = useState(null); // { id, src, fallbackUrl, source }
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const revokeRef = useRef(null);
  // Día de Madrid y foto ya pintados: el reloj solo recarga cuando cambia el día (sin parpadeo cada minuto)
  const shownRef = useRef({ day: '', id: '' });

  useEffect(() => {
    let cancelled = false;
    let running = false; // un tick no arranca otra carga mientras la anterior sigue en curso
    // El blob anterior se revoca después de pintar el nuevo, no antes (si no, el <img> se queda en blanco)
    function swapBlob(url) {
      const prev = revokeRef.current;
      revokeRef.current = url;
      if (prev && prev !== url) { try { URL.revokeObjectURL(prev); } catch {} }
    }
    async function pickDaily() {
      if (running) return;
      running = true;
      const day = madridDayKey();
      try {
        const pairId = localStorage.getItem('pairId');
        if (!pairId) return;
        const id = await getDailyPhotoId(pairId);
        if (cancelled) return;
        // Sin id (sin fotos o sin red) no se da el día por hecho: el siguiente tick lo vuelve a intentar.
        // Si ya había una foto pintada se queda (un fallo de red no debe dejar «Sin fotos»)
        if (!id) { if (!shownRef.current.id) setPhoto(null); shownRef.current.day = ''; return; }
        if (id === shownRef.current.id) { shownRef.current.day = day; return; }
        // Cargar HD: intentar blob cacheado/descargar y usar blob:URL; preparar fallback remota
        let blob = null;
        try { blob = await getOriginal(pairId, id); } catch {}
        if (cancelled) return;
        if (blob && (!blob.size || blob.size > 32)) {
          const blobUrl = URL.createObjectURL(blob);
          setPhoto({ id, src: blobUrl, fallbackUrl: '', source: 'blob' });
          swapBlob(blobUrl);
          shownRef.current = { day, id };
          // Prepara fallback remota por si iOS falla renderizando el blob
          getOriginalUrl(pairId, id)
            .then((remote) => {
              if (!cancelled && remote) {
                setPhoto((p) => (p && p.id === id ? { ...p, fallbackUrl: remote } : p));
              }
            })
            .catch(() => {});
        } else {
          // No hay blob (todavía): usa URL remota (HD) como fuente
          const remote = await getOriginalUrl(pairId, id);
          if (cancelled) return;
          setPhoto(remote ? { id, src: remote, fallbackUrl: '', source: 'remote' } : null);
          swapBlob(null);
          shownRef.current = remote ? { day, id } : { day: '', id: '' };
        }
      } catch (e) {
        console.error('Error fetching daily photo:', e);
      } finally {
        running = false;
        if (!cancelled) setLoading(false);
      }
    }
    function checkDay() {
      if (madridDayKey() !== shownRef.current.day) pickDaily();
    }
    function onVisible() {
      // En iOS los temporizadores no corren con la app en segundo plano: al volver tras medianoche
      if (document.visibilityState === 'visible') checkDay();
    }
    pickDaily();
    // Revisa cada 60s si ha cambiado el día de Madrid; solo entonces recarga
    timerRef.current = setInterval(checkDay, 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      if (revokeRef.current) { try { URL.revokeObjectURL(revokeRef.current); } catch {} revokeRef.current = null; }
      shownRef.current = { day: '', id: '' };
    };
  }, []);

  // Always render the same card structure to prevent any layout shift
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm text-gray-600">Foto del día</h3>
        {!loading && photo && (
          <Link to="/gallery" className="btn-link text-sm">Ver galería</Link>
        )}
      </div>
      
      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
        {loading ? (
          <div className="w-full h-full bg-gray-200"></div>
        ) : photo ? (
          <Link to={`/gallery?photo=${photo.id}`} className="block w-full h-full">
            <img
              src={photo.src}
              onError={(e) => {
                // Si falla renderizar el blob, alterna a remota
                if (photo.source === 'blob' && photo.fallbackUrl) {
                  e.currentTarget.src = photo.fallbackUrl;
                }
              }}
              alt="Foto del día"
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              decoding="async"
              loading="eager"
            />
          </Link>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            Sin fotos
          </div>
        )}
      </div>
    </div>
  );
}
