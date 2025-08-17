import React from 'react';

export default function CoinIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      {/* Outer coin rim */}
      <circle cx="12" cy="12" r="9" />
      {/* Inner rim */}
      <circle cx="12" cy="12" r="6.5" />
      {/* Sparkle lines to feel flashy */}
      <path strokeLinecap="round" d="M12 2.5v2.5M12 19v2.5M21.5 12h-2.5M5 12H2.5" />
    </svg>
  );
}
