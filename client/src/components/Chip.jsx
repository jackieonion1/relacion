import React from 'react';

const TONES = { acento: '', neutro: 'chip-neutro', tinta: 'chip-tinta' };

// Small label: acento (lacre-soft, the usual rose), neutro (sunk) or tinta (ink, e.g. "Sin subir")
export default function Chip({ tone = 'acento', className = '', children, ...rest }) {
  return (
    <span className={['chip', TONES[tone], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}
