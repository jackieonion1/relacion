import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Sheet from './Sheet';
import Button from './Button';
import Icon from './Icon';
import { WHO } from '../lib/fotoCampos';
import { agruparActividad, destinoActividad, insignia, lineaActividad, miniaturaFoto, textoActividad, tiempoRelativo } from '../lib/actividad';
import { verActividad } from '../lib/actividadAvisos';

// The thumb of the photo an entry is about, once it has one (the cached blob, or Storage's URL)
function Miniatura({ pairId, photoId }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let vivo = true;
    miniaturaFoto(pairId, photoId).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [pairId, photoId]);
  if (!url) return <span aria-hidden="true" className="size-11 shrink-0 rounded-xl bg-sunk" />;
  return <img src={url} alt="" className="size-11 shrink-0 rounded-xl object-cover bg-sunk" />;
}

function Fila({ e, nueva, pairId, now, onElegir }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onElegir(e)}
        aria-label={`${lineaActividad(e)}, ${tiempoRelativo(e.ms, now)}`}
        className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-200 ease-suave active:bg-sunk focus-visible:outline-2 focus-visible:outline-lacre focus-visible:-outline-offset-2"
      >
        <span aria-hidden="true" className="size-10 shrink-0 rounded-full bg-sunk flex items-center justify-center text-xl leading-none">{WHO[e.quien]}</span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-[15px] leading-[1.35] text-ink line-clamp-2 break-words">{textoActividad(e)}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            {nueva && <span aria-hidden="true" className="size-1.5 rounded-full bg-lacre" />}
            {tiempoRelativo(e.ms, now)}
          </span>
        </span>
        {e.ref?.photoId && <Miniatura pairId={pairId} photoId={e.ref.photoId} />}
      </button>
    </li>
  );
}

function Grupo({ titulo, lista, nueva, pairId, now, onElegir }) {
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="etiqueta px-5">{titulo}</h3>
      <ul className="flex flex-col">
        {lista.map((e) => <Fila key={e.id} e={e} nueva={nueva} pairId={pairId} now={now} onElegir={onElegir} />)}
      </ul>
    </section>
  );
}

// «Avisos»: what the other one has done, in «Nuevas» (since `vistoHasta`) and «Antes». onElegir(entry) goes to it
export function ActividadHoja({ isOpen, onClose, lista, vistoHasta, pairId, onElegir, now = new Date() }) {
  const { nuevas, antes } = agruparActividad(lista || [], vistoHasta);
  return (
    <Sheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col min-h-[min(50dvh,420px)] pb-4">
        <div className="flex items-center justify-between gap-3 pl-5 pr-2 pt-1.5 pb-2">
          <h2 className="serif text-2xl leading-[1.15] font-normal">Avisos</h2>
          <Button icon="cerrar" label="Cerrar avisos" onClick={onClose} />
        </div>
        {!nuevas.length && !antes.length ? (
          <p className="m-auto py-8 px-5 text-[15px] text-ink-2 text-center text-pretty max-w-[280px]">
            Aún no hay nada por aquí. Cuando la otra persona comente, reaccione o suba algo, lo verás aquí.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <Grupo titulo="Nuevas" lista={nuevas} nueva pairId={pairId} now={now} onElegir={onElegir} />
            <Grupo titulo="Antes" lista={antes} nueva={false} pairId={pairId} now={now} onElegir={onElegir} />
          </div>
        )}
      </div>
    </Sheet>
  );
}

// The bell of Inicio, next to ⚙: a lacre count while something is unseen. Opening it marks everything seen, but the
// sheet keeps «Nuevas» as they were when it opened
// `actividad` is useActividad(), from MarcaSuperior
export default function Campana({ actividad }) {
  const navigate = useNavigate();
  const { lista, vistoHasta, noLeidas } = actividad;
  const [abierta, setAbierta] = useState(null); // vistoHasta at the moment it opened, or null when closed
  const [pairId] = useState(() => { try { return localStorage.getItem('pairId') || ''; } catch { return ''; } });

  function abrir() {
    setAbierta(vistoHasta);
    verActividad();
  }

  function elegir(e) {
    const { to, state } = destinoActividad(e);
    setAbierta(null);
    navigate(to, state ? { state } : undefined);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={noLeidas ? `Avisos, ${noLeidas} sin ver` : 'Avisos'}
        className="btn btn-icono relative"
      >
        <Icon name="campana" />
        {noLeidas > 0 && <span aria-hidden="true" className="campana-punto">{insignia(noLeidas)}</span>}
      </button>
      <ActividadHoja
        isOpen={abierta !== null}
        onClose={() => setAbierta(null)}
        lista={lista}
        vistoHasta={abierta ?? vistoHasta}
        pairId={pairId}
        onElegir={elegir}
      />
    </>
  );
}
