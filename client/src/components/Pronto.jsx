import React from 'react';
import { Link } from 'react-router';
import Icon from './Icon';

// Placeholder of the 3.1 skeleton: a quiet «Pronto» page for a route whose screen is not built yet. Each lot replaces
// the stub that uses it, and Pronto goes when the last one does
export default function Pronto({ titulo, texto = 'Se está preparando.', atras = null }) {
  return (
    <div className="max-w-(--breakpoint-md) mx-auto px-4 pb-6">
      {atras && (
        <Link to={atras} aria-label="Volver" className="btn btn-icono -ml-2 mt-1">
          <Icon name="atras" />
        </Link>
      )}
      <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em] px-1 pt-1.5 pb-[18px]">{titulo}</h1>
      <section aria-label="Pronto" className="mt-2.5 p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-1.5">
        <h2 className="etiqueta">Pronto</h2>
        <p className="serif text-[18px] leading-[1.35] text-ink-2">{texto}</p>
      </section>
    </div>
  );
}
