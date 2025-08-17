import React from 'react';

export default function RouletteIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      {/* Outer wheel */}
      <circle cx="12" cy="12" r="9" />
      {/* Inner hub */}
      <circle cx="12" cy="12" r="2.25" />
      {/* Spokes */}
      <line x1="12" y1="3" x2="12" y2="9.5" />
      <line x1="12" y1="14.5" x2="12" y2="21" />
      <line x1="3" y1="12" x2="9.5" y2="12" />
      <line x1="14.5" y1="12" x2="21" y2="12" />
      {/* Diagonal spokes for more roulette feel */}
      <line x1="6.1" y1="6.1" x2="9.9" y2="9.9" />
      <line x1="14.1" y1="14.1" x2="17.9" y2="17.9" />
      <line x1="17.9" y1="6.1" x2="14.1" y2="9.9" />
      <line x1="9.9" y1="14.1" x2="6.1" y2="17.9" />
      {/* Top marker (triangle) */}
      <path d="M12 1.75 l1.75 2.75 h-3.5 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
