import React, { useEffect, useMemo, useState } from 'react';
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

// Every screen lays out its own width, padding and serif h1 (plan §5 nº 00), so <main> adds none
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
      case '/settings': return 'Ajustes';
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
