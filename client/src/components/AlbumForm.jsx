import React, { useState } from 'react';
import Button from './Button';
import Field from './Field';

// Emojis an album can wear: the ones of the two of them first, then the usual ones of a trip
const EMOJIS = ['🩷', '💛', '💜', '🍪', '🫒', '✈️', '🏖️', '🏔️', '🌃', '🎂'];

// Content of a sheet to name an album and choose its emoji (new or renamed). `onGuardar({ titulo, emoji })` may be
// async, and the caller closes the sheet when it resolves; `onCancelar` is the Cancelar button. With `onBorrar` the
// sheet also offers to delete the album (the caller asks first)
export default function AlbumForm({ encabezado, inicial = { titulo: '', emoji: '🩷' }, onGuardar, onCancelar, onBorrar = null }) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [emoji, setEmoji] = useState(inicial.emoji);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function enviar(e) {
    e.preventDefault();
    if (!titulo.trim()) { setError('Ponle un nombre al álbum.'); return; }
    setGuardando(true);
    try {
      await onGuardar({ titulo: titulo.trim(), emoji });
    } catch {
      setError('No se ha podido guardar. Inténtalo de nuevo.');
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3.5 px-5 pt-2 pb-[34px]">
      <div className="flex items-center justify-between">
        <Button variant="txt" onClick={onCancelar} className="px-1 text-base text-ink-2">Cancelar</Button>
        <h2 className="text-base font-semibold">{encabezado}</h2>
        <Button type="submit" busy={guardando} busyText="Guardando…">Guardar</Button>
      </div>
      <Field
        label="Nombre" value={titulo} maxLength={60} placeholder="Roma, nuestro finde, la boda…" className="text-[17px]"
        error={error || undefined}
        onChange={(e) => { setTitulo(e.target.value); setError(''); }}
      />
      <div className="flex flex-col gap-1.5">
        <span className="etiqueta" id="album-emoji">Icono</span>
        <div role="group" aria-labelledby="album-emoji" className="flex flex-wrap gap-2">
          {EMOJIS.map((x) => (
            <button key={x} type="button" className="emoji-opcion" aria-pressed={x === emoji} aria-label={x} onClick={() => setEmoji(x)}>{x}</button>
          ))}
        </div>
      </div>
      {onBorrar && <Button variant="txt" icon="borrar" onClick={onBorrar} className="self-start text-danger">Borrar álbum</Button>}
    </form>
  );
}
