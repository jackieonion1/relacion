import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { listPhotos, uploadPhoto, getOriginal, getOriginalUrl, deletePhoto } from '../lib/photos';
import Modal from '../components/Modal';
import TrashIcon from '../components/icons/TrashIcon';

export default function Gallery() {
  const location = useLocation();
  const navigate = useNavigate();
  const photoIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('photo');
  }, [location.search]);

  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const urlsRef = useRef([]);
  const uploadInputRef = useRef(null);
  const imgRef = useRef(null);
  const pinchRef = useRef({ active: false, startDist: 0, originX: 0, originY: 0 });
  const [viewer, setViewer] = useState({ open: false, id: null, url: '', fallbackUrl: '', loading: false });
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const list = await listPhotos(pairId, 100);
        if (cancelled) return;
        urlsRef.current.forEach((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
        urlsRef.current = [];
        list.forEach((it) => { if (it.thumbUrl && it.thumbUrl.startsWith('blob:')) urlsRef.current.push(it.thumbUrl); });
        setItems(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (pairId) load();
    return () => {
      cancelled = true;
      urlsRef.current.forEach((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
      urlsRef.current = [];
      if (viewer.url && viewer.url.startsWith('blob:')) URL.revokeObjectURL(viewer.url);
    };
  }, [pairId]);

  useEffect(() => {
    if (photoIdFromUrl && items.length > 0 && !viewer.open) {
      const photoExists = items.find(item => item.id === photoIdFromUrl);
      if (photoExists) {
        openViewer(photoIdFromUrl);
      }
    }
  }, [photoIdFromUrl, items, viewer.open]);

  async function onSelect(e) {
    const list = Array.from(e.target.files || []);
    if (!list.length || !pairId) return;
    setUploading(true);
    try {
      for (const f of list) {
        const added = await uploadPhoto(pairId, f, localStorage.getItem('identity') || 'yo');
        if (added.thumbUrl) urlsRef.current.push(added.thumbUrl);
        setItems((prev) => [{ id: added.id, thumbUrl: added.thumbUrl, createdAt: added.createdAt }, ...prev]);
      }
    } finally {
      setUploading(false);
    }
  }

  // Pinch-to-zoom handlers (temporary zoom like Instagram)
  function getDistance(touches) {
    const [a, b] = touches;
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }

  function getMidpoint(touches) {
    const [a, b] = touches;
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  function onPinchStart(e) {
    if (e.touches && e.touches.length === 2 && imgRef.current) {
      e.preventDefault();
      const img = imgRef.current;
      const rect = img.getBoundingClientRect();
      const mid = getMidpoint(e.touches);
      const originX = mid.x - rect.left;
      const originY = mid.y - rect.top;
      pinchRef.current = { active: true, startDist: getDistance(e.touches), originX, originY };
      img.style.transition = 'none';
      img.style.transformOrigin = `${originX}px ${originY}px`;
    }
  }

  function onPinchMove(e) {
    const st = pinchRef.current;
    if (e.touches && e.touches.length === 2 && st.active && imgRef.current) {
      e.preventDefault();
      const scale = Math.max(1, Math.min(2.5, getDistance(e.touches) / st.startDist));
      imgRef.current.style.transform = `scale(${scale})`;
    }
  }

  function onPinchEnd(e) {
    const st = pinchRef.current;
    if (st.active && imgRef.current) {
      const img = imgRef.current;
      img.style.transition = 'transform 160ms ease-out';
      img.style.transform = 'scale(1)';
      // Clean up transition shortly after
      setTimeout(() => {
        if (imgRef.current) {
          imgRef.current.style.transition = '';
        }
      }, 200);
    }
    pinchRef.current = { active: false, startDist: 0, originX: 0, originY: 0 };
  }

  async function openViewer(id) {
    setViewer({ open: true, id, url: '', fallbackUrl: '', loading: true });
    const isIOSPWA = typeof navigator !== 'undefined' && 'standalone' in navigator && navigator.standalone;
    let url = '';
    let fallbackUrl = '';
    if (isIOSPWA) {
      // iOS PWA: Prefer blob from IndexedDB (mitiga bug al renderizar respuestas opacas desde SW tras navegación)
      try {
        const blob = await getOriginal(pairId, id);
        if (blob && (blob.size === undefined || blob.size > 32)) {
          url = URL.createObjectURL(blob);
        }
      } catch {}
      if (!url) {
        // Fallback: remote URL (SW la tendrá cacheada tras primera vista)
        fallbackUrl = await getOriginalUrl(pairId, id);
        url = fallbackUrl;
        fallbackUrl = '';
        // Además intenta obtener Blob en segundo plano y promoverlo
        getOriginal(pairId, id)
          .then((blob) => {
            if (blob && (blob.size === undefined || blob.size > 32)) {
              const blobUrl = URL.createObjectURL(blob);
              setViewer((v) => (v.open && v.id === id ? { ...v, url: blobUrl, fallbackUrl: '' } : v));
            }
          })
          .catch(() => {});
      } else {
        // Prepara fallback remoto por si blob falla al pintar (actualiza estado cuando llegue)
        getOriginalUrl(pairId, id)
          .then((remote) => {
            if (remote) {
              setViewer((v) => (v.open && v.id === id ? { ...v, fallbackUrl: remote } : v));
            }
          })
          .catch(() => {});
      }
    } else {
      // Otros navegadores: prefer blob; remoto como fallback
      try {
        const blob = await getOriginal(pairId, id);
        if (blob) url = URL.createObjectURL(blob);
      } catch {}
      if (!url) url = await getOriginalUrl(pairId, id);
      if (url && url.startsWith('blob:')) {
        getOriginalUrl(pairId, id)
          .then((remote) => {
            if (remote) {
              setViewer((v) => (v.open && v.id === id ? { ...v, fallbackUrl: remote } : v));
            }
          })
          .catch(() => {});
      }
    }
    setViewer({ open: true, id, url, fallbackUrl, loading: false });
  }

  function closeViewer() {
    if (viewer.url && viewer.url.startsWith('blob:')) URL.revokeObjectURL(viewer.url);
    if (viewer.fallbackUrl && viewer.fallbackUrl.startsWith('blob:')) URL.revokeObjectURL(viewer.fallbackUrl);
    setViewer({ open: false, id: null, url: '', fallbackUrl: '', loading: false });
    // Navigate to clear the URL parameter, preventing the viewer from re-opening
    navigate('/gallery', { replace: true });
  }

  async function onDeleteCurrent() {
    if (!pairId || !viewer.id || deleting) return;
    const id = viewer.id;
    setDeleting(true);
    try {
      await deletePhoto(pairId, id);
      // remove from UI list
      setItems((prev) => prev.filter((it) => it.id !== id));
      closeViewer();
    } catch (e) {
      console.error('Delete failed', e);
      alert('No se pudo borrar la foto.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-rose-600">Galería</h2>
        <button
          onClick={() => window.location.reload()}
          aria-label="Actualizar"
          title="Actualizar"
          className="p-2 rounded-lg hover:bg-rose-50 text-rose-600"
        >
          <span className="text-xl leading-none">↻</span>
        </button>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onSelect}
        className="hidden"
      />

      {createPortal(
        <button
          className="fab btn-primary shadow-lg rounded-full px-5 py-3 font-semibold"
          onClick={() => uploadInputRef.current && uploadInputRef.current.click()}
          aria-label="Subir fotos"
          title="Subir fotos"
        >
          Subir fotos
        </button>,
        document.body
      )}

      {uploading && (
        <div className="fixed bottom-40 right-5 z-40 text-xs text-gray-700 bg-white/80 px-2 py-1 rounded-md shadow">
          Subiendo…
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-500">No hay fotos aún.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => (
            <button key={it.id} onClick={() => openViewer(it.id)} className="relative group transition hover:scale-[1.01]">
              {it.thumbUrl ? (
                <img src={it.thumbUrl} alt="" className="w-full h-28 object-cover rounded-xl border border-rose-100" />
              ) : (
                <div className="w-full h-28 rounded-xl border border-rose-100 bg-rose-50" />
              )}
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={viewer.open} onClose={closeViewer} bare>
        <div className="w-full h-full relative">
          {viewer.loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-200">Cargando…</div>
          ) : viewer.url ? (
            <>
              {/* Bounded container with larger side margins and centered content */}
              <div
                className="absolute inset-0 px-8 sm:px-12 md:px-16 lg:px-24"
                style={{
                  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 80px)',
                  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)'
                }}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                    <img 
                      src={viewer.url} 
                      alt="" 
                      className="max-w-full max-h-full w-auto h-auto object-contain select-none" 
                      ref={imgRef}
                      onTouchStart={onPinchStart}
                      onTouchMove={onPinchMove}
                      onTouchEnd={onPinchEnd}
                      onTouchCancel={onPinchEnd}
                      style={{ touchAction: 'none', willChange: 'transform', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                      onError={() => {
                  if (viewer.fallbackUrl && viewer.fallbackUrl !== viewer.url) {
                    setViewer((v) => ({ ...v, url: v.fallbackUrl }));
                    return;
                  }
                  // Si no tenemos fallback aún, intenta la fuente alternativa bajo demanda
                  const isBlob = viewer.url && viewer.url.startsWith('blob:');
                  if (viewer.id) {
                    if (isBlob) {
                      getOriginalUrl(pairId, viewer.id)
                        .then((remote) => { if (remote) setViewer((v) => ({ ...v, url: remote, fallbackUrl: '' })); })
                        .catch(() => {});
                    } else {
                      // Si falla la URL remota, intenta desde IndexedDB
                      getOriginal(pairId, viewer.id)
                        .then((blob) => { if (blob) setViewer((v) => ({ ...v, url: URL.createObjectURL(blob) })); })
                        .catch(() => {});
                    }
                  }
                      }}
                    />
                    {/* Overlay controls aligned to image bounds, placed just above (outside) */}
                    <button
                      onClick={() => setConfirmDeleteOpen(true)}
                      disabled={deleting}
                      aria-label="Borrar"
                      title="Borrar"
                      className="absolute -top-8 sm:-top-6 left-0 text-white disabled:opacity-50 drop-shadow"
                    >
                      <TrashIcon className="w-7 h-7" />
                    </button>
                    <button
                      onClick={closeViewer}
                      aria-label="Cerrar"
                      title="Cerrar"
                      className="absolute -top-8 sm:-top-6 right-0 text-white drop-shadow"
                    >
                      <span className="text-3xl leading-none">×</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-200">No disponible offline</div>
          )}
        </div>
      </Modal>
      {/* Confirm delete modal */}
      <Modal isOpen={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <div className="bg-white rounded-xl p-5 max-w-sm w-[90vw] text-gray-800 shadow-xl">
          <h3 className="text-lg font-semibold mb-2">¿Borrar esta foto?</h3>
          <p className="text-sm text-gray-600 mb-5">Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-3">
            <button
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              onClick={() => { setConfirmDeleteOpen(false); onDeleteCurrent(); }}
              disabled={deleting}
            >
              Borrar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
