import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RAIN, addBurst, burst, rainKind } from '../lib/rain';
import './HeartRain.css';

const REDUCE = '(prefers-reduced-motion: reduce)';
// The stop button sits above every layer the rain falls over, the roulette result card (10070) included
const STOP_Z = 10080;

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(REDUCE);
    const onChange = () => setReduce(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

// Endless rain while isActive, until the page turns it off or «Parar la fiesta» is tapped.
// onStop lets the page drop its own flag; without it the rain stays stopped until isActive or type changes
export default function HeartRain({ isActive, type = 'rain', intensity = 1, effectOpacity = 1, zIndex = 10050, onStop }) {
  const kind = rainKind(type);
  const reduce = usePrefersReducedMotion();
  const [stopped, setStopped] = useState(false);
  const [particles, setParticles] = useState([]);
  const nextId = useRef(0);

  // Turning it off and on again, or another celebration, falls again after a manual stop
  useEffect(() => { setStopped(false); }, [isActive, kind]);

  const running = isActive && !stopped;
  const falling = running && !reduce;

  useEffect(() => {
    if (!falling) {
      setParticles([]);
      return undefined;
    }
    const tick = () => {
      // Background tabs still run throttled timers: nothing to see, so nothing piles up
      if (document.hidden) return;
      const fresh = burst(kind, intensity, () => nextId.current++);
      setParticles((prev) => addBurst(prev, fresh));
    };
    tick();
    const interval = setInterval(tick, RAIN[kind].every);
    return () => clearInterval(interval);
  }, [falling, kind, intensity]);

  if (!running) return null;

  const stop = () => {
    setStopped(true);
    if (onStop) onStop();
  };
  const opacity = Math.max(0.1, Math.min(1, effectOpacity));

  return createPortal(
    <>
      {falling && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex }} aria-hidden="true" data-testid="heart-rain">
          {particles.map((p) => (p.kind === 'fireworks' ? (
            <div
              key={p.id}
              className="absolute heart-fireworks"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                fontSize: `${p.size}rem`,
                animationDelay: `${p.delay}ms`,
                '--dx': `${p.dx}px`,
                '--dy': `${p.dy}px`,
                filter: `opacity(${opacity})`,
              }}
            >
              {p.emoji}
            </div>
          ) : (
            <div
              key={p.id}
              className="absolute heart-fall"
              style={{ left: `${p.left}%`, top: '-50px', fontSize: `${p.size}rem`, animationDelay: `${p.delay}ms` }}
            >
              {p.emoji}
            </div>
          )))}
        </div>
      )}
      <div className="heart-rain-bar" style={{ zIndex: STOP_Z }}>
        {reduce && <span className="heart-rain-still" aria-hidden="true">{RAIN[kind].emoji.slice(0, 3).join('')}</span>}
        <button type="button" className="heart-rain-stop" onClick={stop}>Parar la fiesta</button>
      </div>
    </>,
    document.body
  );
}
