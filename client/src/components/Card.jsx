import React from 'react';

// Carta card: card surface, line border, radius 20 and the resting shadow. `as` keeps the right element (li, section…)
export default function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`card ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
