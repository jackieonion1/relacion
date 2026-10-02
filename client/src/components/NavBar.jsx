import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import Icon from './Icon';
import Sheet from './Sheet';
import { useGaleriaBadge } from '../lib/fotoAvisos';

const tabs = [
  { to: '/', label: 'Inicio', icon: 'inicio' },
  { to: '/gallery', label: 'Galería', icon: 'galeria' },
  { to: '/calendar', label: 'Calendario', icon: 'calendario' },
  { to: '/notes', label: 'Notas', icon: 'notas' },
];

// «Más» (Mas.dc.html): the screens without a tab of their own, as a 2×2 sheet; «Recuerdos» (3.1) goes below, full width
export const MORE = [
  { to: '/map', label: 'Mapa', sub: 'Dónde está cada uno', icon: 'mapa' },
  { to: '/music', label: 'Música', sub: 'Vuestra lista', icon: 'musica' },
  { to: '/roulette', label: 'Ruleta', sub: 'Para decidir', icon: 'ruleta' },
  { to: '/coin', label: 'Moneda', sub: '🍪 o 🫒', icon: 'moneda' },
  { to: '/recuerdos', label: 'Recuerdos', sub: 'Álbumes, sellos y cápsulas', icon: 'recuerdos', wide: true },
];

export default function NavBar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [openMore, setOpenMore] = React.useState(false);
  // /recuerdos has screens under it (sellos, álbumes…): all of them keep «Más» lit
  const inMore = MORE.some((m) => loc.pathname === m.to || loc.pathname.startsWith(`${m.to}/`));
  const galeriaBadge = useGaleriaBadge();
  const tabIdx = tabs.findIndex((t) => t.to === loc.pathname);
  const pillIdx = inMore ? tabs.length : tabIdx;

  return (
    <>
      <nav aria-label="Principal" className="barra fixed bottom-0 inset-x-0 z-70 navbar-safe">
        <div className="max-w-(--breakpoint-md) mx-auto grid grid-cols-5 h-16 relative">
          {/* Sliding pill behind the active tab; hidden where no tab is active (Ajustes) */}
          <span
            aria-hidden="true"
            className="barra-pill absolute top-[7px] left-0 w-1/5 flex justify-center pointer-events-none"
            style={{ transform: `translateX(${Math.max(pillIdx, 0) * 100}%)`, opacity: pillIdx < 0 ? 0 : 1 }}
          >
            <span className="w-14 h-[30px] rounded-full bg-lacre-soft" />
          </span>
          {tabs.map((t, i) => {
            const active = i === tabIdx;
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? 'page' : undefined}
                className={`tab ${active ? 'is-on' : ''}`}
                onClick={() => setOpenMore(false)}
              >
                <Icon name={t.icon} />
                {/* Unread photo comments (always 0 until the Gallery lot fills in lib/fotoAvisos) */}
                {t.to === '/gallery' && galeriaBadge > 0 && <span className="tab-punto" role="img" aria-label="Comentarios sin leer" />}
                <span>{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openMore}
            className={`tab ${inMore || openMore ? 'is-on' : ''}`}
            onClick={() => setOpenMore(true)}
          >
            <Icon name="mas" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      <Sheet isOpen={openMore} onClose={() => setOpenMore(false)}>
        <div className="px-4 pt-3 pb-6">
          <h2 className="etiqueta px-1 pb-3">Más</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {MORE.map((m, i) => (
              <button
                key={m.to}
                type="button"
                aria-current={loc.pathname === m.to ? 'page' : undefined}
                className={`mas-item ${m.wide ? 'col-span-2' : ''}`}
                style={{ animationDelay: `${60 + i * 30}ms` }}
                onClick={() => { setOpenMore(false); navigate(m.to); }}
              >
                <Icon name={m.icon} className="text-accent-ink" />
                <span className="flex flex-col items-start">
                  <span className="text-base font-semibold">{m.label}</span>
                  <span className="text-[13px] text-ink-2">{m.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </>
  );
}
