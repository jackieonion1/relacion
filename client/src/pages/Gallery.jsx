import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listPhotos, uploadPhoto, getOriginal, getOriginalUrl, deletePhoto } from '../lib/photos';
import Modal from '../components/Modal';

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
  const [viewer, setViewer] = useState({ open: false, id: null, url: '', fallbackUrl: '', loading: false });
  const [deleting, setDeleting] = useState(false);

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
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Galería</h3>
          <button onClick={() => window.location.reload()} className="btn-link text-sm">Actualizar</button>
        </div>
        <label className="btn-primary cursor-pointer gap-2">
          <input type="file" accept="image/*" multiple onChange={onSelect} className="hidden" />
          <span>Subir fotos</span>
        </label>
        {uploading && <div className="text-xs text-gray-500 mt-2">Subiendo…</div>}
      </div>

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

      <Modal isOpen={viewer.open} onClose={closeViewer}>
        <div className="p-6">
          <div className="max-w-screen-md w-full">
            {viewer.loading ? (
              <div className="text-center text-gray-600">Cargando…</div>
            ) : viewer.url ? (
              <img 
                src={viewer.url} 
                alt="" 
                className="w-full h-auto max-h-[60vh] object-contain rounded-xl" 
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
            ) : (
              <div className="text-center text-gray-500">No disponible offline</div>
            )}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={onDeleteCurrent}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? 'Borrando…' : 'Borrar'}
              </button>
              <button onClick={closeViewer} className="btn-primary">Cerrar</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
