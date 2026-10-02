import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import Button from './Button';
import Icon from './Icon';
import { useOnline } from './MarcaSuperior';
import { getDailyPhotoId, getOriginal, getOriginalUrl, madridDayKey } from '../lib/photos';
import { photoUploader, uploadedText } from '../lib/inicio';

export default function RandomPhoto() {
  const online = useOnline();
  const [photo, setPhoto] = useState(null); // { id, src, fallbackUrl, source }
  const [loading, setLoading] = useState(true);
  const [uploader, setUploader] = useState(null); // { id, identity, createdAt } of the photo shown (C11)
  const timerRef = useRef(null);
  const revokeRef = useRef(null);
  const pickRef = useRef(null);
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
    // Quién la subió y cuándo: solo lectura, después de pintar la foto; si falla, no hay pie
    function readUploader(pairId, id) {
      photoUploader(pairId, id)
        .then((u) => { if (!cancelled && u) setUploader({ id, ...u }); })
        .catch(() => {});
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
          readUploader(pairId, id);
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
          if (remote) readUploader(pairId, id);
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
    pickRef.current = checkDay;
    pickDaily();
    // Revisa cada 60s si ha cambiado el día de Madrid; solo entonces recarga
    timerRef.current = setInterval(checkDay, 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      pickRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      if (revokeRef.current) { try { URL.revokeObjectURL(revokeRef.current); } catch {} revokeRef.current = null; }
      shownRef.current = { day: '', id: '' };
    };
  }, []);

  const caption = photo && uploader && uploader.id === photo.id ? uploadedText(uploader) : null;

  // Same 4:3 frame in every state so nothing below jumps
  return (
    <figure className="flex flex-col gap-2.5">
      {loading ? (
        <div className="hueco aspect-[4/3] rounded-hero" role="img" aria-label="Cargando la foto del día" />
      ) : photo ? (
        <Link to={`/gallery?photo=${photo.id}`} aria-label="Abrir la foto del día" className="foto-dia block aspect-[4/3] rounded-hero overflow-hidden bg-sunk">
          <img
            src={photo.src}
            onError={(e) => {
              // Si falla renderizar el blob, alterna a remota
              if (photo.source === 'blob' && photo.fallbackUrl) {
                e.currentTarget.src = photo.fallbackUrl;
              }
            }}
            alt="Foto del día"
            className="w-full h-full object-cover"
            decoding="async"
            loading="eager"
          />
        </Link>
      ) : online ? (
        <div className="aspect-[4/3] rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-center justify-center gap-2.5 p-6 text-center">
          <Icon name="galeria" size={32} className="text-ink-2" />
          <p className="serif text-[22px] text-ink">Aquí irá la foto del día</p>
          <p className="text-[14px] text-ink-2">Cada día sale una de la galería al azar.</p>
          <Link to="/gallery" className="btn btn-sec">Subir la primera</Link>
        </div>
      ) : (
        <div role="alert" className="aspect-[4/3] rounded-hero bg-sunk flex flex-col items-center justify-center gap-2.5 p-6 text-center">
          <Icon name="info" size={30} className="text-ink-2" />
          <p className="text-[15px] font-semibold text-ink">No se pudo cargar la foto</p>
          <Button variant="sec" onClick={() => pickRef.current?.()}>Reintentar</Button>
        </div>
      )}
      <figcaption className="flex items-center gap-2.5 pl-1">
        {caption && <span className="av" aria-hidden="true">{caption.who}</span>}
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[15px] font-semibold text-ink">Foto del día</span>
          {caption && <span className="text-[13px] text-ink-2">{caption.text}</span>}
        </span>
        {!loading && photo && (
          <Link to="/gallery" className="btn btn-txt btn-acc">Ver galería</Link>
        )}
      </figcaption>
    </figure>
  );
}
