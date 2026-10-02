import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { listPhotosPage, listPendingPhotos, getPendingIds, retryPendingPhotos, confirmQueued, uploadPhoto, getOriginal, getOriginalUrl, deletePhoto } from '../lib/photos';
import { whenAuthed } from '../lib/firebase';
import { mergeUnique } from '../lib/pagination';
import { MONTHS } from '../lib/eventText';
import Modal from '../components/Modal';
import Sheet from '../components/Sheet';
import Button from '../components/Button';
import Icon from '../components/Icon';
import VisorPie, { photoDate } from '../components/VisorPie';
import ComentariosHoja from '../components/ComentariosHoja';
import { escucharFoto, setReaccion } from '../lib/fotoSocial';
import { escucharComentarios, addComentario, deleteComentario, marcarLeidos } from '../lib/fotoComentarios';
import { useNoLeidos } from '../lib/fotoAvisos';
import './Gallery.css';

const PAGE_SIZE = 60;
// Si Firestore se cuelga sin fallar, la primera página no se queda en «Cargando» para siempre
const LOAD_TIMEOUT_MS = 20000;
// Deslizar en el visor (C3): recorrido mínimo, y franja de los bordes que se deja al gesto «atrás» del sistema
const SWIPE_MIN = 56;
const SWIPE_EDGE = 24;
// Fondo y texto del visor: oscuros en los dos temas (Prototipo.dc.html, «VISOR»)
const VIEWER_BG = 'oklch(0.12 0.01 30)';
const VIEWER_INK = 'oklch(0.97 0.006 80)';
// The open photo's doc is listened to once the swipe rests on it, not for every photo passed on the way
const LIVE_DELAY_MS = 300;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const monthKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}`; };
const monthLabel = (ms) => { const d = new Date(ms); return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`; };

// C9: grupos por mes de createdAt (hora del móvil), en el orden en que llegan las fotos
function groupByMonth(list) {
  const groups = new Map();
  list.forEach((it) => {
    const key = monthKey(it.createdAt || 0);
    if (!groups.has(key)) groups.set(key, { key, label: monthLabel(it.createdAt || 0), items: [] });
    groups.get(key).items.push(it);
  });
  return [...groups.values()];
}

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
  const [loadError, setLoadError] = useState(false); // false, or the error's code (no-auth, permission-denied…)
  const [reloadKey, setReloadKey] = useState(0);
  // Fotos del lote que aún no han vuelto de uploadPhoto: una celda «Subiendo» por cada una
  const [uploadingCount, setUploadingCount] = useState(0);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const urlsRef = useRef([]);
  const uploadInputRef = useRef(null);
  const imgRef = useRef(null);
  const pinchRef = useRef({ active: false, startDist: 0, originX: 0, originY: 0 });
  const slideRef = useRef(null); // lo que se mueve con el dedo al deslizar (la imagen escala aparte, al pellizcar)
  const swipeRef = useRef(null); // { x, y, dx, dy, multi } del gesto en curso
  const swipedAtRef = useRef(0); // el clic que pueda seguir a un deslizamiento no cierra el visor
  const advanceFromRef = useRef(null); // foto desde la que seguir cuando llegue la página siguiente
  const [viewer, setViewer] = useState({ open: false, id: null, url: '', fallbackUrl: '', loading: false });
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  // The open photo's doc, live ({ id, foto }; foto null once deleted): reactions of the other, and the footer of a
  // photo opened with ?photo= that is not in the loaded grid
  const [vivo, setVivo] = useState({ id: null, foto: null });
  // Comments of the open photo ({ id, list }; list null until loaded) and their sheet
  const [comentarios, setComentarios] = useState({ id: null, list: null });
  const [comentariosOpen, setComentariosOpen] = useState(false);
  const noLeidos = useNoLeidos();
  const comentariosDeUrlRef = useRef(''); // opened from a comment's push: its comments open by themselves
  // Paginación: cursor = último doc de la página cargada; genRef descarta páginas de una carga anterior
  const cursorRef = useRef(null);
  const genRef = useRef(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // Fotos guardadas en este móvil que aún no se han subido, y avisos de subida
  const [pendingIds, setPendingIds] = useState([]);
  const [retrying, setRetrying] = useState(false);
  const [notices, setNotices] = useState([]);
  const urlOpenedRef = useRef('');
  const autoRetriedRef = useRef(false);

  function addNotice(text) {
    setNotices((prev) => [...prev, { key: `${Date.now()}-${Math.random()}`, text }]);
  }

  // La cuadrícula se pinta con huecos y cada miniatura llega después (onThumb). thumbsRef guarda las de la
  // carga vigente por id, para las que llegan antes de que su página esté en `items`
  const thumbsRef = useRef(new Map());
  function makeOnThumb(gen) {
    return (id, url) => {
      // De una carga que ya no es la vigente (recarga o desmontaje): se revoca al momento, sin dejar blobs vivos
      if (gen !== genRef.current) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      if (url.startsWith('blob:')) urlsRef.current.push(url);
      thumbsRef.current.set(id, url);
      setItems((prev) => prev.map((it) => (it.id === id && !it.thumbUrl ? { ...it, thumbUrl: url } : it)));
    };
  }
  const withThumbs = (list) => list.map((it) => (it.thumbUrl ? it : { ...it, thumbUrl: thumbsRef.current.get(it.id) || '' }));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const gen = ++genRef.current;
      // Blobs de la carga anterior: se revocan cuando la nueva lista la sustituye (si esta falla, se quedan)
      const stale = urlsRef.current;
      urlsRef.current = [];
      thumbsRef.current = new Map();
      let replaced = false;
      let timedOut = false;
      let timer;
      try {
        // The cap is for Firestore, not for waiting on the session (whenAuthed has its own, up to 15 s)
        await whenAuthed();
        if (cancelled) return;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => { timedOut = true; reject(Object.assign(new Error('timeout'), { code: 'timeout' })); }, LOAD_TIMEOUT_MS);
        });
        const [page, pendingItems] = await Promise.race([
          Promise.all([
            listPhotosPage(pairId, { pageSize: PAGE_SIZE, onThumb: makeOnThumb(gen) }),
            listPendingPhotos(pairId),
          ]),
          timeout,
        ]);
        if (cancelled) return;
        // Pendientes que no aparecen aún en Firestore van delante; si ya están, su miniatura local rellena el hueco
        const remoteIds = new Set(page.items.map((it) => it.id));
        const extra = [];
        pendingItems.forEach((it) => {
          if (!remoteIds.has(it.id)) extra.push(it);
          else if (it.thumbUrl && !thumbsRef.current.has(it.id)) thumbsRef.current.set(it.id, it.thumbUrl);
          else if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
        });
        const list = withThumbs([...extra, ...page.items]);
        list.forEach((it) => {
          if (it.thumbUrl && it.thumbUrl.startsWith('blob:') && !urlsRef.current.includes(it.thumbUrl)) urlsRef.current.push(it.thumbUrl);
        });
        cursorRef.current = page.cursor;
        setHasMore(page.hasMore);
        setLoadMoreError(false);
        setPendingIds(getPendingIds(pairId));
        setItems(list);
        replaced = true;
      } catch (e) {
        // También sin sesión: es «no se pudo cargar», no una galería vacía
        console.error('Gallery load failed', e);
        if (!cancelled) setLoadError(e?.code || 'unknown');
      } finally {
        if (replaced || cancelled) stale.forEach((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
        else urlsRef.current.push(...stale);
        clearTimeout(timer);
        if (!cancelled && gen === genRef.current) setLoading(false);
        // The hung load may still deliver thumbnails: from here on they are stale and get revoked
        if (timedOut && gen === genRef.current) genRef.current += 1;
      }
    }
    if (pairId) load();
    return () => {
      cancelled = true;
      genRef.current += 1; // las miniaturas que aún lleguen de esta carga se revocan al llegar
      urlsRef.current.forEach((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
      urlsRef.current = [];
      if (viewer.url && viewer.url.startsWith('blob:')) URL.revokeObjectURL(viewer.url);
    };
  }, [pairId, reloadKey]);

  // Solo para pintar: sin conexión, los huecos sin miniatura lo dicen en vez de brillar
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Abre ?photo=id sin exigir que esté en la lista cargada (puede estar en una página aún sin cargar)
  useEffect(() => {
    if (!photoIdFromUrl) { urlOpenedRef.current = ''; return; }
    if (!pairId || viewer.open || urlOpenedRef.current === photoIdFromUrl) return;
    urlOpenedRef.current = photoIdFromUrl;
    comentariosDeUrlRef.current = photoIdFromUrl;
    openViewer(photoIdFromUrl);
  }, [photoIdFromUrl, viewer.open]);

  useEffect(() => {
    const id = viewer.open ? viewer.id : null;
    if (!id || !pairId) return undefined;
    let unsub = null;
    const timer = setTimeout(() => {
      unsub = escucharFoto(pairId, id, (foto) => setVivo({ id, foto }), (e) => console.warn('Photo listener failed', e));
    }, LIVE_DELAY_MS);
    return () => { clearTimeout(timer); if (unsub) unsub(); };
  }, [viewer.open, viewer.id, pairId]);

  // Our own change, painted at once in the grid and in the open photo (the write is queued, not awaited)
  function patchFoto(id, change) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change(it) } : it)));
    setVivo((v) => (v.id === id && v.foto ? { ...v, foto: { ...v.foto, ...change(v.foto) } } : v));
  }

  function onReact(emoji) {
    const id = viewer.id;
    if (!id) return;
    patchFoto(id, (it) => {
      const reactions = { ...(it.reactions || {}) };
      if (emoji) reactions[identity] = emoji; else delete reactions[identity];
      return { reactions };
    });
    setReaccion(pairId, id, identity, emoji).catch((e) => console.warn('Reaction failed', e));
  }

  async function loadMore() {
    if (loadingMore || !hasMore || !cursorRef.current) return;
    const gen = genRef.current;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await listPhotosPage(pairId, { pageSize: PAGE_SIZE, cursor: cursorRef.current, onThumb: makeOnThumb(gen) });
      if (gen !== genRef.current) return;
      // Con onThumb las miniaturas llegan aparte (ya registradas en urlsRef); las que llegaron antes, de thumbsRef
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
      setItems((prev) => mergeUnique(prev, withThumbs(page.items)));
    } catch (e) {
      if (gen === genRef.current) setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function retryPending(auto = false) {
    if (!pairId || getPendingIds(pairId).length === 0) return;
    setRetrying(true);
    try {
      // Sin recargar: las pendientes ya están en la cuadrícula con su miniatura local; solo cambia su insignia
      // (el finally refresca pendingIds). Recargar devolvía a la página 1 tras cada reintento
      const r = await retryPendingPhotos(pairId);
      // Ya en la cola del SDK: cuando el servidor lo confirme, quita la marca y la tarjeta «sin subir»
      if (r.queued.length > 0) {
        confirmQueued(pairId, r.queued).then((n) => { if (n > 0) setPendingIds(getPendingIds(pairId)); });
      }
      if (r.lost > 0) {
        addNotice(`${r.lost === 1 ? 'Una foto ya no está' : `${r.lost} fotos ya no están`} en este móvil y no se puede subir. Vuelve a elegirla.`);
      }
      if (!auto && r.offline) addNotice('Sin conexión: las fotos se subirán cuando vuelva.');
      else if (!auto && r.failed > 0) addNotice(`No se pudo subir ${r.failed === 1 ? 'una foto' : `${r.failed} fotos`}. Inténtalo de nuevo más tarde.`);
    } finally {
      setRetrying(false);
      setPendingIds(getPendingIds(pairId));
    }
  }

  // Reintenta las pendientes al abrir la galería y cada vez que vuelve la conexión
  useEffect(() => {
    if (!pairId) return undefined;
    const onOnline = () => { retryPending(true); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [pairId]);
  useEffect(() => {
    if (loading || autoRetriedRef.current) return;
    autoRetriedRef.current = true;
    retryPending(true);
  }, [loading]);

  async function onSelect(e) {
    const input = e.target;
    const list = Array.from(input.files || []);
    if (!list.length || !pairId) return;
    const identity = localStorage.getItem('identity') || 'yo';
    setUploadingCount((n) => n + list.length);
    try {
      for (const f of list) {
        // Un fichero que falla no debe abortar el resto del lote
        try {
          const added = await uploadPhoto(pairId, f, identity);
          if (added.cancelled) continue; // borrada mientras subía
          if (added.thumbUrl) urlsRef.current.push(added.thumbUrl);
          // Una recarga durante la subida ya puede haber traído esta foto como pendiente: sin duplicar
          setItems((prev) => [{ id: added.id, thumbUrl: added.thumbUrl, createdAt: added.createdAt, identity }, ...prev.filter((it) => it.id !== added.id)]);
          if (added.done) {
            // Lenta (>45 s): sigue subiendo en segundo plano y el lote continúa; al acabar se quita la insignia
            addNotice(`"${f.name}" va lenta: sigue subiendo en segundo plano. Está guardada en este móvil.`);
            added.done.catch(() => {}).finally(() => setPendingIds(getPendingIds(pairId)));
          } else if (added.pending) {
            const why = added.error?.message === 'offline' ? 'sin conexión' : 'error al subir';
            addNotice(`"${f.name}" no se ha subido (${why}). Está guardada en este móvil; se reintentará sola o pulsa Reintentar.`);
          }
        } catch (err) {
          console.error('Upload failed', err);
          addNotice(`No se pudo procesar "${f.name}". Prueba con otra foto.`);
        } finally {
          setUploadingCount((n) => Math.max(0, n - 1));
        }
      }
    } finally {
      setPendingIds(getPendingIds(pairId));
      input.value = ''; // permite volver a elegir el mismo fichero
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
    setDeleteError(false);
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
    // «Cerrar» while it loads: the photo arrives to nobody, and the viewer must not open again by itself
    const now = viewerRef.current;
    if (!(now.open && now.id === id)) {
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      return;
    }
    setViewer({ open: true, id, url, fallbackUrl, loading: false });
  }

  function revokeViewerUrls() {
    if (viewer.url && viewer.url.startsWith('blob:')) URL.revokeObjectURL(viewer.url);
    if (viewer.fallbackUrl && viewer.fallbackUrl.startsWith('blob:')) URL.revokeObjectURL(viewer.fallbackUrl);
  }

  // Otra foto en el mismo visor: la de ahora deja de usarse y su blob se revoca
  function showPhoto(id) {
    advanceFromRef.current = null;
    revokeViewerUrls();
    openViewer(id);
  }

  function closeViewer() {
    advanceFromRef.current = null;
    setComentariosOpen(false);
    revokeViewerUrls();
    setViewer({ open: false, id: null, url: '', fallbackUrl: '', loading: false });
    // Navigate to clear the URL parameter, preventing the viewer from re-opening. Opened from an album, a stamp or
    // «hace un año» (Recuerdos), it goes back there instead of staying on the Gallery
    const volver = location.state?.volver;
    navigate(typeof volver === 'string' && volver.startsWith('/') ? volver : '/gallery', { replace: true });
  }

  async function onDeleteCurrent() {
    if (!pairId || !viewer.id || deleting) return;
    const id = viewer.id;
    setDeleting(true);
    try {
      await deletePhoto(pairId, id);
      // remove from UI list
      setItems((prev) => prev.filter((it) => it.id !== id));
      setPendingIds(getPendingIds(pairId));
      closeViewer();
    } catch (e) {
      console.error('Delete failed', e);
      setDeleteError(true); // en el pie del visor, que sigue abierto (antes, alert)
    } finally {
      setDeleting(false);
    }
  }

  const pickFiles = () => uploadInputRef.current && uploadInputRef.current.click();
  const groups = groupByMonth(items);
  // Las que se están subiendo van delante, en el mes de hoy
  if (uploadingCount > 0 && groups[0]?.key !== monthKey(Date.now())) {
    groups.unshift({ key: monthKey(Date.now()), label: monthLabel(Date.now()), items: [] });
  }
  const isEmpty = items.length === 0 && uploadingCount === 0;
  const subtitle = loading ? 'Cargando fotos…' : loadError ? 'No disponibles ahora' : isEmpty ? 'Ninguna todavía' : 'Las de los dos';
  const viewerItem = viewer.id ? items.find((it) => it.id === viewer.id) : null;
  // The live doc over the grid item (C11 still holds: the footer only says who uploaded it if the photo keeps it).
  // A photo still only on this phone has no doc yet: nothing to react to
  const viewerFoto = vivo.id === viewer.id && vivo.foto ? { ...viewerItem, ...vivo.foto, thumbUrl: viewerItem?.thumbUrl || '' } : viewerItem;
  const social = !!viewerFoto && !pendingIds.includes(viewer.id);
  const deLaFoto = comentarios.id === viewer.id ? comentarios.list : null;
  const nComentarios = deLaFoto ? deLaFoto.length : (viewerFoto?.commentCount || 0);
  const sinLeer = !!viewer.id && noLeidos.has(viewer.id);
  // Only listened to when it has some (or the sheet is open): an empty query still costs a read per photo passed
  const quiereComentarios = viewer.open && social && (nComentarios > 0 || sinLeer || comentariosOpen);

  useEffect(() => {
    const id = quiereComentarios ? viewer.id : null;
    if (!id) return undefined;
    let unsub = null;
    const timer = setTimeout(() => {
      unsub = escucharComentarios(pairId, id, (list) => setComentarios({ id, list }), (e) => console.warn('Comments listener failed', e));
    }, LIVE_DELAY_MS);
    return () => { clearTimeout(timer); if (unsub) unsub(); };
  }, [quiereComentarios, viewer.id, pairId]);

  // Read once the sheet shows them
  useEffect(() => {
    if (comentariosOpen && deLaFoto) marcarLeidos(pairId, deLaFoto, identity).catch(() => {});
  }, [comentariosOpen, deLaFoto]);

  // From the push of a comment (/gallery?photo=ID): with something unread, its comments open by themselves
  useEffect(() => {
    const from = comentariosDeUrlRef.current;
    if (!from || !viewer.open || viewer.loading) return;
    comentariosDeUrlRef.current = '';
    if (viewer.id === from && sinLeer) setComentariosOpen(true);
  }, [viewer.open, viewer.id, viewer.loading, sinLeer]);

  async function onSendComentario(text) {
    const id = viewer.id;
    await addComentario(pairId, id, text, identity);
    patchFoto(id, (it) => ({ commentCount: (it.commentCount || 0) + 1 }));
  }

  function onDeleteComentario(c) {
    deleteComentario(pairId, c).catch((e) => console.warn('Comment delete failed', e));
    patchFoto(c.photoId, (it) => ({ commentCount: Math.max(0, (it.commentCount || 0) - 1) }));
  }
  const pendingCount = pendingIds.length;

  // C3: anterior y siguiente entre las ya cargadas, en el orden de la cuadrícula. Desde la última, si hay más
  // páginas, pide la siguiente y sigue cuando llega (efecto de abajo); si no, se para
  const order = groups.flatMap((g) => g.items);
  const at = viewer.id ? order.findIndex((it) => it.id === viewer.id) : -1;
  const prevItem = at > 0 ? order[at - 1] : null;
  const nextItem = at >= 0 ? order[at + 1] || null : null;
  const nextOnNextPage = at >= 0 && !nextItem && hasMore;

  function step(dir) {
    if (!viewer.open || deleting || confirmDeleteOpen || comentariosOpen) return;
    if (dir < 0) {
      if (prevItem) showPhoto(prevItem.id);
    } else if (nextItem) {
      showPhoto(nextItem.id);
    } else if (nextOnNextPage) {
      advanceFromRef.current = viewer.id;
      loadMore();
    }
  }
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const from = advanceFromRef.current;
    if (!from || loadingMore) return;
    advanceFromRef.current = null;
    if (viewerRef.current.id !== from) return;
    const list = groupByMonth(items).flatMap((g) => g.items);
    const next = list[list.findIndex((it) => it.id === from) + 1];
    if (next) stepRef.current(1);
  }, [items, loadingMore]);

  // Flechas del teclado mientras el visor está abierto (las de pantalla son para el lector y el ratón)
  useEffect(() => {
    if (!viewer.open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') stepRef.current(-1);
      else if (e.key === 'ArrowRight') stepRef.current(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewer.open]);

  // Deslizar con un dedo, sobre todo en horizontal. Un segundo dedo lo convierte en pellizco y el gesto ya no
  // cuenta (no hay deslizar con zoom); el que empieza en un borde se deja al «atrás» de Safari y de Android
  function onSwipeStart(e) {
    const s = swipeRef.current;
    if (e.touches.length > 1) {
      if (s) { s.multi = true; slideBack(); }
      return;
    }
    const { clientX: x, clientY: y } = e.touches[0];
    swipeRef.current = x < SWIPE_EDGE || x > window.innerWidth - SWIPE_EDGE ? null : { x, y, dx: 0, dy: 0, multi: false };
  }

  function onSwipeMove(e) {
    const s = swipeRef.current;
    if (!s || s.multi || e.touches.length !== 1) return;
    s.dx = e.touches[0].clientX - s.x;
    s.dy = e.touches[0].clientY - s.y;
    const el = slideRef.current;
    if (!el || Math.abs(s.dx) <= Math.abs(s.dy)) return;
    // Sin foto a ese lado, el dedo arrastra con resistencia
    const free = s.dx > 0 ? !!prevItem : (!!nextItem || nextOnNextPage);
    el.style.transition = 'none';
    el.style.transform = `translateX(${free ? s.dx : s.dx * 0.3}px)`;
  }

  function onSwipeEnd(e) {
    const s = swipeRef.current;
    if (!s || e.touches.length > 0) return; // hasta que se levanten todos los dedos
    swipeRef.current = null;
    slideBack();
    if (s.multi || e.type === 'touchcancel') return;
    if (Math.abs(s.dx) >= SWIPE_MIN && Math.abs(s.dx) > 1.5 * Math.abs(s.dy)) {
      swipedAtRef.current = Date.now();
      step(s.dx < 0 ? 1 : -1);
    }
  }

  function slideBack() {
    const el = slideRef.current;
    if (!el || !el.style.transform) return;
    el.style.transition = 'transform 160ms ease-out';
    el.style.transform = '';
  }

  return (
    // Margen propio de 16 px, salvo la cuadrícula, que va a sangre (§5.00); el hueco de la barra es de la cáscara
    <div className="flex flex-col pb-6">
      <header className="flex items-end justify-between gap-3 pt-1.5 pb-3.5 pl-5 pr-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="serif text-4xl leading-[1.05] font-normal tracking-[-0.01em]">Galería</h1>
          <p className="text-sm text-ink-2">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {/* ↻: en la PWA de iPhone no hay otra forma de recargar (plan §0 nº 8) */}
          <Button icon="recargar" label="Actualizar" title="Actualizar" onClick={() => window.location.reload()} />
          <Button icon="subir" onClick={pickFiles} aria-label="Subir fotos">Subir</Button>
        </div>
      </header>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onSelect}
        className="hidden"
      />

      {(notices.length > 0 || pendingCount > 0) && (
        <div className="flex flex-col gap-3 px-4 pb-3.5">
          {notices.map((n) => (
            <div key={n.key} role="alert" className="card flex items-center justify-between gap-3 py-2 pr-2 text-[15px] text-ink">
              <span>{n.text}</span>
              <Button icon="cerrar" label="Cerrar aviso" onClick={() => setNotices((prev) => prev.filter((x) => x.key !== n.key))} />
            </div>
          ))}
          {pendingCount > 0 && (
            <section aria-label="Fotos sin subir" className="card flex items-center gap-3 py-3.5 pl-4 pr-3">
              <span aria-hidden="true" className="w-9 h-9 rounded-full bg-lacre-soft text-accent-ink flex items-center justify-center shrink-0">
                <Icon name="subir" size={20} />
              </span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[15px] font-semibold">{pendingCount === 1 ? '1 foto sin subir' : `${pendingCount} fotos sin subir`}</span>
                <span className="text-[13px] text-ink-2">
                  {pendingCount === 1 ? 'Guardada en este móvil hasta que suba.' : 'Guardadas en este móvil hasta que suban.'}
                </span>
              </span>
              <Button onClick={() => retryPending(false)} busy={retrying} busyText="Subiendo…" className="px-4">Reintentar</Button>
            </section>
          )}
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Cargando fotos" className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="relative block aspect-square"><span className="galeria-hueco" /></span>
          ))}
        </div>
      ) : loadError ? (
        <section role="alert" className="mx-4 mt-6 flex flex-col items-center gap-2.5 py-7 px-6 rounded-hero bg-sunk text-center">
          <Icon name="info" size={30} className="text-ink-2" />
          <h2 className="text-[17px] font-semibold">No se pudieron cargar las fotos</h2>
          <p className="text-sm text-ink-2">Puede ser la conexión. Las fotos siguen ahí.</p>
          <Button variant="sec" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</Button>
          {/* Small, to tell «no session» (no-auth, permission-denied) from «Firestore unreachable» (unavailable…) */}
          <p className="num text-xs text-ink-2 opacity-75">{loadError}</p>
        </section>
      ) : isEmpty ? (
        <section className="mx-4 mt-6 flex flex-col items-center gap-3 py-9 px-6 rounded-hero border-[1.5px] border-dashed border-line text-center">
          <div aria-hidden="true" className="grid grid-cols-[repeat(3,44px)] gap-[3px] opacity-80">
            <span className="h-11 bg-sunk" /><span className="h-11 bg-lacre-soft" /><span className="h-11 bg-sunk" />
          </div>
          <h2 className="serif text-[26px] font-normal">Aún no hay fotos</h2>
          <p className="text-[15px] text-ink-2 max-w-[260px] text-pretty">Sube la primera que os hicisteis juntos. La verá también la otra persona.</p>
          <Button size="m" icon="subir" onClick={pickFiles}>Subir fotos</Button>
        </section>
      ) : (
        <>
          {groups.map((g, gi) => (
            <section key={g.key}>
              <h2 className={`etiqueta px-5 pb-2.5 ${gi === 0 ? 'pt-1' : 'pt-6'}`}>{g.label}</h2>
              <div className="grid grid-cols-3 gap-0.5">
                {gi === 0 && Array.from({ length: uploadingCount }, (_, i) => (
                  <div key={`subiendo-${i}`} role="status" aria-label="Subiendo foto" className="galeria-celda relative aspect-square overflow-hidden">
                    <span className="galeria-hueco" />
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ background: 'oklch(0.2 0.02 30 / 0.45)', color: VIEWER_INK }}>
                      <svg viewBox="0 0 24 24" width="30" height="30" fill="none" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="galeria-anillo">
                        <circle cx="12" cy="12" r="9" stroke="oklch(1 0 0 / 0.3)" />
                        <circle cx="12" cy="12" r="9" stroke="currentColor" pathLength="100" strokeDasharray="30 100" />
                      </svg>
                      <span className="text-xs font-semibold">Subiendo</span>
                    </span>
                  </div>
                ))}
                {g.items.map((it, i) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => openViewer(it.id)}
                    aria-label={`Foto del ${photoDate(it.createdAt || 0)}${noLeidos.has(it.id) ? ', con comentarios sin leer' : ''}`}
                    className="galeria-celda relative block w-full aspect-square overflow-hidden bg-sunk active:opacity-80"
                    style={{ animationDelay: `${Math.min(i, 11) * 20}ms` }}
                  >
                    {it.thumbUrl ? (
                      <img src={it.thumbUrl} alt="" className="galeria-foto absolute inset-0 w-full h-full object-cover" />
                    ) : online ? (
                      <span className="galeria-hueco" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-ink-2"><Icon name="sinConexion" size={20} /></span>
                    )}
                    {noLeidos.has(it.id) && (
                      <span aria-hidden="true" className="galeria-punto absolute top-1.5 right-1.5" />
                    )}
                    {pendingIds.includes(it.id) && (
                      <span className="absolute left-1.5 bottom-1.5 px-2 py-[3px] rounded-[10px] bg-ink text-paper text-xs font-semibold">Sin subir</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="flex flex-col items-center gap-2 px-4 pt-5">
            {hasMore ? (
              <>
                <Button variant="sec" size="m" className="w-full" onClick={loadMore} busy={loadingMore} busyText="Cargando…">Cargar más</Button>
                {loadMoreError && <p role="alert" className="text-[13px] text-danger">No se pudieron cargar más fotos. Inténtalo de nuevo.</p>}
              </>
            ) : items.length > 0 && (
              <p className="etiqueta py-3.5">Estas son todas</p>
            )}
          </div>
        </>
      )}

      {/* Visor (R6b): mismo Modal bare, mismo pellizco y misma cadena blob/URL; cambian el fondo y los controles */}
      <Modal isOpen={viewer.open} onClose={closeViewer} bare>
        {/* touch-action: none, para que el navegador no se quede el gesto (ni desplace, ni amplíe la página) */}
        <div
          className="w-full h-full relative"
          style={{ color: VIEWER_INK, touchAction: 'none' }}
          onTouchStart={onSwipeStart}
          onTouchMove={onSwipeMove}
          onTouchEnd={onSwipeEnd}
          onTouchCancel={onSwipeEnd}
          onClick={(e) => { if (Date.now() - swipedAtRef.current < 500) e.stopPropagation(); }}
        >
          <div className="velo absolute inset-0" style={{ background: VIEWER_BG }} aria-hidden="true" />
          {viewer.loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-[15px] opacity-75">Cargando…</div>
          ) : viewer.url ? (
            <>
              {/* Bounded container with side margins and centered content, between the top and bottom bars */}
              <div
                className="absolute inset-0 px-4 sm:px-12 md:px-16 lg:px-24"
                style={{
                  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)',
                  // Room for the footer, one row taller once the photo can get reactions
                  paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${social ? 156 : 100}px)`
                }}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <div ref={slideRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
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
                  // Si no tenemos fallback aún, intenta la fuente alternativa bajo demanda (si sigue siendo esta foto)
                  const isBlob = viewer.url && viewer.url.startsWith('blob:');
                  const id = viewer.id;
                  if (id) {
                    if (isBlob) {
                      getOriginalUrl(pairId, id)
                        .then((remote) => { if (remote) setViewer((v) => (v.id === id ? { ...v, url: remote, fallbackUrl: '' } : v)); })
                        .catch(() => {});
                    } else {
                      // Si falla la URL remota, intenta desde IndexedDB
                      getOriginal(pairId, id)
                        .then((blob) => { if (blob && viewerRef.current.id === id) setViewer((v) => ({ ...v, url: URL.createObjectURL(blob) })); })
                        .catch(() => {});
                    }
                  }
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[15px] opacity-75">No se pudo cargar la foto</div>
          )}

          {/* Barras del lienzo. Paran el clic: si llegara al fondo del Modal, cerraría el visor */}
          <div
            className="absolute left-2 right-2 h-11 flex items-center"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeViewer}
              aria-label="Cerrar"
              title="Cerrar"
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ background: 'oklch(1 0 0 / 0.12)' }}
            >
              <Icon name="cerrar" size={20} />
            </button>
          </div>
          {/* Anterior y siguiente (C3) para el teclado, el ratón y el lector; en el móvil solo se ven con el foco */}
          {[
            { dir: -1, label: 'Foto anterior', icon: 'atras', side: 'left-2', can: !!prevItem },
            { dir: 1, label: 'Foto siguiente', icon: 'siguiente', side: 'right-2', can: !!nextItem || nextOnNextPage },
          ].map((a) => (
            <button
              key={a.dir}
              type="button"
              onClick={(e) => { e.stopPropagation(); step(a.dir); }}
              disabled={!a.can || deleting}
              aria-label={a.label}
              title={a.label}
              className={`visor-flecha absolute ${a.side} top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform`}
              style={{ background: 'oklch(1 0 0 / 0.12)' }}
            >
              <Icon name={a.icon} size={20} />
            </button>
          ))}
          {!viewer.loading && viewer.url && (
            <VisorPie
              foto={viewerFoto}
              identity={identity}
              deleteError={deleteError}
              deleting={deleting}
              onDelete={() => setConfirmDeleteOpen(true)}
              onReact={social ? onReact : null}
              comentarios={{ n: nComentarios, unread: sinLeer }}
              onComments={() => setComentariosOpen(true)}
            />
          )}
        </div>
      </Modal>

      <ComentariosHoja
        isOpen={comentariosOpen && viewer.open}
        onClose={() => setComentariosOpen(false)}
        comentarios={deLaFoto}
        cargando={!deLaFoto && nComentarios > 0}
        identity={identity}
        onSend={onSendComentario}
        onDelete={onDeleteComentario}
      />

      <Sheet isOpen={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <div className="flex flex-col gap-1.5 px-5 pt-3.5 pb-[34px]">
          <div className="flex items-center gap-3.5 pb-2.5">
            {viewerItem?.thumbUrl ? (
              <img src={viewerItem.thumbUrl} alt="" className="w-14 h-14 rounded-mini object-cover shrink-0" />
            ) : (
              <span aria-hidden="true" className="w-14 h-14 rounded-mini bg-sunk shrink-0" />
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <h2 className="serif text-2xl leading-[1.15] font-normal">¿Borrar esta foto?</h2>
              <p className="text-sm text-ink-2">Desaparece para los dos. No se puede deshacer.</p>
            </div>
          </div>
          <Button variant="dan" size="l" disabled={deleting} onClick={() => { setConfirmDeleteOpen(false); onDeleteCurrent(); }}>
            Borrar foto
          </Button>
          <Button variant="txt" size="l" disabled={deleting} onClick={() => setConfirmDeleteOpen(false)}>Cancelar</Button>
        </div>
      </Sheet>
    </div>
  );
}
