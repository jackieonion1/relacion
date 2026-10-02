import React, { useRef, useState } from 'react';
import { Link } from 'react-router';
import Icon from '../components/Icon';
import { usePrefersReducedMotion } from '../lib/motion';
import inicio from '../assets/asi-era/inicio.webp';
import fotoDia from '../assets/asi-era/inicio2.webp';
import galeria from '../assets/asi-era/galeria.webp';
import calendario from '../assets/asi-era/calendario.webp';
import lluvia from '../assets/asi-era/lluvia.webp';
import notas from '../assets/asi-era/notas.webp';
import mapa from '../assets/asi-era/mapa.webp';
import musica from '../assets/asi-era/musica.webp';
import ruleta from '../assets/asi-era/ruleta.webp';
import moneda from '../assets/asi-era/moneda.webp';
import ajustes from '../assets/asi-era/ajustes.webp';

// «Así era» (3.0): the 2.5.1 app as it was on its last day, kept as an album and a letter. The screenshots were taken
// with demo data on the test pair; their styles live in AsiEra.css, imported from App.jsx (see there why)
export const FOTOS = [
  { src: inicio, titulo: 'Inicio', pie: 'Los días juntos, en grande y en rosa.' },
  { src: fotoDia, titulo: 'La foto del día', pie: 'Cada mañana, una de las nuestras.' },
  { src: galeria, titulo: 'Galería', pie: 'Todas las fotos, en cuadritos.' },
  { src: calendario, titulo: 'Calendario', pie: 'Una rayita de color por cada plan.' },
  { src: lluvia, titulo: 'Los días 24', pie: 'Lluvia de corazones por el mesiversario.' },
  { src: notas, titulo: 'Notas', pie: 'Notitas de 🍪 y de 🫒.' },
  { src: mapa, titulo: 'Mapa', pie: 'La distancia, al kilómetro.' },
  { src: musica, titulo: 'Música', pie: 'Nuestras canciones, siempre a mano.' },
  { src: ruleta, titulo: 'Ruleta', pie: 'Para cuando ninguno quería elegir la cena.' },
  { src: moneda, titulo: 'Moneda', pie: 'Cara o cruz, con galleta.' },
  { src: ajustes, titulo: 'Ajustes', pie: 'Donde vivía el código de pareja.' },
];

// The dates come from the repository history (git log): 1.0 to 2.0 in August 2025, 2.2 to 2.5 in the 2026 tune-up
const HISTORIA = [
  { version: '1.0', fecha: '13 ago 2025', texto: 'Nació, con Inicio, Galería, Calendario y Mapa.' },
  { version: '1.3', fecha: '13 ago 2025', texto: 'Ese mismo día llegaron las notas.' },
  { version: '1.6', fecha: '14 ago 2025', texto: 'Los primeros avisos en el móvil.' },
  { version: '1.8', fecha: '17 ago 2025', texto: 'Ruleta y moneda, para decidir sin discutir.' },
  { version: '1.9', fecha: '18 ago 2025', texto: 'Empezó a sonar la música.' },
  { version: '2.0', fecha: '20 ago 2025', texto: 'Reproductor de verdad y el tiempo de cada ciudad.' },
  { version: '2.5', fecha: 'oct 2026', texto: 'Más rápida, más fiable y con mil arreglos pequeños.' },
  { version: '3.0', fecha: '2 oct 2026', texto: 'La Carta: papel, tinta y lacre.' },
  { version: '3.1', fecha: 'oct 2026', texto: 'Recuerdos, comentarios, la cápsula del tiempo y nuestro año.', ahora: true },
];

// Postmark over each print: the version and the day it was photographed, its last one
function Matasellos() {
  return (
    <span className="matasellos" aria-hidden="true">
      <span className="num text-[15px] font-semibold leading-none">2.5.1</span>
      <span className="text-[8.5px] font-semibold tracking-[0.12em] leading-none">2·OCT·26</span>
    </span>
  );
}

function Album() {
  const pista = useRef(null);
  const [actual, setActual] = useState(0);
  const reduce = usePrefersReducedMotion();

  function onScroll() {
    const el = pista.current;
    const [a, b] = el.children;
    const paso = b ? b.offsetLeft - a.offsetLeft : el.clientWidth;
    if (!paso) return; // not laid out yet
    setActual(Math.max(0, Math.min(FOTOS.length - 1, Math.round(el.scrollLeft / paso))));
  }

  function irA(i) {
    const el = pista.current;
    const hoja = el.children[i];
    if (!hoja) return;
    el.scrollTo({ left: hoja.offsetLeft - (el.clientWidth - hoja.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  }

  return (
    <section aria-labelledby="asi-era-album" className="flex flex-col gap-3">
      <h2 id="asi-era-album" className="etiqueta px-5">El álbum</h2>
      <div
        ref={pista} onScroll={onScroll} tabIndex={0} role="region" aria-label="Fotos de la app antigua, desliza para pasar"
        className="album focus-visible:outline-2 focus-visible:outline-lacre focus-visible:-outline-offset-2"
      >
        {FOTOS.map((f, i) => (
          <figure key={f.titulo} className={`polaroid ${i % 2 ? 'polaroid-b' : 'polaroid-a'}`} aria-label={`${i + 1} de ${FOTOS.length}`}>
            <div className="relative">
              <img
                src={f.src} alt={`${f.titulo} en la app antigua`} width={720} height={1561}
                loading={i < 2 ? 'eager' : 'lazy'} decoding="async" draggable={false}
                className="block w-full h-auto rounded-[14px] border border-line"
              />
              <Matasellos />
            </div>
            <figcaption className="pt-3 px-1 flex flex-col gap-0.5">
              <span className="serif text-[21px] leading-[1.15]">{f.titulo}</span>
              <span className="serif italic text-[15px] leading-[1.3] text-ink-2">{f.pie}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex items-center justify-between px-4">
        <button
          type="button" onClick={() => irA(actual - 1)} disabled={actual === 0} aria-label="Foto anterior"
          className="btn btn-icono disabled:opacity-30"
        >
          <Icon name="atras" />
        </button>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {FOTOS.map((f, i) => (
            <span key={f.titulo} className={`h-1.5 rounded-full transition-all duration-200 ease-suave ${i === actual ? 'w-4 bg-lacre' : 'w-1.5 bg-line'}`} />
          ))}
        </div>
        <button
          type="button" onClick={() => irA(actual + 1)} disabled={actual === FOTOS.length - 1} aria-label="Foto siguiente"
          className="btn btn-icono disabled:opacity-30"
        >
          <Icon name="siguiente" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">{`${FOTOS[actual].titulo}, ${actual + 1} de ${FOTOS.length}`}</p>
    </section>
  );
}

export default function AsiEra() {
  return (
    <div className="max-w-(--breakpoint-md) mx-auto pb-6">
      <div className="px-4">
        <Link to="/settings" aria-label="Volver a Ajustes" className="btn btn-icono -ml-2 mt-1">
          <Icon name="atras" />
        </Link>
        <div className="px-1 pb-4 flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em]">Así era</h1>
            <p className="serif text-[18px] leading-[1.35] text-ink-2">
              La app de antes, <em>tal y como la dejamos.</em>
            </p>
          </div>
          {/* The old icon, the pink heart, as a postage stamp */}
          <span className="sello-postal" role="img" aria-label="Sello con el corazón rosa de la app antigua">
            <span className="sello-postal-in">
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
                <path fill="#f472b6" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="num text-[9px] font-semibold tracking-[0.1em] text-ink-2">2025</span>
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-[30px]">
        <Album />

        <section aria-labelledby="asi-era-historia" className="px-4 flex flex-col gap-2">
          <h2 id="asi-era-historia" className="etiqueta px-1">Su historia</h2>
          <ol className="historia rounded-tarjeta bg-card border border-line px-4 py-2">
            {HISTORIA.map((h) => (
              <li key={h.version} className={`historia-paso ${h.ahora ? 'ahora' : ''}`}>
                <span className="historia-punto" aria-hidden="true" />
                <div className="flex items-baseline gap-2">
                  <span className={`serif text-[21px] leading-none ${h.ahora ? 'text-accent-ink' : ''}`}>{h.version}</span>
                  <span className="num text-[13px] text-ink-2">{h.fecha}</span>
                </div>
                <p className="text-[15px] leading-[1.4] text-ink-2">{h.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="asi-era-carta" className="px-4">
          <div className="carta-despedida rounded-hero bg-card border border-line shadow-carta px-5 pt-6 pb-7">
            <h2 id="asi-era-carta" className="serif text-[28px] leading-[1.15] font-normal">
              Gracias por todo, <em>versión antigua.</em>
            </h2>
            <div className="serif text-[18px] leading-[1.5] flex flex-col gap-3 pt-4">
              <p>Fuiste la primera. Te hicimos deprisa, en una semana de agosto, y desde entonces guardaste nuestras fotos, nuestros planes y cada notita.</p>
              <p>Nos contaste los días que faltaban para vernos y llovieron corazones cada 24. Eras rosa y un poco desordenada, y te queríamos así.</p>
              <p>Ahora todo eso vive en papel y tinta, pero esto también fue nuestro.</p>
            </div>
            <div className="pt-6 flex items-center justify-between">
              <span className="serif italic text-[18px] text-ink-2">Con cariño, <span className="not-italic">🍪🫒</span></span>
              <span className="lacre-sello" aria-hidden="true">
                <Icon name="latido" size={22} filled />
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
