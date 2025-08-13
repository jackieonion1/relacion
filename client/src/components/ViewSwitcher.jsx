import React from 'react';

export default function ViewSwitcher({ views, activeView, onChange }) {
  return (
    <div className="bg-gray-200 p-1 rounded-lg flex items-center justify-center space-x-1">
      {views.map((view) => (
        <button
          key={view}
          onClick={() => onChange(view)}
          className={`w-full text-center px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${
            activeView === view
              ? 'bg-white text-gray-800 shadow-sm'
              : 'bg-transparent text-gray-600 hover:bg-gray-300/50'
          }`}
        >
          {view}
        </button>
      ))}
    </div>
  );
}
