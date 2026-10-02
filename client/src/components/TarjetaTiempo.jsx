import { useEffect, useRef, useState } from 'react';
import CieloAnimado from './CieloAnimado';
import { weatherEmoji, weatherType } from '../lib/weather';
import { skyWords } from '../lib/inicio';
import { usePrefersReducedMotion } from '../lib/motion';

// How long the tap's burst lasts, in ms (CieloAnimado: .rafaga)
const RAFAGA_MS = 2000;

// The weather card of one person on Inicio: the sky behind (CieloAnimado), the numbers and, on tap, a burst of that
// weather and tomorrow's forecast. `theme` is getWeatherTheme() of Dashboard, `words` the sky in words
export default function TarjetaTiempo({ who, label, w, theme, words, localTime }) {
  const reduce = usePrefersReducedMotion();
  const [rafaga, setRafaga] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const tomorrow = w.tomorrow;

  function tap() {
    if (tomorrow) setOpen((o) => !o);
    // Under reduced motion the tap only opens tomorrow: no burst, no flash, no buzz
    if (reduce) return;
    setRafaga(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRafaga(false), RAFAGA_MS);
    try { navigator.vibrate?.(30); } catch { /* not every browser has it (iOS does not) */ }
  }

  const name = [
    `El tiempo de ${label}${w.city ? ` en ${w.city}` : ''}`,
    [words, w.temp != null ? `${w.temp} grados` : ''].filter(Boolean).join(', '),
  ].filter(Boolean).join(': ');
  const tomorrowName = tomorrow
    ? `. Mañana ${skyWords(weatherType(tomorrow.code))}, máxima ${tomorrow.max} grados, mínima ${tomorrow.min}`
    : '';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${name}${open ? tomorrowName : ''}${tomorrow ? (open ? '. Ocultar mañana' : '. Ver mañana') : ''}`}
      aria-expanded={tomorrow ? open : undefined}
      onClick={tap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
      }}
      className={`cielo cielo-toque min-w-0 rounded-tarjeta px-3.5 pt-3 pb-3.5 flex flex-col gap-0.5 ${theme.dark ? 'de-noche' : ''}`}
    >
      <div aria-hidden="true" className={`cielo-fondo ${theme.container} animate-gradient-subtle`} />
      <CieloAnimado code={w.code} phase={w.phase} wind={w.wind} seed={w.city || who} rafaga={rafaga} />
      <div className="flex items-center justify-between gap-1.5">
        <p className="etiqueta cielo-2 tracking-[0.06em] truncate">{who} {label}</p>
        {/* Moon at night and the weather emoji, both (F4) */}
        <span className="text-[18px] leading-none flex items-center gap-1 shrink-0">
          {w.phase === 'night' && <span>{w.moon || '🌙'}</span>}
          <span>{weatherEmoji(w.code ?? -1)}</span>
        </span>
      </div>
      <p className="num text-[24px] font-semibold tracking-[-0.01em]">{w.temp != null ? `${w.temp}°` : '—°'}</p>
      {words && <p className="text-[14px] font-semibold">{words}</p>}
      <p className="num text-[12px] cielo-2">Sensación {w.feels != null ? `${w.feels}°` : '—°'} · 💧 {w.humidity != null ? `${w.humidity} %` : '— %'}</p>
      <p className="num text-[12px] cielo-2">🌬️ {w.wind != null ? `${w.wind} km/h` : '— km/h'}</p>
      <p className="text-[13px] font-semibold truncate">{w.city || '—'}{localTime && <span className="num"> · {localTime}</span>}</p>
      {open && tomorrow && (
        <p className="manana num text-[13px] font-semibold">Mañana · {weatherEmoji(tomorrow.code)} {tomorrow.max}°/{tomorrow.min}°</p>
      )}
    </div>
  );
}
