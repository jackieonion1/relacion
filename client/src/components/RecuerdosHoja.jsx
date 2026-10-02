import React from 'react';
import { Link } from 'react-router';
import Icon from './Icon';

// The frame of the screens under /recuerdos: the back arrow (to `atras`: { to, state }), the title in serif and, on
// its right, `accion` (an icon button). The 3.1 screens of this lot all wear it
export default function RecuerdosHoja({ titulo, atras = null, accion = null, children }) {
  return (
    <div className="max-w-(--breakpoint-md) mx-auto px-4 pb-6">
      {atras && (
        <Link to={atras.to} state={atras.state} aria-label="Volver" className="btn btn-icono -ml-2 mt-1">
          <Icon name="atras" />
        </Link>
      )}
      <div className="flex items-start justify-between gap-2">
        <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em] px-1 pt-1.5 pb-[18px] min-w-0 text-balance">{titulo}</h1>
        {accion}
      </div>
      {children}
    </div>
  );
}
