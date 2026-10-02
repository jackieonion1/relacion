import React from 'react';
import Icon from './Icon';
import { MONTHS } from '../lib/eventText';
import { REACCIONES, WHO } from '../lib/fotoCampos';

// Translucent white over the always-dark viewer (VIEWER_BG in Gallery.jsx), as its other round buttons
const VELO = 'oklch(1 0 0 / 0.12)';
const VELO_ON = 'oklch(1 0 0 / 0.28)';

// «12 mar 2025», como el pie del visor del lienzo
export function photoDate(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

// The viewer's footer (3.1): the reactions of the two and, when given, favourite and comments over the old line
// «La subió 🍪 · date» with Borrar. `foto` is the grid item or, live, the photo doc (escucharFoto); without it
// (a photo still only on this phone) there is nothing to react to yet. Clicks stop here: on the Modal's
// background they would close the viewer
export default function VisorPie({
  foto, identity, deleteError, deleting, onDelete,
  onReact, onFav, comentarios, onComments,
}) {
  const who = foto ? WHO[foto.identity] : undefined;
  const other = identity === 'yo' ? 'ella' : 'yo';
  const mine = foto?.reactions?.[identity];
  const theirs = foto?.reactions?.[other];
  const fav = !!foto?.favBy?.includes(identity);
  return (
    <div
      className="absolute left-4 right-2 flex flex-col gap-2.5"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {foto && onReact && (
        <div className="flex items-center gap-1.5 -ml-1.5">
          <div role="group" aria-label="Reacciones" className="flex items-center gap-1">
            {REACCIONES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onReact(mine === r ? null : r)}
                aria-pressed={mine === r}
                aria-label={theirs === r ? `${r}, también ${WHO[other]}` : r}
                className="relative w-11 h-11 rounded-full flex items-center justify-center text-[22px] leading-none active:scale-90 transition-transform"
                style={{ background: mine === r ? VELO_ON : 'transparent', boxShadow: mine === r ? 'inset 0 0 0 1.5px oklch(1 0 0 / 0.55)' : 'none' }}
              >
                <span aria-hidden="true">{r}</span>
                {/* The other's choice: their emoji, small, on the corner of the one they picked */}
                {theirs === r && (
                  <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] leading-none" style={{ background: 'oklch(0.3 0.01 30)' }}>{WHO[other]}</span>
                )}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {onFav && (
            <button
              type="button"
              onClick={onFav}
              aria-pressed={fav}
              aria-label="Favorita"
              title="Favorita"
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: VELO, color: fav ? 'var(--lacre)' : undefined }}
            >
              <Icon name="latido" filled={fav} size={22} />
            </button>
          )}
          {onComments && (
            <button
              type="button"
              onClick={onComments}
              aria-haspopup="dialog"
              aria-label={comentarios?.n ? `Comentarios: ${comentarios.n}${comentarios.unread ? ', sin leer' : ''}` : 'Comentar'}
              className="relative h-11 min-w-11 px-3 rounded-full flex items-center justify-center gap-1.5 text-[15px] font-semibold active:scale-95 transition-transform"
              style={{ background: VELO }}
            >
              <Icon name="notas" size={20} />
              {comentarios?.n > 0 && <span className="num" aria-hidden="true">{comentarios.n}</span>}
              {comentarios?.unread && <span aria-hidden="true" className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-lacre" />}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        {deleteError ? (
          <span role="alert" className="flex-1 min-w-0 text-[15px] font-semibold">No se pudo borrar la foto.</span>
        ) : who ? (
          <>
            <span aria-hidden="true" className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[15px] leading-none shrink-0" style={{ background: VELO }}>{who}</span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[15px] font-semibold">La subió {who}</span>
              <FotoFechas foto={foto} />
            </span>
          </>
        ) : foto?.takenAt != null ? (
          <span className="flex-1 min-w-0 flex flex-col"><FotoFechas foto={foto} /></span>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Borrar foto"
          title="Borrar foto"
          className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Icon name="borrar" />
        </button>
      </div>
    </div>
  );
}

// The upload date, or, once someone has dated it by hand, the day it was taken with the upload one after (R3)
function FotoFechas({ foto }) {
  if (foto.takenAt == null) return <span className="text-[13px] opacity-75">{photoDate(foto.createdAt || 0)}</span>;
  return (
    <span className="text-[13px] opacity-75">Foto del {photoDate(foto.takenAt)} · subida el {photoDate(foto.createdAt || 0)}</span>
  );
}
