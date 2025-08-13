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
  const [viewer, setViewer] = useState({ open: false, id: null, url: '', loading: false });
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
    setViewer({ open: true, id, url: '', loading: true });
    const blob = await getOriginal(pairId, id);
    let url = '';
    if (blob) {
      url = URL.createObjectURL(blob);
    } else {
      // Fallback to remote URL (works online without CORS for <img>)
      url = await getOriginalUrl(pairId, id);
    }
    setViewer({ open: true, id, url, loading: false });
  }

  function closeViewer() {
    if (viewer.url && viewer.url.startsWith('blob:')) URL.revokeObjectURL(viewer.url);
    setViewer({ open: false, id: null, url: '', loading: false });
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
              <img src={viewer.url} alt="" className="w-full h-auto max-h-[60vh] object-contain rounded-xl" />
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
