import React from 'react';
import Icon from './Icon';

// The selection mode's bar (3.1): ink, floating over the tab bar like the notices, with what can be done to the
// selected photos: their date, an album, our favourite. With none selected it only says how to pick them
export default function SeleccionBarra({ n, favOn, ocupado, onFecha, onAlbum, onFav }) {
  const nada = n === 0 || ocupado;
  return (
    <div className="seleccion-barra" role="toolbar" aria-label="Fotos seleccionadas">
      <span className="flex-1 min-w-0 pl-1.5 text-[15px] font-semibold truncate" aria-live="polite">
        {n === 0 ? 'Toca las fotos' : n === 1 ? '1 foto' : `${n} fotos`}
      </span>
      <button type="button" className="seleccion-accion" disabled={nada} onClick={onFecha}>Fecha</button>
      <button type="button" className="seleccion-accion" disabled={nada} onClick={onAlbum}>Álbum</button>
      <button
        type="button"
        className="seleccion-accion seleccion-icono"
        disabled={nada}
        onClick={onFav}
        aria-pressed={favOn}
        aria-label="Favoritas"
        title="Favoritas"
      >
        <Icon name="latido" filled={favOn} size={22} />
      </button>
    </div>
  );
}
