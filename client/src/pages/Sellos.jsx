import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import FotosMosaico, { useFotosDe, useVisible } from '../components/FotosMosaico';
import RecuerdosHoja from '../components/RecuerdosHoja';
import { fechaCorta, fotosEnRangoTope, portadaDeRango, rangoTexto } from '../lib/recuerdos';
import { mesiversarios, nombreSello, porAnio } from '../lib/sellos';
import { ordinal } from '../lib/nuestroAno';

// Stamps turned a little, so the album does not look ruled
const GIROS = ['-1.6deg', '1.2deg', '-0.6deg', '1.8deg'];
// Thumbs asked for in the sheet of a month: a month can have hundreds of photos
const MINIATURAS = 24;

const diaMes = (ms) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(ms);
const nombreAnio = (n) => `${n === 1 ? 'Primer' : ordinal(n).replace(/^./, (c) => c.toUpperCase())} año`;

// One stamp: the cover (the first photo of its month) is asked for when it comes near the screen
function Sello({ s, k, pairId, onAbrir }) {
  const [ref, visible] = useVisible();
  const [portada, setPortada] = useState(undefined); // undefined while it loads, '' when the month has no photo
  useEffect(() => {
    if (!visible || !pairId) return undefined;
    let cancelado = false;
    portadaDeRango(pairId, s.desde, s.hasta).then((u) => { if (!cancelado) setPortada(u); }).catch(() => { if (!cancelado) setPortada(''); });
    return () => { cancelado = true; };
  }, [visible, pairId, s.desde, s.hasta]);

  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => onAbrir(s)}
        aria-label={`${nombreSello(s)}, ${fechaCorta(s.fecha)}`}
        className={`mes-sello${s.aniversario ? ' aniversario' : ''}`}
        style={{ '--giro': GIROS[k % GIROS.length], '--k': Math.min(k, 12) }}
      >
        <span className="mes-papel">
          <span className="mes-foto">
            {portada ? <img src={portada} alt="" loading="lazy" /> : portada === undefined && pairId && visible
              ? <span className="recuerdo-hueco" /> : <Icon name="latido" size={22} filled />}
          </span>
          <span className="mes-pie">
            {s.aniversario ? <b>{nombreSello(s)} 🎉</b> : <b>{diaMes(s.fecha)}</b>}
            <span>{s.aniversario ? diaMes(s.fecha) + ' ' + new Date(s.fecha).getFullYear() : new Date(s.fecha).getFullYear()}</span>
          </span>
        </span>
        <span className="mes-lacre" aria-hidden="true">{s.n}</span>
      </button>
    </li>
  );
}

// The photos of a month, in the sheet of its stamp
function Mes({ s, pairId, onTocar }) {
  const f = useFotosDe(
    (poner) => fotosEnRangoTope(pairId, s.desde, s.hasta, { onThumb: poner, max: MINIATURAS }),
    [pairId, s.desde, s.hasta],
  );
  return (
    <div className="px-4 pt-4 pb-5">
      <div className="flex items-center gap-3 pb-4">
        <span className="mes-lacre mes-lacre-gran" aria-hidden="true">{s.n}</span>
        <div className="min-w-0 flex flex-col gap-0.5">
          <h2 className="serif text-[26px] leading-[1.1] font-normal">{s.aniversario ? `${nombreSello(s)} 🎉` : nombreSello(s)}</h2>
          <p className="num text-[14px] text-ink-2">{rangoTexto(s.desde, s.hasta - 1)}</p>
        </div>
      </div>
      {f.fase === 'carga' && <div role="status" aria-label="Buscando fotos" className="aspect-3/1 rounded-tarjeta recuerdo-hueco relative" />}
      {f.fase === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[15px] text-ink-2">No hemos podido cargar las fotos de este mes. Hace falta conexión.</p>
          <button type="button" className="btn btn-sec" onClick={f.reintentar}>Reintentar</button>
        </div>
      )}
      {f.fase === 'lista' && !f.fotos.length && (
        <p className="serif text-[18px] leading-[1.35] text-ink-2">Este mes no hay fotos todavía 🩷 Si las subisteis más tarde, ponedles su fecha desde la galería.</p>
      )}
      {f.fase === 'lista' && f.fotos.length > 0 && (
        <div className="-mx-4">
          <FotosMosaico fotos={f.fotos} urls={f.urls} listo={f.listo} pairId={pairId} poner={f.poner} onTocar={onTocar} label={`Fotos del ${nombreSello(s).toLowerCase()}`} />
        </div>
      )}
    </div>
  );
}

// The stamp album of the 24ths: one for each month together, newest first, a cover each, and the one to come
export default function Sellos() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pairId = localStorage.getItem('pairId') || '';
  const { sellos, proximo } = useMemo(() => mesiversarios(new Date()), []);
  const grupos = useMemo(() => porAnio(sellos), [sellos]);
  // The sheet of a month lives in the URL (?mes=5), so coming back from a photo finds it open
  const abierto = sellos.find((s) => String(s.n) === params.get('mes')) || null;
  let k = 0;

  return (
    <RecuerdosHoja titulo="Sellos" atras={{ to: location.state?.volver || '/recuerdos' }}>
      <section aria-label="Próximo sello" className="mb-6 p-4 rounded-hero border-[1.5px] border-dashed border-line flex items-center gap-4">
        <span className="mes-lacre mes-lacre-gran opacity-60" aria-hidden="true">{proximo.n}</span>
        <div className="min-w-0 flex flex-col gap-0.5">
          <p className="etiqueta">Siguiente</p>
          <p className="serif text-[20px] leading-[1.2] text-ink">{nombreSello(proximo)} · {fechaCorta(proximo.fecha)}</p>
          <p className="text-[14px] text-ink-2">{proximo.faltan === 1 ? 'Mañana' : `Dentro de ${proximo.faltan} días`} 🩷</p>
        </div>
      </section>
      {grupos.map((g) => (
        <section key={g.anio} aria-label={nombreAnio(g.anio)} className="mb-6">
          <h2 className="etiqueta px-1 pb-3.5">{nombreAnio(g.anio)}</h2>
          <ul className="grid grid-cols-3 gap-x-3.5 gap-y-5 px-1">
            {g.sellos.map((s) => {
              const i = k;
              k += 1;
              return <Sello key={s.n} s={s} k={i} pairId={pairId} onAbrir={(x) => setParams({ mes: String(x.n) }, { replace: true })} />;
            })}
          </ul>
        </section>
      ))}
      <Sheet isOpen={!!abierto} onClose={() => setParams({}, { replace: true })}>
        {abierto && (
          <Mes
            s={abierto} pairId={pairId}
            onTocar={(f) => navigate(`/gallery?photo=${encodeURIComponent(f.id)}`, { state: { volver: `/recuerdos/sellos?mes=${abierto.n}` } })}
          />
        )}
      </Sheet>
    </RecuerdosHoja>
  );
}
