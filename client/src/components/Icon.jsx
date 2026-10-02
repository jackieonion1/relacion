import React from 'react';

// Carta icons (Sistema.dc.html): 24 grid, 1.75 stroke, round ends, no fill except states (heart, play).
// The paths are the canvas ones; siguiente, abajo, recargar, play, pausa, info and sinConexion come from
// Componentes.dc.html or are drawn on the same grid
export const ICONS = {
  inicio: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  galeria: 'M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5zM3.8 16.5l4.7-4.7 4.3 4.3 2.4-2.4 5 4.3M16.5 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 1 1 0-3z',
  calendario: 'M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3.5 10h17M8 3v4M16 3v4',
  notas: 'M6 3.5h8.5L19 8v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14 3.5V8h5M8.5 13h7M8.5 16.5h4.5',
  mas: 'M6 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 1 1 0-3zM12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 1 1 0-3zM18 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 1 1 0-3z',
  mapa: 'M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5l-6-2zM9 4.5v13M15 6.5v13',
  musica: 'M9 18V6.5l10-2V16M9 15.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5zM19 13.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5z',
  ruleta: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 1 1 0-17zM12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18',
  moneda: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 1 1 0-17zM12 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10z',
  recuerdos: 'M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5zM8.5 6.5h7v7h-7zM8.5 17h4',
  ajustes:'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  latido: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z',
  nosVemos: 'M9 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10zM15 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10z',
  subir: 'M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14',
  nuevo: 'M12 5v14M5 12h14',
  editar: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14 8l3 3',
  borrar: 'M4.5 7h15M10 7V5h4v2M6.5 7l.9 11.2a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8L17.5 7',
  cerrar: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  atras: 'M15 5l-7 7 7 7',
  siguiente: 'M9 5l7 7-7 7',
  abajo: 'M5 9l7 7 7-7',
  otra: 'M4 7h3c2.2 0 3.3 1.2 5 5s2.8 5 5 5h3M4 17h3c1 0 1.8-.3 2.4-.9M14.6 7.9c.6-.6 1.4-.9 2.4-.9h3M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5',
  lugar: 'M12 21s-6.5-5.5-6.5-11a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11-6.5 11zM12 7.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 1 1 0-4.4z',
  actualizar: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 1 1 0-17zM12 8v7.5M8.8 12.5 12 15.7l3.2-3.2',
  recargar: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  reparar: 'M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.7-7.7M14.7 6.3a4 4 0 0 1 4.6-1.9l-2.6 2.6.5 2.1 2.1.5 2.6-2.6a4 4 0 0 1-1.9 4.6',
  enlace: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  enviar: 'M12 19V6M6.5 11.5 12 6l5.5 5.5',
  play: 'M8 5.2v13.6a.6.6 0 0 0 .9.5l10.4-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z',
  pausa: 'M8.5 5.5v13M15.5 5.5v13',
  info: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 1 1 0-17zM12 8v5M12 16h.01',
  sinConexion: 'M3 3l18 18M8.5 8.6A4.5 4.5 0 0 0 7 17h9.5M13.5 6.2A5.5 5.5 0 0 1 18.8 11a3.2 3.2 0 0 1 1.4 5.3',
};

// Decorative by default (aria-hidden); with `label` it is an image with that name.
// `filled` paints the shape instead of stroking it (heart liked, play)
export default function Icon({ name, size = 24, label, filled = false, className = '', style }) {
  const d = ICONS[name];
  if (!d) return null;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={`shrink-0 ${className}`.trim()}
      style={style}
      {...a11y}
    >
      <path d={d} />
    </svg>
  );
}
