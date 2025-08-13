import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import HomeIcon from './icons/HomeIcon';
import CameraIcon from './icons/CameraIcon';
import CalendarIcon from './icons/CalendarIcon';
import MapIcon from './icons/MapIcon';
import NotesIcon from './icons/NotesIcon';

const tabs = [
  { to: '/', label: 'Inicio', icon: HomeIcon },
  { to: '/gallery', label: 'Galería', icon: CameraIcon },
  { to: '/calendar', label: 'Calendario', icon: CalendarIcon },
  { to: '/notes', label: 'Notas', icon: NotesIcon },
  { to: '/map', label: 'Mapa', icon: MapIcon },
];

export default function NavBar() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 border-t border-rose-100 bg-white/90 backdrop-blur">
      <div className="max-w-screen-md mx-auto grid grid-cols-5">
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
            >
              <Icon className={`w-6 h-6 transition-all duration-200 ${active ? 'drop-shadow-sm' : ''}`} />
              <span className="text-[11px] mt-1 transition-all duration-200">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
