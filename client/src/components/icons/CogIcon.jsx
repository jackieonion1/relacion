import React from 'react';

export default function CogIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* Outer ring */}
        <circle cx="12" cy="12" r="7.5" />
        {/* Inner hub */}
        <circle cx="12" cy="12" r="3.25" />
        {/* Teeth (8 directions) */}
        <path d="M12 2.25v2.5" />
        <path d="M12 19.25v2.5" />
        <path d="M2.25 12h2.5" />
        <path d="M19.25 12h2.5" />
        <path d="M5 5l1.77 1.77" />
        <path d="M17.23 17.23L19 19" />
        <path d="M19 5l-1.77 1.77" />
        <path d="M5 19l1.77-1.77" />
      </g>
    </svg>
  );
}
