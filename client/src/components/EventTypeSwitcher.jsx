import React from 'react';
import { EVENT_TYPES } from '../lib/eventTypes';

// "De quién es": a three-way segmented control (radiogroup) that returns the stored value
export default function EventTypeSwitcher({ activeType, onChange, label = 'De quién es' }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 h-[52px] p-1 rounded-full bg-sunk">
      {EVENT_TYPES.map((type) => {
        const on = activeType === type.value;
        return (
          <button
            key={type.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(type.value)}
            className={`min-w-0 flex items-center justify-center gap-1.5 rounded-full text-[15px] font-semibold transition-colors ${
              on ? 'bg-raised text-ink shadow-carta' : 'text-ink-2'
            }`}
          >
            <span aria-hidden="true" className="leading-none">{type.emoji}</span>
            <span className="truncate">{type.text}</span>
          </button>
        );
      })}
    </div>
  );
}
