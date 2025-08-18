import React from 'react';

export default function MusicIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zM19.5 16.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19.5V6l10.5-2.25v12.75" />
    </svg>
  );
}
