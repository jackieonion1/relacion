import React from 'react';
import Sheet from './Sheet';
import Button from './Button';
import Icon from './Icon';
import { MONTHS } from '../lib/eventText';
import { mesesEntre } from '../lib/fotoConsultas';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// «Ir a un mes» (3.1): every month from the first photo to today, by year, the newest on top. It goes by the day the
// photo was taken (F1), so a month of photos uploaded all at once later is still its own month once they are dated.
// `desde` is the earliest effective date (null while it loads); `actual` the month on screen, if any
export default function SaltarMes({ isOpen, onClose, desde, error, actual, onElegir }) {
  const anos = desde != null ? mesesEntre(desde, Date.now()) : [];
  return (
    <Sheet isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4 px-5 pt-3.5 pb-[34px]">
        <div className="flex flex-col gap-0.5">
          <h2 className="serif text-2xl leading-[1.15] font-normal">Ir a un mes</h2>
          <p className="text-sm text-ink-2 text-pretty">Por el día de la foto; si no lo tiene, por el día en que se subió.</p>
        </div>
        {error ? (
          <p role="alert" className="text-[15px] text-ink-2">No se pudo saber desde cuándo hay fotos. Inténtalo de nuevo.</p>
        ) : desde == null ? (
          <p role="status" className="text-[15px] text-ink-2">Cargando…</p>
        ) : anos.map(({ y, meses }) => (
          <section key={y} className="flex flex-col gap-2">
            <h3 className="etiqueta">{y}</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {MONTHS.map((nombre, m) => {
                const on = actual && actual.y === y && actual.m === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!meses.includes(m)}
                    aria-pressed={on || undefined}
                    aria-label={`${cap(nombre)} ${y}`}
                    onClick={() => onElegir(y, m)}
                    className={`h-11 rounded-control text-[15px] font-semibold transition-transform active:scale-95 disabled:opacity-30 disabled:active:scale-100 ${
                      on ? 'bg-lacre text-on-lacre' : 'bg-sunk text-ink'
                    }`}
                  >
                    {cap(nombre.slice(0, 3))}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <Button variant="txt" size="l" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  );
}

// Over the grid while a month is open: back to every photo, or another month
export function MesBarra({ onTodas, onOtro }) {
  return (
    <div className="flex items-center justify-between gap-2 -ml-2">
      <button
        type="button"
        onClick={onTodas}
        className="flex items-center gap-0.5 h-11 pl-1 pr-3 rounded-control text-base font-semibold text-accent-ink active:bg-sunk"
      >
        <Icon name="atras" />Todas
      </button>
      <Button variant="sec" onClick={onOtro}>Otro mes</Button>
    </div>
  );
}
