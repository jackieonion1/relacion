import React, { useState } from 'react';

export default function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center py-4 text-left font-medium text-gray-800"
      >
        <span>{title}</span>
        <span className={`transform transition-transform duration-200 text-rose-500 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="pb-4 animate-fade-in-fast">
          {children}
        </div>
      )}
    </div>
  );
}
