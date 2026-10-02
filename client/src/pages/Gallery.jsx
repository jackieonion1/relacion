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
import FiltroGaleria from '../components/FiltroGaleria';
import SaltarMes, { MesBarra } from '../components/SaltarMes';
import SeleccionBarra from '../components/SeleccionBarra';
import FechaHoja from '../components/FechaHoja';
import AlbumPicker from '../components/AlbumPicker';
import { ponerFecha, ponerFavorita, subidasDeGolpe, fechaComun } from '../lib/fotoSeleccion';
import { escucharFoto, setReaccion, setFavorita } from '../lib/fotoSocial';
import { listFavoritas, primeraFecha } from '../lib/fotoConsultas';
import { fotosDelDia, fotosEnRango } from '../lib/recuerdos';
import { fechaEfectiva, rangoMesMadrid, madridMediodia } from '../lib/fotoFecha';
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

// C9: grupos por mes de createdAt (hora del móvil), en el orden en que llegan las fotos. The other views (3.1) group
// by effective date, the one they are queried and sorted by
function groupByMonth(list, fecha = (it) => it.createdAt) {
  const groups = new Map();
  list.forEach((it) => {
    const ms = fecha(it) || 0;
    const key = monthKey(ms);
    if (!groups.has(key)) groups.set(key, { key, label: monthLabel(ms), items: [] });
    groups.get(key).items.push(it);
  });
  return [...groups.values()];
}

// «Hace un año»: one group per year back, nearest first (fotosDelDia already returns them in that order)
function groupByAnos(list) {
  const groups = new Map();
  list.forEach((it) => {
    if (!groups.has(it.anos)) groups.set(it.anos, { key: `anos-${it.anos}`, label: it.anos === 1 ? 'Hace un año' : `Hace ${it.anos} años`, items: [] });
    groups.get(it.anos).items.push(it);
  });
  return [...groups.values()];
}

const vistaKeyOf = (v) => (v.tipo === 'mes' ? `mes:${v.y}-${v.m}` : v.tipo);
const VACIA = {
  favoritas: { titulo: 'Aún no hay favoritas', texto: 'Toca el corazón al ver una foto y quedará aquí, para los dos.' },
  haceUnAno: { titulo: 'Hoy no hay fotos de otros años', texto: 'Cuando haya alguna de un día como hoy, saldrá aquí.' },
  mes: { titulo: 'Este mes no hay fotos', texto: 'Ni hechas ni subidas ese mes. Prueba con otro.' },
};

// What each view other than «Todas» shows, by effective date
async function cargarVista(pairId, v, onThumb) {
  if (v.tipo === 'favoritas') return (await listFavoritas(pairId, { onThumb })).items;
  // A month by the day the photos were taken (F1), not the grid's upload order: its own list and its own swipe
  if (v.tipo === 'mes') {
    const { desde, hasta } = rangoMesMadrid(v.y, v.m);
    return (await fotosEnRango(pairId, desde, hasta, { onThumb })).items;
  }
  // Each photo carries how many years back it is, for its group
  const porAno = await fotosDelDia(pairId, new Date(), 3, { onThumb });
  return porAno.flatMap((a) => a.items.map((it) => ({ ...it, anos: a.anos })));
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
  // 3.1 views other than «Todas»: their own list (by effective date) and their own swipe order. Each one is kept
  // while the Gallery is mounted, and our own changes patch it in place
  const [vista, setVista] = useState({ tipo: 'todas' });
  const [vistaDatos, setVistaDatos] = useState({ key: '', items: [], loading: false, error: false });
  const [vistaRecarga, setVistaRecarga] = useState(0);
  const vistaCacheRef = useRef(new Map()); // key → items
  const vistaThumbsRef = useRef(new Map()); // id → thumb of those views, revoked on leaving the Gallery
  const montadoRef = useRef(true);
  const [, setVistaThumbs] = useState(0);
  // «Ir a un mes»: its sheet, and where the months start ({ ms } or { error }), asked once per visit
  const [saltarOpen, setSaltarOpen] = useState(false);
  const [primera, setPrimera] = useState(null);
  const rootRef = useRef(null);
  // Selection mode (3.1): the picked ids (null = off), its sheets, and the result of a change to all of them
  const [seleccion, setSeleccion] = useState(null);
  const [fechaOpen, setFechaOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [resultado, setResultado] = useState(null); // { titulo, texto, error }
  // Upload days whose «¿les pones su fecha?» was dismissed, per device
  const golpeKey = `galeria:golpe-visto:${pairId}`;
  const [golpeVisto, setGolpeVisto] = useState(() => {
    try { return JSON.parse(localStorage.getItem(golpeKey) || '[]'); } catch { return []; }
  });
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

  const vistaKey = vistaKeyOf(vista);
  useEffect(() => {
    montadoRef.current = true;
    const thumbs = vistaThumbsRef.current;
    return () => {
      montadoRef.current = false;
      thumbs.forEach((u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
      thumbs.clear();
    };
  }, []);

  // A view's thumbs live until the Gallery goes (the same photo may be in several views: the first one stays)
  function vistaOnThumb(id, url) {
    if (!montadoRef.current || vistaThumbsRef.current.has(id)) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      return;
    }
    vistaThumbsRef.current.set(id, url);
    setVistaThumbs((n) => n + 1);
  }

  useEffect(() => {
    if (vista.tipo === 'todas' || !pairId) return undefined;
    const key = vistaKey;
    const cached = vistaCacheRef.current.get(key);
    if (cached) { setVistaDatos({ key, items: cached, loading: false, error: false }); return undefined; }
    let cancelled = false;
    setVistaDatos({ key, items: [], loading: true, error: false });
    (async () => {
      try {
        await whenAuthed();
        const list = await cargarVista(pairId, vista, vistaOnThumb);
        vistaCacheRef.current.set(key, list);
        if (!cancelled) setVistaDatos({ key, items: list, loading: false, error: false });
      } catch (e) {
        console.error('Gallery view failed', e);
        if (!cancelled) setVistaDatos({ key, items: [], loading: false, error: e?.code || 'unknown' });
      }
    })();
    return () => { cancelled = true; };
  }, [vistaKey, pairId, vistaRecarga]);

  // Our own change, painted at once in the grid, in the views and in the open photo (the write is queued, not awaited)
  function patchFotos(ids, change) {
    const patch = (list) => list.map((it) => (ids.has(it.id) ? { ...it, ...change(it) } : it));
    setItems(patch);
    setVistaDatos((d) => ({ ...d, items: patch(d.items) }));
    vistaCacheRef.current.forEach((list, k) => vistaCacheRef.current.set(k, patch(list)));
    setVivo((v) => (ids.has(v.id) && v.foto ? { ...v, foto: { ...v.foto, ...change(v.foto) } } : v));
  }
  const patchFoto = (id, change) => patchFotos(new Set([id]), change);

  function onFav() {
    const id = viewer.id;
    if (!id) return;
    const on = !viewerFoto?.favBy?.includes(identity);
    patchFoto(id, (it) => ({ favBy: on ? [...new Set([...(it.favBy || []), identity])] : (it.favBy || []).filter((w) => w !== identity) }));
    // An open «Favoritas» keeps the photo (nothing jumps under the finger); the next visit asks again
    vistaCacheRef.current.delete('favoritas');
    setFavorita(pairId, id, identity, on).catch((e) => console.warn('Favourite failed', e));
  }

  async function abrirSaltar() {
    setSaltarOpen(true);
    if (primera && !primera.error) return;
    setPrimera(null);
    try {
      const ms = await primeraFecha(pairId);
      setPrimera({ ms: ms ?? Date.now() });
    } catch (e) {
      console.warn('First photo date failed', e);
      setPrimera({ error: true });
    }
  }

  const seleccionando = seleccion !== null;
  function terminarSeleccion() {
    setSeleccion(null);
    setFechaOpen(false);
    setAlbumOpen(false);
  }
  // A photo still only on this phone has no doc to change yet
  function alternar(ids) {
    const libres = ids.filter((id) => !pendingIds.includes(id));
    setSeleccion((prev) => {
      const s = new Set(prev || []);
      const todas = libres.every((id) => s.has(id));
      libres.forEach((id) => (todas ? s.delete(id) : s.add(id)));
      return s;
    });
  }

  // What a change to many photos ended in: said on screen (F2), and what failed stays selected to try again
  function contarResultado(r, hecho, reintentar) {
    const n = r.hechas;
    const borradas = r.borradas.length ? ` ${r.borradas.length === 1 ? 'Una ya no estaba' : `${r.borradas.length} ya no estaban`}.` : '';
    if (r.fallidas.length) {
      setSeleccion(new Set(r.fallidas));
      setResultado({ error: true, titulo: `No se pudo en ${r.fallidas.length === 1 ? '1 foto' : `${r.fallidas.length} fotos`}`, texto: `Siguen elegidas para volver a intentarlo.${borradas}`, reintentar });
    } else {
      setResultado({ titulo: hecho(n), texto: borradas.trim() });
    }
  }

  // After a change of dates, the other views may hold the photos in the wrong place: asked again
  function recargarVistas() {
    vistaCacheRef.current.clear();
    if (enVista) setVistaRecarga((k) => k + 1);
  }

  // `soloIds`: the retry of an aviso, with the photos that failed
  async function guardarFecha(dia, soloIds) {
    const ids = soloIds || [...(seleccion || [])];
    if (!ids.length) return;
    const ms = dia ? madridMediodia(dia) : null;
    const hecho = (n) => `${ms == null ? 'Fecha quitada' : `Del ${photoDate(ms)}`}: ${n === 1 ? '1 foto' : `${n} fotos`}`;
    // Painted at once; what does not get saved goes back to the date it had, and the deleted ones leave the grid
    const previo = new Map([...items, ...vistaDatos.items].filter((it) => ids.includes(it.id)).map((it) => [it.id, it.takenAt ?? null]));
    const deshacer = (fallidas) => { if (fallidas.length) patchFotos(new Set(fallidas), (it) => ({ takenAt: previo.get(it.id) ?? null })); };
    const quitarBorradas = (borradas) => {
      if (!borradas.length) return;
      const fuera = new Set(borradas);
      setItems((prev) => prev.filter((it) => !fuera.has(it.id)));
    };
    patchFotos(new Set(ids), () => ({ takenAt: ms }));
    if (ms != null && primera?.ms != null && ms < primera.ms) setPrimera({ ms });
    const done = ponerFecha(pairId, ids, ms);
    recargarVistas();
    // The sheet closes as soon as the writes are queued, online or not: a connection that is up but does not answer
    // would keep it waiting, and the change is already on this phone. What the server says comes after, in the aviso
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    terminarSeleccion();
    if (sinRed) setResultado({ titulo: hecho(ids.length), texto: 'Sin conexión: se guarda para los dos cuando vuelva.' });
    done.then((r) => {
      deshacer(r.fallidas);
      quitarBorradas(r.borradas);
      if (!sinRed || r.fallidas.length) contarResultado(r, hecho, () => guardarFecha(dia, r.fallidas));
    }).catch((e) => {
      console.warn('Bulk date failed', e);
      deshacer(ids);
      setSeleccion(new Set(ids));
      setResultado({ error: true, titulo: 'No se pudo poner la fecha', texto: 'Siguen elegidas para volver a intentarlo.', reintentar: () => guardarFecha(dia, ids) });
    });
  }

  async function favoritasEnBloque(on) {
    const ids = [...(seleccion || [])];
    if (!ids.length) return;
    const hecho = (n) => `${on ? 'En tus favoritas' : 'Fuera de tus favoritas'}: ${n === 1 ? '1 foto' : `${n} fotos`}`;
    patchFotos(new Set(ids), (it) => ({ favBy: on ? [...new Set([...(it.favBy || []), identity])] : (it.favBy || []).filter((w) => w !== identity) }));
    vistaCacheRef.current.delete('favoritas');
    terminarSeleccion();
    try {
      contarResultado(await ponerFavorita(pairId, ids, identity, on), hecho);
    } catch (e) {
      console.warn('Bulk favourite failed', e);
      setResultado({ error: true, titulo: 'No se pudo cambiar en tus favoritas' });
    }
  }

  // A success says itself and goes; an error stays until it is closed
  useEffect(() => {
    if (!resultado || resultado.error) return undefined;
    const t = setTimeout(() => setResultado(null), 6000);
    return () => clearTimeout(t);
  }, [resultado]);

  function dejarGolpe(dia) {
    const next = [...golpeVisto, dia];
    setGolpeVisto(next);
    try { localStorage.setItem(golpeKey, JSON.stringify(next)); } catch {}
  }

  function irAMes(y, m) {
    setSaltarOpen(false);
    setVista({ tipo: 'mes', y, m });
    // From a heading far down the grid: the month starts at the top
    const box = rootRef.current?.closest('.app-scroll');
    if (box && typeof box.scrollTo === 'function') box.scrollTo({ top: 0 });
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
  const enVista = vista.tipo !== 'todas';
  const vistaActual = enVista && vistaDatos.key === vistaKey ? vistaDatos : { items: [], loading: true, error: false };
  const shown = enVista
    ? vistaActual.items.map((it) => (it.thumbUrl ? it : { ...it, thumbUrl: vistaThumbsRef.current.get(it.id) || '' }))
    : items;
  const groups = !enVista ? groupByMonth(items) : vista.tipo === 'haceUnAno' ? groupByAnos(shown) : groupByMonth(shown, fechaEfectiva);
  // Las que se están subiendo van delante, en el mes de hoy
  if (!enVista && uploadingCount > 0 && groups[0]?.key !== monthKey(Date.now())) {
    groups.unshift({ key: monthKey(Date.now()), label: monthLabel(Date.now()), items: [] });
  }
  const isEmpty = items.length === 0 && uploadingCount === 0;
  const nSel = seleccion ? seleccion.size : 0;
  const subtitle = seleccionando ? (nSel ? `${nSel} elegidas` : 'Elige las fotos')
    : loading ? 'Cargando fotos…' : loadError ? 'No disponibles ahora' : isEmpty ? 'Ninguna todavía' : 'Las de los dos';
  // The biggest upload of one day still without dates, among the photos on screen, unless dismissed
  const golpe = !seleccionando && !loading && !loadError
    ? subidasDeGolpe((enVista ? vistaActual.items : items).filter((it) => !pendingIds.includes(it.id))).find((d) => !golpeVisto.includes(d.dia)) || null
    : null;
  const elegidas = seleccionando
    ? [...new Map([...items, ...vistaActual.items].filter((it) => seleccion.has(it.id)).map((it) => [it.id, it])).values()]
    : [];
  const elegidasFav = elegidas.length > 0 && elegidas.every((it) => it.favBy?.includes(identity));
  const viewerItem = viewer.id ? shown.find((it) => it.id === viewer.id) || items.find((it) => it.id === viewer.id) : null;
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
  const nextOnNextPage = !enVista && at >= 0 && !nextItem && hasMore;

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
    // With the selection bar (or its result) floating at the bottom, room so it covers no photo
    <div ref={rootRef} className={`flex flex-col ${seleccionando || resultado ? 'pb-28' : 'pb-6'}`}>
      <header className="flex items-end justify-between gap-3 pt-1.5 pb-3.5 pl-5 pr-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="serif text-4xl leading-[1.05] font-normal tracking-[-0.01em]">Galería</h1>
          <p className="text-sm text-ink-2" aria-live={seleccionando ? 'polite' : undefined}>{subtitle}</p>
        </div>
        {seleccionando ? (
          <Button variant="sec" onClick={terminarSeleccion}>Listo</Button>
        ) : (
          <div className="flex items-center gap-1">
            {/* ↻: en la PWA de iPhone no hay otra forma de recargar (plan §0 nº 8) */}
            <Button icon="recargar" label="Actualizar" title="Actualizar" onClick={() => window.location.reload()} />
            <Button icon="subir" onClick={pickFiles} aria-label="Subir fotos">Subir</Button>
          </div>
        )}
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

      {!loading && !loadError && (!isEmpty || enVista) && (
        <div className="px-4 pb-3.5">
          {vista.tipo === 'mes' ? (
            <MesBarra onTodas={() => setVista({ tipo: 'todas' })} onOtro={abrirSaltar} />
          ) : (
            <FiltroGaleria valor={vista.tipo} onChange={(tipo) => setVista({ tipo })} />
          )}
        </div>
      )}

      {golpe && !(enVista && vistaActual.loading) && (
        // Uploads done all at once (the first ones, mostly): one tap picks them and asks their day
        <section aria-label="Fotos subidas el mismo día" className="card mx-4 mb-3.5 flex flex-col gap-2.5 py-3.5">
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] font-semibold">{golpe.ids.length} fotos se subieron el {photoDate(golpe.ms)}</p>
            <p className="text-[13px] text-ink-2 text-pretty">Si son de otros días, ponles el suyo: así salen en su mes, en «Hace un año» y en Nuestro año.</p>
          </div>
          <div className="flex items-center gap-1">
            <Button onClick={() => { setSeleccion(new Set(golpe.ids)); setFechaOpen(true); }}>Ponerles fecha</Button>
            <Button variant="txt" onClick={() => dejarGolpe(golpe.dia)}>Ahora no</Button>
          </div>
        </section>
      )}

      {loading || (enVista && vistaActual.loading) ? (
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
      ) : enVista && vistaActual.error ? (
        <section role="alert" className="mx-4 mt-3 flex flex-col items-center gap-2.5 py-7 px-6 rounded-hero bg-sunk text-center">
          <Icon name="info" size={30} className="text-ink-2" />
          <p className="text-[17px] font-semibold">No se pudieron cargar estas fotos</p>
          <p className="text-sm text-ink-2">Puede ser la conexión. Las fotos siguen ahí.</p>
          <Button variant="sec" onClick={() => setVistaRecarga((k) => k + 1)}>Reintentar</Button>
          <p className="num text-xs text-ink-2 opacity-75">{vistaActual.error}</p>
        </section>
      ) : enVista && shown.length === 0 ? (
        <section className="mx-4 mt-3 flex flex-col items-center gap-2 py-9 px-6 rounded-hero border-[1.5px] border-dashed border-line text-center">
          {vista.tipo === 'favoritas' && <Icon name="latido" size={30} className="text-accent-ink" />}
          <p className="serif text-[24px] leading-tight">{VACIA[vista.tipo].titulo}</p>
          <p className="text-[15px] text-ink-2 max-w-[270px] text-pretty">{VACIA[vista.tipo].texto}</p>
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
            <section key={g.key} className="relative">
              {/* On the heading's line, outside it: «Seleccionar» on the first one; while selecting, all of a group */}
              {(seleccionando || gi === 0) && g.items.length > 0 && (() => {
                const llena = seleccionando && g.items.every((it) => seleccion.has(it.id) || pendingIds.includes(it.id));
                return (
                  <button
                    type="button"
                    onClick={() => (seleccionando ? alternar(g.items.map((it) => it.id)) : setSeleccion(new Set()))}
                    aria-label={seleccionando ? `${llena ? 'Quitar' : 'Elegir'} todas las de ${g.label}` : undefined}
                    className={`absolute right-2 ${gi === 0 ? '-top-2.5' : 'top-2.5'} h-10 px-3 rounded-full text-[13px] font-semibold text-accent-ink active:bg-sunk`}
                  >
                    {!seleccionando ? 'Seleccionar' : llena ? 'Ninguna' : 'Todas'}
                  </button>
                );
              })()}
              <h2 className={`etiqueta px-5 pb-2.5 ${gi === 0 ? 'pt-1' : 'pt-6'}`}>
                {vista.tipo === 'haceUnAno' ? g.label : (
                  // A month's heading opens «Ir a un mes»
                  <button type="button" onClick={abrirSaltar} aria-haspopup="dialog" className="inline-flex items-center gap-1 -my-2 py-2 uppercase active:opacity-60">
                    {g.label}<Icon name="abajo" size={14} />
                  </button>
                )}
              </h2>
              <div className="grid grid-cols-3 gap-0.5">
                {gi === 0 && !enVista && Array.from({ length: uploadingCount }, (_, i) => (
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
                    onClick={() => (seleccionando ? alternar([it.id]) : openViewer(it.id))}
                    aria-label={`Foto del ${photoDate((enVista ? fechaEfectiva(it) : it.createdAt) || 0)}${noLeidos.has(it.id) ? ', con comentarios sin leer' : ''}`}
                    aria-pressed={seleccionando ? seleccion.has(it.id) : undefined}
                    disabled={seleccionando && pendingIds.includes(it.id)}
                    className="galeria-celda relative block w-full aspect-square overflow-hidden bg-sunk active:opacity-80 disabled:opacity-50"
                    style={{ animationDelay: `${Math.min(i, 11) * 20}ms` }}
                  >
                    {it.thumbUrl ? (
                      <img src={it.thumbUrl} alt="" className="galeria-foto absolute inset-0 w-full h-full object-cover" />
                    ) : online ? (
                      <span className="galeria-hueco" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-ink-2"><Icon name="sinConexion" size={20} /></span>
                    )}
                    {noLeidos.has(it.id) && !seleccionando && (
                      <span aria-hidden="true" className="galeria-punto absolute top-1.5 right-1.5" />
                    )}
                    {/* In «Favoritas», whose it is: one heart, or two when both keep it */}
                    {vista.tipo === 'favoritas' && it.favBy?.length > 0 && (
                      <span aria-hidden="true" className="galeria-fav absolute right-1.5 bottom-1.5">
                        {it.favBy.length > 1 && <Icon name="latido" filled size={14} />}
                        <Icon name="latido" filled size={14} />
                      </span>
                    )}
                    {pendingIds.includes(it.id) && (
                      <span className="absolute left-1.5 bottom-1.5 px-2 py-[3px] rounded-[10px] bg-ink text-paper text-xs font-semibold">Sin subir</span>
                    )}
                    {seleccionando && !pendingIds.includes(it.id) && (
                      <span aria-hidden="true" className="galeria-marca">
                        {seleccion.has(it.id) && (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="flex flex-col items-center gap-2 px-4 pt-5">
            {enVista ? (
              <p className="etiqueta py-3.5">{shown.length === 1 ? '1 foto' : `${shown.length} fotos`}</p>
            ) : hasMore ? (
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
              onFav={onFav}
              comentarios={{ n: nComentarios, unread: sinLeer }}
              onComments={() => setComentariosOpen(true)}
            />
          )}
        </div>
      </Modal>

      {resultado ? (
        <div className="seleccion-barra" role={resultado.error ? 'alert' : 'status'}>
          <span className="flex-1 min-w-0 flex flex-col gap-px pl-1.5">
            <span className="text-[15px] font-semibold leading-snug">{resultado.titulo}</span>
            {resultado.texto && <span className="text-[13px] leading-snug opacity-80">{resultado.texto}</span>}
          </span>
          {resultado.reintentar && (
            <button type="button" className="seleccion-accion" onClick={() => { const r = resultado.reintentar; setResultado(null); r(); }}>Reintentar</button>
          )}
          <button type="button" className="seleccion-accion seleccion-icono" aria-label="Cerrar aviso" onClick={() => setResultado(null)}>
            <Icon name="cerrar" />
          </button>
        </div>
      ) : seleccionando && (
        <SeleccionBarra
          n={nSel}
          favOn={elegidasFav}
          onFecha={() => setFechaOpen(true)}
          onAlbum={() => setAlbumOpen(true)}
          onFav={() => favoritasEnBloque(!elegidasFav)}
        />
      )}

      <FechaHoja
        isOpen={fechaOpen && seleccionando}
        onClose={() => setFechaOpen(false)}
        n={nSel}
        inicial={fechaComun(elegidas)}
        puedeQuitar={elegidas.some((it) => it.takenAt != null)}
        onGuardar={guardarFecha}
      />

      {/* The Recuerdos lot's sheet: it lists the albums, writes through lib/albumes and calls onDone when it closes */}
      {albumOpen && seleccionando && (
        <AlbumPicker pairId={pairId} ids={[...seleccion]} onDone={() => setAlbumOpen(false)} />
      )}

      <SaltarMes
        isOpen={saltarOpen}
        onClose={() => setSaltarOpen(false)}
        desde={primera?.ms ?? null}
        error={!!primera?.error}
        actual={vista.tipo === 'mes' ? vista : null}
        onElegir={irAMes}
      />

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
