import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import Button from '../components/Button';
import Sheet from '../components/Sheet';
import AlbumForm from '../components/AlbumForm';
import RecuerdosHoja from '../components/RecuerdosHoja';
import FotosMosaico, { useFotosDe } from '../components/FotosMosaico';
import { borrarAlbum, fotosDeAlbum, guardarAlbum, leerAlbum, quitarDeAlbum } from '../lib/albumes';
import { rangoTexto } from '../lib/recuerdos';

// Thumbs asked for at once: the rest of a long album are fetched as they come near the screen
const MINIATURAS = 36;
const pl = (n, uno, varios) => (n === 1 ? uno : varios);

// The photos of an album, oldest first, with the way to take some out
function Fotos({ album, pairId, volver, alCambiar }) {
  const navigate = useNavigate();
  const f = useFotosDe(
    (poner) => fotosDeAlbum(pairId, album, { onThumb: poner, max: MINIATURAS }),
    [pairId, album.id],
  );
  const [seleccion, setSeleccion] = useState(null); // null, or the Set of the ones chosen to take out
  const [quitando, setQuitando] = useState(false);

  async function quitar() {
    setQuitando(true);
    try {
      await quitarDeAlbum(pairId, album, [...seleccion], localStorage.getItem('identity') || 'yo');
      setSeleccion(null);
      alCambiar();
    } catch {
      setQuitando(false);
    }
  }
  const tocar = (foto) => {
    if (!seleccion) { navigate(`/gallery?photo=${encodeURIComponent(foto.id)}`, { state: { volver } }); return; }
    setSeleccion((s) => { const n = new Set(s); if (n.has(foto.id)) n.delete(foto.id); else n.add(foto.id); return n; });
  };

  if (f.fase === 'carga') return <div role="status" aria-label="Cargando fotos" className="relative aspect-3/1 rounded-tarjeta overflow-hidden"><span className="recuerdo-hueco" /></div>;
  if (f.fase === 'error') {
    return (
      <section aria-label="Sin conexión" className="p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-3">
        <p className="serif text-[18px] leading-[1.35] text-ink-2">No hemos podido cargar las fotos. Hace falta conexión.</p>
        <button type="button" className="btn btn-sec" onClick={f.reintentar}>Reintentar</button>
      </section>
    );
  }
  if (!f.fotos.length) {
    return (
      <section aria-label="Sin fotos" className="p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-3">
        <h2 className="etiqueta">Sin fotos</h2>
        <p className="serif text-[18px] leading-[1.35] text-ink-2">
          Todavía no hay fotos aquí. En la galería, pulsa «Seleccionar», elige las que sean y toca «Álbum» 🩷
        </p>
        <Button size="m" variant="sec" icon="galeria" onClick={() => navigate('/gallery')}>Ir a la galería</Button>
      </section>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1 pb-3 -mt-2">
        <p className="num text-[14px] text-ink-2">{f.fotos.length} {pl(f.fotos.length, 'foto', 'fotos')}</p>
        {seleccion
          ? <Button variant="txt" onClick={() => setSeleccion(null)} className="text-ink-2">Cancelar</Button>
          : <Button variant="txt" accent onClick={() => setSeleccion(new Set())}>Elegir</Button>}
      </div>
      <div className="-mx-4">
        <FotosMosaico fotos={f.fotos} urls={f.urls} listo={f.listo} pairId={pairId} poner={f.poner} onTocar={tocar} seleccion={seleccion} label={`Fotos de ${album.titulo}`} />
      </div>
      {seleccion && (
        <div className="sticky bottom-3 flex justify-center pt-4">
          <Button variant="dan" size="m" icon="borrar" disabled={!seleccion.size} busy={quitando} busyText="Quitando…" onClick={quitar}>
            {seleccion.size ? `Quitar del álbum (${seleccion.size})` : 'Elige las que quitar'}
          </Button>
        </div>
      )}
    </>
  );
}

// One album: its photos, rename, and delete when it was made by hand. Taking a photo out never deletes it
export default function Album() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pairId = localStorage.getItem('pairId') || '';
  const [estado, setEstado] = useState({ fase: 'carga', album: null }); // carga | lista | falta | error
  const [intento, setIntento] = useState(0);
  const [hoja, setHoja] = useState(null); // null | 'editar' | 'borrar'
  const identity = localStorage.getItem('identity') || 'yo';
  const atras = { to: location.state?.volver || '/recuerdos/albumes' };

  useEffect(() => {
    let cancelado = false;
    setEstado((e) => ({ fase: e.album ? 'lista' : 'carga', album: e.album }));
    leerAlbum(pairId, id)
      .then((album) => { if (!cancelado) setEstado({ fase: album ? 'lista' : 'falta', album }); })
      .catch(() => { if (!cancelado) setEstado({ fase: 'error', album: null }); });
    return () => { cancelado = true; };
  }, [pairId, id, intento]);

  const { album, fase } = estado;

  if (fase === 'falta' || fase === 'error') {
    return (
      <RecuerdosHoja titulo="Álbum" atras={atras}>
        <section aria-label={fase === 'falta' ? 'No existe' : 'Sin conexión'} className="p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-3">
          <p className="serif text-[18px] leading-[1.35] text-ink-2">
            {fase === 'falta' ? 'Este álbum ya no existe.' : 'No hemos podido abrir el álbum. Hace falta conexión.'}
          </p>
          {fase === 'falta'
            ? <Link to="/recuerdos/albumes" className="btn btn-sec">Ver los álbumes</Link>
            : <button type="button" className="btn btn-sec" onClick={() => setIntento((k) => k + 1)}>Reintentar</button>}
        </section>
      </RecuerdosHoja>
    );
  }
  if (!album) {
    return (
      <RecuerdosHoja titulo=" " atras={atras}>
        <div role="status" aria-label="Cargando álbum" className="relative aspect-3/1 rounded-tarjeta overflow-hidden"><span className="recuerdo-hueco" /></div>
      </RecuerdosHoja>
    );
  }

  async function guardar(valores) {
    const r = await guardarAlbum(pairId, album, valores, identity);
    setEstado({ fase: 'lista', album: r.album });
    setHoja(null);
  }
  async function borrar() {
    await borrarAlbum(pairId, album);
    navigate('/recuerdos/albumes', { replace: true });
  }

  return (
    <RecuerdosHoja
      titulo={`${album.emoji} ${album.titulo}`}
      atras={atras}
      accion={<Button icon="editar" label="Editar álbum" onClick={() => setHoja('editar')} className="mt-2 shrink-0" />}
    >
      {album.start != null && <p className="num text-[15px] text-ink-2 px-1 -mt-3 pb-4">{rangoTexto(album.start, album.end)}</p>}
      <Fotos key={`${album.id}:${intento}`} album={album} pairId={pairId} volver={`/recuerdos/albumes/${encodeURIComponent(album.id)}`} alCambiar={() => setIntento((k) => k + 1)} />

      <Sheet isOpen={hoja === 'editar'} onClose={() => setHoja(null)}>
        <AlbumForm
          encabezado="Editar álbum" inicial={{ titulo: album.titulo, emoji: album.emoji }}
          onGuardar={guardar} onCancelar={() => setHoja(null)}
          onBorrar={album.tipo === 'manual' ? () => setHoja('borrar') : null}
        />
      </Sheet>
      <Sheet isOpen={hoja === 'borrar'} onClose={() => setHoja(null)}>
        <div className="flex flex-col gap-3 px-5 pt-3 pb-[34px]">
          <h2 className="serif text-[26px] leading-[1.15] font-normal">¿Borrar «{album.titulo}»?</h2>
          <p className="text-[15px] text-ink-2">Las fotos se quedan en la galería; solo desaparece el álbum.</p>
          <Button variant="dan" size="l" icon="borrar" onClick={borrar}>Borrar álbum</Button>
          <Button variant="sec" size="l" onClick={() => setHoja('editar')}>Mejor no</Button>
        </div>
      </Sheet>
    </RecuerdosHoja>
  );
}
