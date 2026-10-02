import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import Button from '../components/Button';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import AlbumForm from '../components/AlbumForm';
import RecuerdosHoja from '../components/RecuerdosHoja';
import { useVisible } from '../components/FotosMosaico';
import { combinarAlbumes, crearAlbum, listarAlbumes, listarEncuentros, portadaDeAlbum } from '../lib/albumes';
import { rangoTexto } from '../lib/recuerdos';

// The dates under an album that has them
const fechas = (a) => (a.start != null ? rangoTexto(a.start, a.end) : '');

// A card with its cover: the first photo of the album, asked for when the card comes near the screen. An album with
// no photo yet is an empty polaroid (a dotted frame, no picture) that says so; if the look fails it stays the usual card
function AlbumTarjeta({ a, pairId }) {
  const [ref, visible] = useVisible();
  const [portada, setPortada] = useState(undefined); // undefined while it loads, '' when the album has no photo, null when it could not be read
  useEffect(() => {
    if (!visible || !pairId) return undefined;
    let cancelado = false;
    portadaDeAlbum(pairId, a).then((u) => { if (!cancelado) setPortada(u); }).catch(() => { if (!cancelado) setPortada(null); });
    return () => { cancelado = true; };
  }, [visible, pairId, a]);
  const vacia = portada === '';

  return (
    <li>
      <Link ref={ref} to={`/recuerdos/albumes/${encodeURIComponent(a.id)}`} state={{ volver: '/recuerdos/albumes' }} className={`album-tarjeta${vacia ? ' vacia' : ''}`}>
        <span className="album-portada">
          {portada ? <img src={portada} alt="" loading="lazy" /> : portada === undefined && pairId && visible
            ? <span className="recuerdo-hueco" /> : <span aria-hidden="true">{a.emoji}</span>}
          {portada && <span aria-hidden="true" className="album-emoji-chip">{a.emoji}</span>}
        </span>
        <span className="flex flex-col gap-0.5 px-1">
          <span className="serif text-[19px] leading-[1.15] text-ink line-clamp-2 break-words">{a.titulo}</span>
          {fechas(a) && <span className="num text-[13px] text-ink-2">{fechas(a)}</span>}
          {vacia && <span className="text-[13px] text-ink-2">Sin fotos todavía</span>}
        </span>
      </Link>
    </li>
  );
}

function Cuadricula({ titulo, albumes, pairId }) {
  return (
    <section aria-label={titulo} className="mb-7">
      <h2 className="etiqueta px-1 pb-3">{titulo}</h2>
      <ul className="grid grid-cols-2 gap-x-3.5 gap-y-5">
        {albumes.map((a) => <AlbumTarjeta key={a.id} a={a} pairId={pairId} />)}
      </ul>
    </section>
  );
}

// The albums: the trips that come from the «nos vemos» of the calendar (no work needed), the ones made by hand and,
// folded, the one-day encounters
export default function Albumes() {
  const location = useLocation();
  const navigate = useNavigate();
  const pairId = localStorage.getItem('pairId') || '';
  const [estado, setEstado] = useState({ fase: 'carga' }); // carga | lista | error
  const [intento, setIntento] = useState(0);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    if (!pairId) { setEstado({ fase: 'lista', manuales: [], viajes: [], cortos: [] }); return undefined; }
    let cancelado = false;
    setEstado({ fase: 'carga' });
    Promise.all([listarAlbumes(pairId), listarEncuentros(pairId)])
      .then(([docs, eventos]) => { if (!cancelado) setEstado({ fase: 'lista', ...combinarAlbumes(docs, eventos) }); })
      .catch(() => { if (!cancelado) setEstado({ fase: 'error' }); });
    return () => { cancelado = true; };
  }, [pairId, intento]);

  async function crear({ titulo, emoji }) {
    const { album } = await crearAlbum(pairId, { titulo, emoji }, localStorage.getItem('identity') || 'yo');
    navigate(`/recuerdos/albumes/${encodeURIComponent(album.id)}`, { state: { volver: '/recuerdos/albumes' } });
  }

  const { manuales = [], viajes = [], cortos = [] } = estado;
  const vacio = estado.fase === 'lista' && !manuales.length && !viajes.length && !cortos.length;

  return (
    <RecuerdosHoja
      titulo="Álbumes"
      atras={{ to: location.state?.volver || '/recuerdos' }}
      accion={<Button size="m" variant="sec" icon="nuevo" onClick={() => setNuevo(true)} className="mt-2 shrink-0">Nuevo</Button>}
    >
      {estado.fase === 'carga' && (
        <div role="status" aria-label="Cargando álbumes" className="grid grid-cols-2 gap-x-3.5 gap-y-5">
          {[0, 1, 2, 3].map((i) => <span key={i} className="relative block aspect-square rounded-tarjeta overflow-hidden"><span className="recuerdo-hueco" /></span>)}
        </div>
      )}
      {estado.fase === 'error' && (
        <section aria-label="Sin conexión" className="p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-3">
          <p className="serif text-[18px] leading-[1.35] text-ink-2">No hemos podido cargar los álbumes. Hace falta conexión.</p>
          <button type="button" className="btn btn-sec" onClick={() => setIntento((k) => k + 1)}>Reintentar</button>
        </section>
      )}
      {vacio && (
        <section aria-label="Sin álbumes" className="p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-1.5">
          <h2 className="etiqueta">Todavía no</h2>
          <p className="serif text-[18px] leading-[1.35] text-ink-2">Aquí aparecerán vuestros viajes, los «nos vemos» del calendario de más de un día, y los álbumes que hagáis a mano 🩷</p>
        </section>
      )}
      {viajes.length > 0 && <Cuadricula titulo="Viajes" albumes={viajes} pairId={pairId} />}
      {manuales.length > 0 && <Cuadricula titulo="Vuestros álbumes" albumes={manuales} pairId={pairId} />}
      {cortos.length > 0 && (
        <details className="mb-7">
          <summary className="etiqueta px-1 py-3 cursor-pointer">Más encuentros ({cortos.length})</summary>
          <ul>
            {cortos.map((a) => (
              <li key={a.id}>
                <Link to={`/recuerdos/albumes/${encodeURIComponent(a.id)}`} state={{ volver: '/recuerdos/albumes' }} className="album-fila">
                  <span aria-hidden="true" className="picker-emoji">{a.emoji}</span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-base font-semibold text-ink truncate">{a.titulo}</span>
                    <span className="num text-[13px] text-ink-2">{fechas(a)}</span>
                  </span>
                  <Icon name="siguiente" size={20} className="text-ink-2" />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Sheet isOpen={nuevo} onClose={() => setNuevo(false)}>
        <AlbumForm encabezado="Nuevo álbum" onGuardar={crear} onCancelar={() => setNuevo(false)} />
      </Sheet>
    </RecuerdosHoja>
  );
}
