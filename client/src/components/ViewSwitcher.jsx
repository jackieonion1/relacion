import React from 'react';

// Segmented control. `labels` renames what is shown without touching the values the page keeps
export default function ViewSwitcher({ views, activeView, onChange, labels = {} }) {
  return (
    <div className="grid h-[52px] p-1 rounded-full bg-sunk" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}>
      {views.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={activeView === view}
          onClick={() => onChange(view)}
          className={`min-w-0 rounded-full text-[15px] font-semibold transition-colors ${
            activeView === view ? 'bg-card text-ink shadow-carta' : 'text-ink-2'
          }`}
        >
          {labels[view] || view}
        </button>
      ))}
    </div>
  );
}
