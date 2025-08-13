import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Gallery from './pages/Gallery';
import CalendarPage from './pages/Calendar';
import MapPage from './pages/Map';
import Notes from './pages/Notes';
import NavBar from './components/NavBar';
import InstallPrompt from './components/InstallPrompt';
import CogIcon from './components/icons/CogIcon';

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
    const v = (e.currentTarget.pair?.value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(v)) return;
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
      default: return '';
    }
  }, [location.pathname]);

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

  return (
    <PairGate>
      <IdentityGate>
        <div className="app-shell">
          <div className="app-scroll">
            <div className="min-h-screen bg-rose-50/50 text-gray-900 flex flex-col">
              <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-rose-100 transition-all duration-300">
                <div className="max-w-screen-md mx-auto px-4 h-14 grid grid-cols-3 items-center">
                  <span className="font-semibold text-rose-600 transition-all duration-200">🍪🫒</span>
                  <span className="text-sm text-gray-500 transition-all duration-200 text-center">{title}</span>
                  <Link to="/settings" className="justify-self-end text-gray-500 hover:text-rose-600 transition-colors duration-200 transform hover:scale-110">
                    <CogIcon className="w-6 h-6 transition-all duration-200" />
                  </Link>
                </div>
              </header>

              <InstallPrompt />

              <main className={`flex-1 max-w-screen-md mx-auto w-full px-4 pb-safe-content pt-4 transition-all duration-300 ease-out ${
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
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
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
  const [pair, setPair] = useState(() => localStorage.getItem(PAIR_KEY) || '');

  useEffect(() => {
    if (pair) localStorage.setItem(PAIR_KEY, pair);
  }, [pair]);

  const shareLink = typeof window !== 'undefined' && pair
    ? `${window.location.origin}/?pair=${encodeURIComponent(pair)}`
    : '';

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-rose-600">Ajustes</h2>
      <div className="card">
        <label className="block text-sm text-gray-600 mb-1">Código de pareja</label>
        <div className="flex gap-2">
          <input value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} placeholder="AB12CD" maxLength={12}
                 className="input flex-1 uppercase tracking-widest" />
          <button onClick={() => { setPair(''); localStorage.removeItem(PAIR_KEY); }} className="btn-ghost">Borrar</button>
        </div>
        {shareLink && (
          <div className="flex items-center gap-2 mt-2">
            <input readOnly value={shareLink} className="input flex-1 text-xs" />
            <button onClick={() => navigator.clipboard?.writeText(shareLink)} className="btn-primary text-xs">Copiar</button>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">Comparte este enlace por WhatsApp. Al abrirlo, se configura automáticamente.</p>
      </div>
      <IdentityReset />
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
