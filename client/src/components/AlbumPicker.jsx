import React, { useEffect, useState } from 'react';
import Button from './Button';
import Icon from './Icon';
import Sheet from './Sheet';
import AlbumForm from './AlbumForm';
import { asignarAlbum, combinarAlbumes, crearAlbum, listarAlbumes, listarEncuentros } from '../lib/albumes';
import { rangoTexto } from '../lib/recuerdos';

// Trips listed besides the albums made by hand: the latest ones, the older ones are a scroll away in /recuerdos/albumes
const MAX_VIAJES = 20;
const pl = (n, uno, varios) => (n === 1 ? uno : varios);

// The «Añadir a álbum» sheet of the Gallery, open while it is mounted. <AlbumPicker pairId ids onDone />: `ids` are
// the photos selected. It lists the albums (the ones made by hand, then the trips of the calendar) plus «Nuevo
// álbum»; the photo writes are queued, not waited for, so offline works too. It calls `onDone({ album, n })` when
// the photos are in the album, or `onDone(null)` when it was closed without choosing one
export default function AlbumPicker({ pairId, ids = [], onDone }) {
  const [abierto, setAbierto] = useState(true);
  const [estado, setEstado] = useState({ fase: 'carga' }); // carga | lista | error
  const [nuevo, setNuevo] = useState(false);
  const [eligiendo, setEligiendo] = useState(null); // id of the album being filled, while its write is queued
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setEstado({ fase: 'carga' });
    Promise.all([listarAlbumes(pairId), listarEncuentros(pairId)])
      .then(([docs, eventos]) => {
        if (cancelado) return;
        const { manuales, viajes } = combinarAlbumes(docs, eventos);
        setEstado({ fase: 'lista', albumes: [...manuales, ...viajes.slice(0, MAX_VIAJES)] });
      })
      .catch(() => { if (!cancelado) setEstado({ fase: 'error' }); });
    return () => { cancelado = true; };
  }, [pairId, intento]);

  function cerrar(resultado) {
    setAbierto(false);
    onDone?.(resultado);
  }
  async function poner(album) {
    setFallo(false);
    setEligiendo(album.id);
    try {
      await asignarAlbum(pairId, album, ids);
      cerrar({ album, n: ids.length });
    } catch {
      setEligiendo(null);
      setFallo(true);
    }
  }
  async function crearYPoner({ titulo, emoji }) {
    const { album } = await crearAlbum(pairId, { titulo, emoji }, localStorage.getItem('identity') || 'yo');
    await asignarAlbum(pairId, album, ids);
    cerrar({ album, n: ids.length });
  }

  const n = ids.length;
  return (
    <Sheet isOpen={abierto} onClose={() => cerrar(null)}>
      {nuevo ? (
        <AlbumForm encabezado="Nuevo álbum" onGuardar={crearYPoner} onCancelar={() => setNuevo(false)} />
      ) : (
        <div className="px-5 pt-2 pb-[26px]">
          <div className="flex items-center justify-between gap-2 pb-2">
            <h2 className="serif text-[24px] leading-[1.15] font-normal">Añadir {n} {pl(n, 'foto', 'fotos')} a…</h2>
            <Button icon="cerrar" label="Cerrar" onClick={() => cerrar(null)} className="-mr-2.5 text-ink-2" />
          </div>
          <button type="button" className="picker-fila" onClick={() => setNuevo(true)} disabled={!!eligiendo}>
            <span aria-hidden="true" className="picker-emoji"><Icon name="nuevo" size={22} className="text-accent-ink" /></span>
            <span className="text-base font-semibold text-accent-ink">Nuevo álbum</span>
          </button>
          {estado.fase === 'carga' && <p role="status" className="py-4 text-[15px] text-ink-2">Buscando vuestros álbumes…</p>}
          {estado.fase === 'error' && (
            <div className="flex flex-col items-start gap-2 py-3">
              <p className="text-[15px] text-ink-2">No hemos podido cargar los álbumes. Puedes crear uno nuevo igualmente.</p>
              <button type="button" className="btn btn-sec" onClick={() => setIntento((k) => k + 1)}>Reintentar</button>
            </div>
          )}
          {estado.fase === 'lista' && estado.albumes.map((a) => (
            <button key={a.id} type="button" className="picker-fila" onClick={() => poner(a)} disabled={!!eligiendo}>
              <span aria-hidden="true" className="picker-emoji">{a.emoji}</span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-base font-semibold text-ink truncate">{a.titulo}</span>
                {a.start != null && <span className="num text-[13px] text-ink-2">{rangoTexto(a.start, a.end)}</span>}
              </span>
              {eligiendo === a.id && <span className="text-[13px] text-ink-2">Añadiendo…</span>}
            </button>
          ))}
          {estado.fase === 'lista' && !estado.albumes.length && (
            <p className="py-4 text-[15px] text-ink-2">Todavía no hay álbumes. Crea el primero 🩷</p>
          )}
          {fallo && <p role="alert" className="pt-2 text-[13px] text-danger">No se han podido añadir las fotos. Inténtalo de nuevo.</p>}
        </div>
      )}
    </Sheet>
  );
}
