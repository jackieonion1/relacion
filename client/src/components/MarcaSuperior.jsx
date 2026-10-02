import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import Icon from './Icon';
import Campana from './ActividadHoja';
import { useActividad } from '../lib/actividadAvisos';

function isOnline() {
  try { return navigator.onLine !== false; } catch { return true; }
}

// Global online/offline state (C10). Before this only Gallery and RepairApp listened, each on its own
export function useOnline() {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

// True once the nearest scroll container (.app-scroll) has left the top: the bar is paper-opaque at rest and glass after
function useScrolled(ref) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const box = ref.current?.closest('.app-scroll');
    if (!box) return undefined;
    const update = () => setScrolled(box.scrollTop > 0);
    update();
    box.addEventListener('scroll', update, { passive: true });
    return () => box.removeEventListener('scroll', update);
  }, [ref]);
  return scrolled;
}

// 🍪🫒 and ⚙ on every screen (Q2), sticky over the content, and on Inicio the bell of Avisos just left of the ⚙.
// The route title is each screen's own serif h1. The music pill (Music.jsx, fixed top safe+8px) lands just left of
// the ⚙ while a song is loaded, and of the bell on Inicio
export default function MarcaSuperior() {
  const online = useOnline();
  const inicio = useLocation().pathname === '/';
  // Subscribed here, on every screen: the listener lives with the app and not only while Inicio is open
  const actividad = useActividad();
  const ref = useRef(null);
  const scrolled = useScrolled(ref);
  return (
    <div ref={ref} className={`marca${scrolled ? ' is-scrolled' : ''}`}>
      <div className="max-w-(--breakpoint-md) mx-auto h-11 flex items-center justify-between pl-5 pr-2">
        <span className="text-[17px] leading-none" role="img" aria-label="Nosotros">🍪🫒</span>
        <div className="flex items-center">
          {inicio && <Campana actividad={actividad} />}
          <Link to="/settings" aria-label="Ajustes" className="btn btn-icono">
            <Icon name="ajustes" />
          </Link>
        </div>
      </div>
      {!online && (
        <div role="status" className="flex justify-center pb-2 pointer-events-none">
          <span className="sin-conexion">
            <Icon name="sinConexion" size={18} />
            Sin conexión · ves lo guardado
          </span>
        </div>
      )}
    </div>
  );
}
