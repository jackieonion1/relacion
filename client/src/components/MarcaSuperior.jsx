import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Icon from './Icon';

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

// 🍪🫒 and ⚙ on every screen (Q2), sticky over the content. The route title is each screen's own serif h1.
// The music pill (Music.jsx, fixed top safe+8px right-16) lands just left of the ⚙ while a song is loaded
export default function MarcaSuperior() {
  const online = useOnline();
  return (
    <div className="marca">
      <div className="max-w-(--breakpoint-md) mx-auto h-11 flex items-center justify-between pl-5 pr-2">
        <span className="text-[17px] leading-none" role="img" aria-label="Nosotros">🍪🫒</span>
        <Link to="/settings" aria-label="Ajustes" className="btn btn-icono">
          <Icon name="ajustes" />
        </Link>
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
