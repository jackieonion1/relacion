import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getDailyPhotoId, getOriginal, getOriginalUrl } from '../lib/photos';

export default function RandomPhoto() {
  const [photo, setPhoto] = useState(null); // { id, src, fallbackUrl, source }
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const revokeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function pickDaily() {
      try {
        const pairId = localStorage.getItem('pairId');
        if (!pairId) { setLoading(false); return; }
        const id = await getDailyPhotoId(pairId);
        if (!id) { if (!cancelled) setPhoto(null); setLoading(false); return; }
        // Cargar HD: intentar blob cacheado/descargar y usar blob:URL; preparar fallback remota
        // Limpia blob anterior
        if (revokeRef.current) { try { URL.revokeObjectURL(revokeRef.current); } catch {} revokeRef.current = null; }
        setLoading(true);
        let blob = null;
        try { blob = await getOriginal(pairId, id); } catch {}
        if (cancelled) return;
        if (blob && (!blob.size || blob.size > 32)) {
          const blobUrl = URL.createObjectURL(blob);
          revokeRef.current = blobUrl;
          setPhoto({ id, src: blobUrl, fallbackUrl: '', source: 'blob' });
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
        }
      } catch (e) {
        console.error('Error fetching daily photo:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    pickDaily();
    // Revisa cada 60s para cambiar a medianoche de Madrid y para recuperarse si se borra
    timerRef.current = setInterval(pickDaily, 60 * 1000);
    return () => { cancelled = true; if (timerRef.current) clearInterval(timerRef.current); if (revokeRef.current) { try { URL.revokeObjectURL(revokeRef.current); } catch {} revokeRef.current = null; } };
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
