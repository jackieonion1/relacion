import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import Icon from '../components/Icon';
import FotosMosaico, { useMiniaturas } from '../components/FotosMosaico';
import RecuerdosHoja from '../components/RecuerdosHoja';
import { fechaCorta, fotosDelDia, haceAnosTexto } from '../lib/recuerdos';
import { rangoDiaMadrid } from '../lib/fotoFecha';
import { madridDayKey } from '../lib/photos';
import { mesiversarios } from '../lib/sellos';
import { yaAbierto } from '../lib/nuestroAno';

// Thumbs asked for in each year of «Hace un año»: a day of a trip can have many more photos than that
const MINIATURAS = 24;

const haceTexto = haceAnosTexto;
// The day of `hoy` (Madrid) `anos` years ago, «2 oct 2025»
function diaDeHace(anos, hoy) {
  const [y, m, d] = madridDayKey(hoy).split('-').map(Number);
  return fechaCorta(rangoDiaMadrid(y - anos, m - 1, d).desde + 12 * 3600000);
}

// «Hace un año»: this same day in the years before, photo by photo. Quiet when there is nothing: most days have none
function HaceUnAno({ pairId }) {
  const navigate = useNavigate();
  const [urls, poner] = useMiniaturas();
  const [estado, setEstado] = useState({ fase: 'carga', grupos: [], listo: false });
  const hoy = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!pairId) { setEstado({ fase: 'lista', grupos: [], listo: true }); return undefined; }
    let cancelado = false;
    (async () => {
      try {
        const grupos = await fotosDelDia(pairId, hoy, 3, { onThumb: poner, max: MINIATURAS });
        if (cancelado) return;
        setEstado({ fase: 'lista', grupos, listo: false });
        Promise.all(grupos.map((g) => g.thumbsDone)).catch(() => {}).then(() => { if (!cancelado) setEstado((e) => ({ ...e, listo: true })); });
      } catch {
        if (!cancelado) setEstado({ fase: 'error', grupos: [], listo: true });
      }
    })();
    return () => { cancelado = true; };
  }, [pairId, hoy, poner]);

  if (estado.fase === 'carga') {
    return <div role="status" aria-label="Buscando recuerdos de hoy" className="mb-6 h-[84px] rounded-hero bg-card border border-line" />;
  }
  if (estado.fase === 'error') {
    return (
      <p className="mb-6 px-1 text-[15px] text-ink-2">No hemos podido mirar qué pasó un día como hoy. Hace falta conexión.</p>
    );
  }
  if (!estado.grupos.length) {
    return (
      <section aria-label="Hace un año" className="mb-6 p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-1.5">
        <h2 className="etiqueta">Hace un año</h2>
        <p className="serif text-[18px] leading-[1.35] text-ink-2">Un día como hoy no hay fotos de otros años 🩷</p>
      </section>
    );
  }
  return (
    <div className="mb-6 flex flex-col gap-5">
      {estado.grupos.map((g) => (
        <section key={g.anos} aria-label={haceTexto(g.anos)}>
          <div className="flex flex-col gap-0.5 px-1 pb-2.5">
            <h2 className="serif text-[26px] leading-[1.1] font-normal">{haceTexto(g.anos)}</h2>
            <p className="num text-[14px] text-ink-2">{diaDeHace(g.anos, hoy)}</p>
          </div>
          <div className="-mx-4">
            <FotosMosaico
              fotos={g.items} urls={urls} listo={estado.listo} pairId={pairId} poner={poner}
              onTocar={(f) => navigate(`/gallery?photo=${encodeURIComponent(f.id)}`, { state: { volver: '/recuerdos' } })}
              label={haceTexto(g.anos)}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

// The hub of the memories: today in other years on top, and the doors to the stamps, the albums, the capsules and,
// once it has opened, «Nuestro año»
export default function Recuerdos() {
  const location = useLocation();
  const pairId = localStorage.getItem('pairId') || '';
  const volver = location.state?.volver;
  const sellos = useMemo(() => mesiversarios().sellos.length, []);
  const entradas = [
    { to: '/recuerdos/sellos', icon: 'latido', label: 'Sellos', sub: sellos === 1 ? 'Un mesiversario' : `${sellos} mesiversarios` },
    { to: '/recuerdos/albumes', icon: 'galeria', label: 'Álbumes', sub: 'Viajes y escapadas' },
    { to: '/recuerdos/capsulas', icon: 'notas', label: 'Cápsulas', sub: 'Para abrir más adelante' },
    ...(yaAbierto() ? [{ to: '/recuerdos/nuestro-ano', icon: 'recuerdos', label: 'Nuestro año', sub: 'En postales' }] : []),
  ];

  return (
    <RecuerdosHoja titulo="Recuerdos" atras={volver ? { to: volver } : null}>
      <HaceUnAno pairId={pairId} />
      <nav aria-label="Recuerdos" className="grid grid-cols-2 gap-2.5">
        {entradas.map((e, i) => (
          <Link key={e.to} to={e.to} state={{ volver: '/recuerdos' }} className="mas-item" style={{ animationDelay: `${60 + i * 30}ms` }}>
            <Icon name={e.icon} className="text-accent-ink" />
            <span className="flex flex-col items-start">
              <span className="text-base font-semibold">{e.label}</span>
              <span className="text-[13px] text-ink-2">{e.sub}</span>
            </span>
          </Link>
        ))}
      </nav>
    </RecuerdosHoja>
  );
}
