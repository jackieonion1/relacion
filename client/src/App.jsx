import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router';
import Dashboard from './pages/Dashboard';
import Gallery from './pages/Gallery';
import CalendarPage from './pages/Calendar';
import MapPage from './pages/Map';
import Notes from './pages/Notes';
import Roulette from './pages/Roulette';
import Coin from './pages/Coin';
import Music from './pages/Music';
import Settings from './pages/Settings';
import NavBar from './components/NavBar';
import InstallPrompt from './components/InstallPrompt';
import UpdateBanner from './components/UpdateBanner';
import PushNotice from './components/PushNotice';
import MarcaSuperior from './components/MarcaSuperior';
import { PairGate, IdentityGate } from './components/Entrada';
import { AvisoSlot, Avisos } from './components/Aviso';
// «Así era» loads on demand (its screenshots weigh more than the rest of the app). Its CSS comes in here: a lazy
// chunk's CSS would be emitted as another static/css/main.<hash>.css and appUpdate.js would take it for a new version
import './pages/AsiEra.css';
// Same for the 3.1 screens under /recuerdos: one CSS file per lot
import './pages/Recuerdos.css';
import './pages/Capsulas.css';
import './pages/NuestroAno.css';

const AsiEra = lazy(() => import('./pages/AsiEra'));
const Recuerdos = lazy(() => import('./pages/Recuerdos'));
const Sellos = lazy(() => import('./pages/Sellos'));
const Albumes = lazy(() => import('./pages/Albumes'));
const Album = lazy(() => import('./pages/Album'));
const Capsulas = lazy(() => import('./pages/Capsulas'));
const NuestroAno = lazy(() => import('./pages/NuestroAno'));

// Titles of the /recuerdos screens, by the first part of the path after it (the hub and unknown ones: Recuerdos)
const TITULOS_RECUERDOS = { sellos: 'Sellos', albumes: 'Álbumes', capsulas: 'Cápsulas', 'nuestro-ano': 'Nuestro año' };

// Every screen lays out its own width, padding and serif h1 (plan §5 nº 00), so <main> adds none
export default function App() {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const title = useMemo(() => {
    if (location.pathname === '/recuerdos' || location.pathname.startsWith('/recuerdos/')) {
      return TITULOS_RECUERDOS[location.pathname.split('/')[2]] || 'Recuerdos';
    }
    switch (location.pathname) {
      case '/': return 'Inicio';
      case '/gallery': return 'Galería';
      case '/calendar': return 'Calendario';
      case '/notes': return 'Notas';
      case '/map': return 'Mapa';
      case '/roulette': return 'Ruleta';
      case '/coin': return 'Moneda';
      case '/music': return 'Música';
      case '/settings': return 'Ajustes';
      case '/asi-era': return 'Así era';
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
        <AvisoSlot>
        <div className={`app-shell ${location.pathname === '/music' ? 'con-mini' : ''}`}>
          <div className={`app-scroll ${isRoulette ? 'no-scroll' : ''}`}>
            <div className="min-h-dvh bg-paper text-ink flex flex-col">
              <MarcaSuperior />

              <main className={`flex-1 w-full ${isRoulette ? 'pb-2' : 'pb-safe-content'} transition-all duration-300 ease-out ${
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
                  <Route path="/asi-era" element={<Suspense fallback={null}><AsiEra /></Suspense>} />
                  <Route path="/recuerdos" element={<Suspense fallback={null}><Recuerdos /></Suspense>} />
                  <Route path="/recuerdos/sellos" element={<Suspense fallback={null}><Sellos /></Suspense>} />
                  <Route path="/recuerdos/albumes" element={<Suspense fallback={null}><Albumes /></Suspense>} />
                  <Route path="/recuerdos/albumes/:id" element={<Suspense fallback={null}><Album /></Suspense>} />
                  <Route path="/recuerdos/capsulas" element={<Suspense fallback={null}><Capsulas /></Suspense>} />
                  <Route path="/recuerdos/nuestro-ano" element={<Suspense fallback={null}><NuestroAno /></Suspense>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                {/* Keep Music mounted always; it will render its page UI only on /music but keeps audio/mini-player global */}
                <Music />
              </main>
            </div>
          </div>
          {/* One slot above the tab bar: Actualizar > Instalar > Notificaciones, one at a time (Aviso.jsx) */}
          <Avisos>
            <UpdateBanner />
            <InstallPrompt />
            <PushNotice />
          </Avisos>
          <NavBar />
        </div>
        </AvisoSlot>
      </IdentityGate>
    </PairGate>
  );
}
