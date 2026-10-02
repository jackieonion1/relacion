import React, { useEffect, useState } from 'react';
import Sheet from './Sheet';
import Button from './Button';
import Field from './Field';
import { madridDayKey } from '../lib/photos';

// «¿Cuándo fue?» for the selected photos (3.1): the day they were really taken, the date every «when» uses
// (their month, «Hace un año», albums, Nuestro año). The native date picker, which iOS has. `inicial` is their
// common day, if any; onGuardar('YYYY-MM-DD') or onGuardar(null) to take it away
export default function FechaHoja({ isOpen, onClose, n, inicial = '', puedeQuitar = false, guardando = false, onGuardar }) {
  const [dia, setDia] = useState(inicial);
  useEffect(() => { if (isOpen) setDia(inicial); }, [isOpen, inicial]);
  const hoy = madridDayKey(new Date());
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia <= hoy;
  return (
    <Sheet isOpen={isOpen} onClose={guardando ? () => {} : onClose}>
      <form
        className="flex flex-col gap-4 px-5 pt-3.5 pb-[34px]"
        onSubmit={(e) => { e.preventDefault(); if (valido && !guardando) onGuardar(dia); }}
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="serif text-2xl leading-[1.15] font-normal">¿Cuándo fue?</h2>
          <p className="text-sm text-ink-2">{n === 1 ? '1 foto' : `${n} fotos`}. El día se guarda para los dos.</p>
        </div>
        <Field
          label="Día de la foto"
          type="date"
          value={dia}
          max={hoy}
          onChange={(e) => setDia(e.target.value)}
          hint="Así salen en su mes, en «Hace un año» y en Nuestro año."
          disabled={guardando}
        />
        <div className="flex flex-col gap-1.5">
          <Button type="submit" size="l" disabled={!valido} busy={guardando} busyText="Guardando…">Poner fecha</Button>
          {puedeQuitar && (
            <Button variant="txt" size="l" disabled={guardando} onClick={() => onGuardar(null)}>Quitar la fecha</Button>
          )}
          <Button variant="txt" size="l" disabled={guardando} onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Sheet>
  );
}
