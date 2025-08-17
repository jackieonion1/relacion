import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import HomeIcon from './icons/HomeIcon';
import CameraIcon from './icons/CameraIcon';
import CalendarIcon from './icons/CalendarIcon';
import MapIcon from './icons/MapIcon';
import CoinIcon from './icons/CoinIcon';
import NotesIcon from './icons/NotesIcon';
import RouletteIcon from './icons/RouletteIcon';

// Inline icon: circle with a plus, matching stroke style of other icons
function PlusCircleIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 8.25v7.5M8.25 12h7.5" />
    </svg>
  );
}

const tabs = [
  { to: '/', label: 'Inicio', icon: HomeIcon },
  { to: '/gallery', label: 'Galería', icon: CameraIcon },
  { to: '/calendar', label: 'Calendario', icon: CalendarIcon },
  { to: '/notes', label: 'Notas', icon: NotesIcon },
];

export default function NavBar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [openMore, setOpenMore] = React.useState(false);
  const othersActive = openMore || loc.pathname === '/map' || loc.pathname === '/roulette' || loc.pathname === '/coin';
  const othersRef = React.useRef(null);
  const [anchorX, setAnchorX] = React.useState(0);
  
  return (
    <>
      {/* Portal: overlay gradient (stops above navbar) + floating menu */}
      {createPortal(
        <>
          {/* Gradient overlay covering content & FABs, not the navbar */}
          <div
            className={`fixed left-0 right-0 top-0 transition-opacity duration-400 ease-out ${openMore ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            style={{
              bottom: 0,
              zIndex: 60,
              background: openMore
                ? 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0) 75%)'
                : 'transparent'
            }}
            onClick={() => setOpenMore(false)}
          />

          {/* Centered floating menu above the Otros tab (material-like entrance) */}
          <div
            className="fixed"
            style={{
              left: `${anchorX}px`,
              bottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)',
              transform: 'translateX(-50%)',
              zIndex: 80
            }}
          >
            <div
              className={`flex flex-col items-center space-y-3 origin-bottom transition-all duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] transform-gpu will-change-transform ${
                openMore ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-90 pointer-events-none'
              }`}
            >
              {/* Mapa */}
              <div className="relative w-0 h-12 flex items-center justify-center overflow-visible">
                <span className="absolute right-full mr-8 top-1/2 -translate-y-1/2 text-xs font-medium text-white whitespace-nowrap select-none z-10">
                  Mapa
                </span>
                <button
                  type="button"
                  className="w-12 h-12 shrink-0 rounded-full bg-rose-500 text-white shadow-xl hover:bg-rose-600 active:scale-95 transition-transform duration-200 transform-gpu flex items-center justify-center"
                  onClick={() => { navigate('/map'); setOpenMore(false); }}
                  aria-label="Mapa"
                  title="Mapa"
                >
                  <MapIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Ruleta */}
              <div className="relative w-0 h-12 flex items-center justify-center overflow-visible">
                <span className="absolute right-full mr-8 top-1/2 -translate-y-1/2 text-xs font-medium text-white whitespace-nowrap select-none z-10">
                  Ruleta
                </span>
                <button
                  type="button"
                  className="w-12 h-12 shrink-0 rounded-full bg-rose-500 text-white shadow-xl hover:bg-rose-600 active:scale-95 transition-transform duration-200 transform-gpu flex items-center justify-center"
                  onClick={() => { navigate('/roulette'); setOpenMore(false); }}
                  aria-label="Ruleta"
                  title="Ruleta"
                >
                  <RouletteIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Moneda */}
              <div className="relative w-0 h-12 flex items-center justify-center overflow-visible">
                <span className="absolute right-full mr-8 top-1/2 -translate-y-1/2 text-xs font-medium text-white whitespace-nowrap select-none z-10">
                  Moneda
                </span>
                <button
                  type="button"
                  className="w-12 h-12 shrink-0 rounded-full bg-rose-500 text-white shadow-xl hover:bg-rose-600 active:scale-95 transition-transform duration-200 transform-gpu flex items-center justify-center"
                  onClick={() => { navigate('/coin'); setOpenMore(false); }}
                  aria-label="Moneda"
                  title="Moneda"
                >
                  <CoinIcon className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      <nav className="fixed bottom-0 inset-x-0 z-[70] border-t border-rose-100 bg-white/90 backdrop-blur navbar-safe">
        <div className="max-w-screen-md mx-auto grid grid-cols-5 relative">
          {tabs.map(t => {
            const active = loc.pathname === t.to;
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-label={t.label}
                className={`flex flex-col items-center justify-center h-16 text-sm transition-all duration-200 ease-out transform ${
                  active 
                    ? 'text-rose-600 font-medium scale-105' 
                    : 'text-gray-500 hover:text-gray-700 hover:scale-102'
                }`}
                onClick={() => setOpenMore(false)}
              >
                <Icon className={`w-6 h-6 transition-all duration-200 ${active ? 'drop-shadow-sm' : ''}`} />
                <span className="text-[11px] mt-1 transition-all duration-200">{t.label}</span>
              </Link>
            );
          })}

          {/* Otros (floating actions) trigger */}
          <div className="relative flex items-center justify-center">
            <button
              ref={othersRef}
              type="button"
              aria-label="Otros"
              className={`flex flex-col items-center justify-center h-16 text-sm transition-all duration-200 ease-out transform ${
                othersActive
                  ? 'text-rose-600 font-medium scale-105'
                  : 'text-gray-500 hover:text-gray-700 hover:scale-102'
              }`}
              onClick={() => setOpenMore(v => {
                const next = !v;
                if (!v && othersRef.current) {
                  const r = othersRef.current.getBoundingClientRect();
                  setAnchorX(r.left + r.width / 2);
                }
                return next;
              })}
            >
              <PlusCircleIcon className={`w-6 h-6 transition-all duration-200 ${othersActive ? 'drop-shadow-sm' : ''}`} />
              <span className="text-[11px] mt-1 transition-all duration-200">Otros</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
