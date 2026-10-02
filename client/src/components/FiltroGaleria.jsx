import React from 'react';
import Icon from './Icon';

export const FILTROS = [
  { id: 'todas', label: 'Todas' },
  { id: 'favoritas', label: 'Favoritas', icon: 'latido' },
  { id: 'haceUnAno', label: 'Hace un año' },
];

// Which photos the Gallery shows: the segmented control of ViewSwitcher, one size smaller so the grid keeps the room
export default function FiltroGaleria({ valor, onChange }) {
  return (
    <div role="group" aria-label="Qué fotos ver" className="grid grid-cols-3 h-11 p-1 rounded-full bg-sunk">
      {FILTROS.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={valor === f.id}
          onClick={() => onChange(f.id)}
          className={`min-w-0 flex items-center justify-center gap-1 rounded-full text-[14px] font-semibold transition-colors ${
            valor === f.id ? 'bg-raised text-ink shadow-carta' : 'text-ink-2'
          }`}
        >
          {f.icon && <Icon name={f.icon} size={15} filled={valor === f.id} className={valor === f.id ? 'text-accent-ink' : ''} />}
          <span className="truncate">{f.label}</span>
        </button>
      ))}
    </div>
  );
}
