import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Icon from './Icon';
import { fotosDelDia, haceAnosTexto } from '../lib/recuerdos';

// «Hace un año» on Inicio: a card that shows up only on the days a past year has photos (most days it renders
// nothing). A day with no photos is remembered by fotosDelDia, so those days cost no reads after the first look.
// It brings a single thumb for each year, not one for every photo, and the whole card opens the hub
export default function HaceUnAnoTarjeta() {
  const [hay, setHay] = useState(null); // { anos, total, otros: [años], url }

  useEffect(() => {
    const pairId = localStorage.getItem('pairId') || '';
    if (!pairId) return undefined;
    let cancelado = false;
    let urls = [];
    const soltar = () => urls.forEach((u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
    fotosDelDia(pairId, new Date(), 3, { max: 1 }).then((grupos) => {
      urls = grupos.flatMap((g) => g.items.map((it) => it.thumbUrl)).filter(Boolean);
      if (cancelado) { soltar(); return; }
      if (!grupos.length) return;
      const [cerca, ...otros] = grupos;
      setHay({ anos: cerca.anos, total: cerca.items.length, otros: otros.map((g) => g.anos), url: cerca.items.find((it) => it.thumbUrl)?.thumbUrl || '' });
    }).catch(() => {}); // no photos to show is no card: nothing to tell about a failed look
    return () => {
      cancelado = true;
      soltar();
    };
  }, []);

  if (!hay) return null;
  const { anos, total, otros, url } = hay;
  const fotos = `${total} ${total === 1 ? 'foto' : 'fotos'}`;

  return (
    <section aria-label="Hace un año" className="card relative mx-4 mt-3 rounded-hero py-4 pr-4 pl-[18px] flex items-center gap-4">
      {/* The whole card opens the hub, where that day is laid out; «volver» brings the back arrow here */}
      <Link
        to="/recuerdos" state={{ volver: '/' }}
        aria-label={`Ver las fotos de ${haceAnosTexto(anos).toLowerCase()}`}
        className="hace-tarjeta-abrir absolute inset-0 rounded-hero"
      />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="etiqueta">{haceAnosTexto(anos)}</p>
        <p className="serif text-[26px] leading-[1.15] text-ink">Un día como hoy</p>
        <p className="text-[15px] text-ink-2">
          {fotos}{otros.length > 0 && ` · y de ${haceAnosTexto(otros[0]).toLowerCase()}`} 🩷
        </p>
      </div>
      <div aria-hidden="true" className="hace-print">
        <span>
          {url ? <img src={url} alt="" /> : <span className="absolute inset-0 flex items-center justify-center text-line"><Icon name="latido" size={22} filled /></span>}
        </span>
      </div>
    </section>
  );
}
