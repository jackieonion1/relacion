import React from 'react';

export default function EventTypeSwitcher({ activeType, onChange }) {
  const types = [
    { value: 'conjunto', emoji: '🩷', text: 'Conjunto', color: 'bg-rose-500' },
    { value: 'novio', emoji: '💛', text: 'Novio', color: 'bg-yellow-500' },
    { value: 'novia', emoji: '💜', text: 'Novia', color: 'bg-purple-500' }
  ];

  return (
    <div className="bg-gray-200 p-1 rounded-lg flex items-center justify-center space-x-1">
      {types.map((type) => (
        <button
          key={type.value}
          type="button"
          onClick={() => onChange(type.value)}
          className={`w-full text-center px-3 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 flex flex-col items-center leading-tight ${
            activeType === type.value
              ? 'bg-white text-gray-800 shadow-sm'
              : 'bg-transparent text-gray-600 hover:bg-gray-300/50'
          }`}
        >
          <span className="text-lg">{type.emoji}</span>
          <span className="text-[11px] mt-0.5">{type.text}</span>
        </button>
      ))}
    </div>
  );
}
