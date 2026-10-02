import React, { useId, useState } from 'react';
import Icon from './Icon';

// Folding section with a small caps title ("Próximos · 5") and its chevron
export default function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="flex flex-col">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 flex items-center justify-between px-1 text-left"
      >
        <span className="etiqueta">{title}</span>
        <span className={`text-ink-2 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <Icon name="abajo" size={20} />
        </span>
      </button>
      {isOpen && (
        <div id={panelId} className="pb-1.5">
          {children}
        </div>
      )}
    </section>
  );
}
