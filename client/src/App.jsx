import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router';
import Dashboard from './pages/Dashboard';
import Gallery from './pages/Gallery';
import CalendarPage from './pages/Calendar';
import MapPage from './pages/Map';
import Notes from './pages/Notes';
import Roulette from './pages/Roulette';
import Coin from './pages/Coin';
import Music from './pages/Music';
import NavBar from './components/NavBar';
import InstallPrompt from './components/InstallPrompt';
import UpdateBanner from './components/UpdateBanner';
import RepairApp from './components/RepairApp';
import PushNotice from './components/PushNotice';
import CogIcon from './components/icons/CogIcon';
import Modal from './components/Modal';
import { subscribeToPush, getPushSubscription, unsubscribeFromPush, getPushDiag } from './lib/push';
import { getResyncInfo } from './lib/pushResync';
import { normalizePairCode, isValidPairCode } from './lib/pairCode';
import { versionLabel } from './lib/buildInfo';

const IDENTITY_KEY = 'identity'; // 'yo' | 'ella'
const PAIR_KEY = 'pairId';

function readPairFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('pair');
    return raw ? raw.trim().toUpperCase() : '';
  } catch {
    return '';
  }
}

function PairGate({ children }) {
  const [pairId, setPairId] = useState(() => localStorage.getItem(PAIR_KEY) || readPairFromUrl() || '');

  useEffect(() => {
    if (!pairId) return;
    localStorage.setItem(PAIR_KEY, pairId);
    // Limpia el parámetro de la URL si venía en el enlace
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('pair')) {
        url.searchParams.delete('pair');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, [pairId]);

  function onSubmit(e) {
    e.preventDefault();
    const v = normalizePairCode(e.currentTarget.pair?.value);
    if (!isValidPairCode(v)) return;
    setPairId(v);
    e.currentTarget.reset();
  }

  if (!pairId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-rose-50 to-white p-6">
        <div className="w-full max-w-sm card text-center">
          <h1 className="text-2xl font-semibold text-rose-600 mb-1">Bienvenid@</h1>
          <p className="text-gray-600 mb-4">Introduce el código de pareja para continuar</p>
          <form onSubmit={onSubmit} className="space-y-3">
            <input name="pair" placeholder="AB12CD" maxLength={12}
                   className="input w-full uppercase tracking-widest text-center py-3" />
            <button className="btn-primary w-full py-3 font-medium active:scale-[0.98]">Continuar</button>
          </form>
          <p className="text-xs text-gray-400 mt-3">El código lo comparte tu pareja. Se guarda solo en tu dispositivo.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function IdentityGate({ children }) {
  const [identity, setIdentity] = useState(() => localStorage.getItem(IDENTITY_KEY) || '');

  function choose(id) {
    localStorage.setItem(IDENTITY_KEY, id);
    setIdentity(id);
  }

  if (!identity) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-rose-50 to-white p-6">
        <div className="w-full max-w-sm card text-center">
          <h1 className="text-2xl font-semibold text-rose-600 mb-1">Hola ✨</h1>
          <p className="text-gray-600 mb-4">¿Quién eres?</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => choose('yo')} className="btn-primary py-3 font-medium active:scale-[0.98]">Yo</button>
            <button onClick={() => choose('ella')} className="btn-ghost py-3 font-medium active:scale-[0.98]">Ella</button>
          </div>
          <p className="text-xs text-gray-400 mt-4">Se guarda solo en tu dispositivo.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const title = useMemo(() => {
    switch (location.pathname) {
      case '/': return 'Inicio';
      case '/gallery': return 'Galería';
      case '/calendar': return 'Calendario';
      case '/notes': return 'Notas';
      case '/map': return 'Mapa';
      case '/roulette': return 'Ruleta';
      case '/coin': return 'Moneda';
      case '/music': return 'Música';
      default: return '';
    }
  }, [location.pathname]);

  // Update document title with emojis preference
  useEffect(() => {
    try { document.title = `${title ? `${title} – ` : ''}🍪🫒`; } catch {}
  }, [title]);

  // Handle page transitions (skip for dashboard to prevent flash)
  useEffect(() => {
    if (location.pathname === '/') {
      // No transition for dashboard to prevent flash with loading components
      setIsTransitioning(false);
      return;
    }
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 50);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const isRoulette = location.pathname === '/roulette';

  return (
    <PairGate>
      <IdentityGate>
        <div className="app-shell">
          <div className={`app-scroll ${isRoulette ? 'no-scroll' : ''}`}>
            <div className="min-h-[100dvh] bg-rose-50/50 text-gray-900 flex flex-col">
              <header
                className="fixed top-0 inset-x-0 z-20 backdrop-blur border-b border-rose-100 transition-all duration-300"
                style={{
                  background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.7) 100%)',
                  paddingTop: 'env(safe-area-inset-top, 0px)'
                }}
              >
                <div className="max-w-screen-md mx-auto px-4 h-14 grid grid-cols-3 items-center">
                  <span className="font-semibold text-rose-600 transition-all duration-200">🍪🫒</span>
                  <span className="text-sm text-gray-500 transition-all duration-200 text-center">{title}</span>
                  <Link to="/settings" className="justify-self-end text-gray-500 hover:text-rose-600 transition-colors duration-200 transform hover:scale-110">
                    <CogIcon className="w-6 h-6 transition-all duration-200" />
                  </Link>
                </div>
              </header>
              {/* Spacer to offset fixed header height (safe-area top + 56px) */}
              <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 56px)' }} />

              <InstallPrompt />
              <UpdateBanner />
              <PushNotice />

              <main className={`flex-1 max-w-screen-md mx-auto w-full px-4 ${isRoulette ? 'pb-2' : 'pb-safe-content'} pt-4 transition-all duration-300 ease-out ${
                isTransitioning 
                  ? 'opacity-0 transform translate-y-1 scale-[0.98]'
                  : 'opacity-100'
              }`}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/roulette" element={<Roulette />} />
                  <Route path="/coin" element={<Coin />} />
                  {/* Placeholder element; actual UI is rendered by globally mounted <Music /> */}
                  <Route path="/music" element={<div />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                {/* Keep Music mounted always; it will render its page UI only on /music but keeps audio/mini-player global */}
                <Music />
              </main>
            </div>
          </div>
          <NavBar />
        </div>
      </IdentityGate>
    </PairGate>
  );
}

function Settings() {
  // `pair` es el código guardado; lo que se escribe en el input vive aparte hasta confirmar uno válido
  const [pair] = useState(() => localStorage.getItem(PAIR_KEY) || '');
  const [pairInput, setPairInput] = useState(pair);
  const [pairConfirm, setPairConfirm] = useState(''); // '' | 'save' | 'clear'
  const newPair = normalizePairCode(pairInput);
  const canSavePair = isValidPairCode(newPair) && newPair !== pair;

  // Las páginas leen el código de localStorage al montarse y la puerta (PairGate) lo guarda en su
  // estado: tras guardar o borrar se recarga para que todo arranque con el código nuevo
  function applyPair(code) {
    try {
      if (code) localStorage.setItem(PAIR_KEY, code);
      else localStorage.removeItem(PAIR_KEY);
    } catch {}
    window.location.reload();
  }

  const shareLink = typeof window !== 'undefined' && pair
    ? `${window.location.origin}/?pair=${encodeURIComponent(pair)}`
    : '';

  // Notifications (step 1): UI and permission only
  const [notifPerm, setNotifPerm] = useState(() => {
    try { return (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'unsupported'; } catch { return 'unsupported'; }
  });
  const [supports, setSupports] = useState({ notif: false, sw: false });
  const [subscribed, setSubscribed] = useState(false);
  // Última vez que el doc de esta suscripción se escribió en Firestore desde este móvil (null = sin confirmar)
  const [syncedAt, setSyncedAt] = useState(() => getResyncInfo(localStorage)?.at || null);
  const [pushDiag, setPushDiag] = useState(() => getPushDiag());
  useEffect(() => {
    try {
      setSupports({ notif: 'Notification' in window, sw: 'serviceWorker' in navigator });
      if ('Notification' in window) setNotifPerm(Notification.permission);
    } catch {}
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const sub = await getPushSubscription();
        setSubscribed(!!sub);
      } catch {}
    })();
  }, []);
  useEffect(() => {
    // Refresh diagnostics when permission/sub state changes
    try { setPushDiag(getPushDiag()); } catch {}
  }, [notifPerm, subscribed]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(e) {
      try {
        if (e?.data?.type === 'pushsubscriptionchange') {
          if (Notification.permission === 'granted' && pair) {
            const vapid = import.meta.env.REACT_APP_VAPID_PUBLIC_KEY || '';
            const identity = localStorage.getItem(IDENTITY_KEY) || 'yo';
            if (vapid) {
              subscribeToPush(pair, identity, vapid).then(() => setSubscribed(true)).catch(() => {});
            }
          }
        }
      } catch {}
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [pair]);
  async function requestNotifications() {
    try {
      if (!('Notification' in window)) return;
      const res = await Notification.requestPermission();
      setNotifPerm(res);
    } catch (e) {
      console.warn('Notification permission error', e);
    }
  }

  async function onSubscribe() {
    try {
      const vapid = import.meta.env.REACT_APP_VAPID_PUBLIC_KEY || '';
      if (!vapid) { alert('Falta REACT_APP_VAPID_PUBLIC_KEY'); return; }
      if (!pair) { alert('Configura el código de pareja primero'); return; }
      const identity = localStorage.getItem(IDENTITY_KEY) || 'yo';
      await subscribeToPush(pair, identity, vapid);
      setSubscribed(true);
      setSyncedAt(getResyncInfo(localStorage)?.at || null);
      try { setPushDiag(getPushDiag()); } catch {}
    } catch (e) {
      console.warn('subscribe error', e);
      alert('No se pudo activar: ' + (e?.message || 'Error'));
      try { setPushDiag(getPushDiag()); } catch {}
    }
  }

  async function onUnsubscribe() {
    try {
      const identity = localStorage.getItem(IDENTITY_KEY) || 'yo';
      await unsubscribeFromPush(pair, identity);
      setSubscribed(false);
    } catch (e) {
      console.warn('unsubscribe error', e);
    }
  }

  async function onTestPush() {
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const fn = httpsCallable(getFunctions(undefined, 'europe-southwest1'), 'sendTestPush');
      await fn({ pairId: pair, title: 'Prueba', body: 'Esto es una notificación de prueba', url: '/notes' });
      alert('Notificación de prueba enviada');
    } catch (e) {
      console.warn('test push error', e);
      alert('Error enviando prueba: ' + (e?.message || 'Error'));
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-rose-600">Ajustes</h2>
      <div className="card">
        <label className="block text-sm text-gray-600 mb-1">Código de pareja</label>
        <form onSubmit={(e) => { e.preventDefault(); if (canSavePair) setPairConfirm('save'); }} className="flex gap-2">
          <input value={pairInput} onChange={(e) => setPairInput(e.target.value.toUpperCase())} placeholder="AB12CD" maxLength={12}
                 className="input flex-1 min-w-0 uppercase tracking-widest" />
          <button disabled={!canSavePair} className="btn-primary disabled:opacity-60">Guardar</button>
          <button type="button" disabled={!pair} onClick={() => setPairConfirm('clear')} className="btn-ghost disabled:opacity-60">Borrar</button>
        </form>
        {pairInput && !isValidPairCode(pairInput) && (
          <p className="text-xs text-rose-600 mt-1">Entre 4 y 12 letras o números.</p>
        )}
        {shareLink && (
          <div className="flex items-center gap-2 mt-2">
            <input readOnly value={shareLink} className="input flex-1 text-xs" />
            <button onClick={() => navigator.clipboard?.writeText(shareLink)} className="btn-primary text-xs">Copiar</button>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">Comparte este enlace por WhatsApp. Al abrirlo, se configura automáticamente.</p>
      </div>
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Notificaciones</div>
            <div className="text-gray-900 font-medium">
              {supports.notif ? (notifPerm === 'granted' ? (subscribed ? 'Suscrito' : 'Permiso concedido, sin suscripción') : notifPerm === 'denied' ? 'Bloqueadas' : 'No activadas') : 'No soportadas'}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {subscribed && notifPerm === 'granted'
                ? (syncedAt ? `Última sincronización con el servidor: ${new Date(syncedAt).toLocaleDateString()}` : 'Suscrito en este móvil, sin confirmar en el servidor')
                : 'Requiere instalar la PWA y HTTPS.'}
            </p>
          </div>
          <div className="flex gap-2">
            {notifPerm !== 'granted' ? (
              <button onClick={requestNotifications} disabled={!supports.notif} className="btn-primary disabled:opacity-60">Activar</button>
            ) : subscribed ? (
              <>
                <button onClick={onTestPush} className="btn-primary">Probar</button>
                <button onClick={onUnsubscribe} className="btn-ghost">Desactivar</button>
              </>
            ) : (
              <button onClick={onSubscribe} className="btn-primary">Suscribirme</button>
            )}
          </div>
        </div>
      </div>
      {pushDiag && (
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Diagnóstico de notificaciones</div>
          <div className="text-xs text-gray-500 break-all font-mono">{pushDiag}</div>
        </div>
      )}
      <IdentityReset />
      <RepairApp />
      {/* Qué versión tiene cada móvil, sin pedir nada técnico */}
      <p className="text-center text-xs text-gray-400">{versionLabel()}</p>
      <Modal isOpen={!!pairConfirm} onClose={() => setPairConfirm('')}>
        <div className="p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">
            {pairConfirm === 'clear' ? 'Borrar el código de pareja' : 'Cambiar el código de pareja'}
          </h3>
          <p className="text-gray-600 mb-6">
            {pairConfirm === 'clear'
              ? `Se borrará ${pair} de este dispositivo y la app te pedirá un código otra vez.`
              : `Pasarás de ${pair} a ${newPair} y verás los datos de ese código. Para volver, escribe ${pair}.`}
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setPairConfirm('')} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => applyPair(pairConfirm === 'clear' ? '' : newPair)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              {pairConfirm === 'clear' ? 'Borrar' : 'Cambiar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function IdentityReset() {
  const [id, setId] = useState(localStorage.getItem('identity') || 'yo');
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-600">Identidad</div>
          <div className="text-gray-900 font-medium">{id === 'yo' ? 'Novio 🫒' : 'Novia 🍪'}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { localStorage.setItem('identity', 'yo'); setId('yo'); }} className="btn-ghost">Novio 🫒</button>
          <button onClick={() => { localStorage.setItem('identity', 'ella'); setId('ella'); }} className="btn-ghost">Novia 🍪</button>
        </div>
      </div>
    </div>
  );
}
