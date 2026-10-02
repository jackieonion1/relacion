import React, { useRef, useState } from 'react';
import Button from '../components/Button';
import { prefersReducedMotion } from '../lib/motion';
import './Coin.css';

// Top-down coin with a WAAPI flip: it grows to 1.7 at the apex while its shadow follows, then lands on a random face.
// - Two premium faces (🍪 / 🫒) styled a la iOS, in Coin.css.
// - With reduced motion there is no flip: the coin shows its face and the result at once.

const FACES = { galleta: '🍪', aceituna: '🫒' };

export default function Coin() {
  const coinRef = useRef(null);
  const shadowRef = useRef(null);
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState(null); // 'galleta' | 'aceituna' | null

  function flip() {
    if (flipping) return;
    const coin = coinRef.current;
    const shadow = shadowRef.current;
    if (!coin) return;
    // Cancel any lingering animations to avoid weird offsets
    coin.getAnimations?.().forEach(a => a.cancel());
    shadow?.getAnimations?.().forEach(a => a.cancel());
    setResult(null);

    // Random heads/tails by ending orientation (0deg vs 180deg)
    const heads = Math.random() < 0.5;
    const outcome = heads ? 'galleta' : 'aceituna';

    if (prefersReducedMotion()) {
      coin.style.transform = `rotateY(${heads ? 0 : 180}deg)`;
      setResult(outcome);
      return;
    }

    // Normalize starting transform at home
    coin.style.transform = 'rotateY(0deg) scale(1)';
    // Force reflow to ensure start state is committed before animating
    void coin.getBoundingClientRect();
    setFlipping(true);

    const baseDuration = 1400; // ms baseline used for speed reference
    const duration = 3600;     // ms current total duration (longer tension)
    const baseSpins = Math.random() < 0.5 ? 2 : 3; // baseline 2 or 3 full spins @ 1400ms
    // Keep same angular speed: spins proportional to duration
    const spins = Math.max(1, Math.round((baseSpins * duration) / baseDuration));
    const finalRot = spins * 360 + (heads ? 0 : 180);

    // In-place flip for top-down view: depth suggested by scale only
    const apexScale = 1.70; // coin apex scale
    const baseShadow = 0.88; // rest scale keeps shadow fully under coin
    const throwAnim = coin.animate([
      { transform: 'rotateY(0deg) scale(1)', offset: 0 },
      { transform: `rotateY(${Math.round(finalRot * 0.55)}deg) scale(${apexScale})`, offset: 0.52 },
      { transform: `rotateY(${finalRot}deg) scale(1)`, offset: 1 }
    ], {
      duration,
      easing: 'cubic-bezier(0.20, 0.72, 0.18, 1)',
      fill: 'forwards'
    });

    // Shadow animation in sync (hidden at rest, appears only while flipping)
    shadow?.animate([
      { transform: `scale(${baseShadow})`, opacity: 0, offset: 0 },
      { transform: `scale(${(baseShadow * apexScale).toFixed(2)})`, opacity: 0.70, offset: 0.52 },
      { transform: `scale(${baseShadow})`, opacity: 0, offset: 1 }
    ], {
      duration,
      easing: 'cubic-bezier(0.20, 0.72, 0.18, 1)',
      fill: 'forwards'
    });
    throwAnim.onfinish = () => { setFlipping(false); setResult(outcome); };
    throwAnim.oncancel = () => setFlipping(false);
  }

  return (
    <div className="flex flex-col items-center gap-7 px-4">
      <header className="self-stretch">
        <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em]">Moneda</h1>
        <p className="text-[15px] text-ink-2">¿{FACES.galleta} o {FACES.aceituna}? Para cuando ninguno quiere decidir.</p>
      </header>

      <div className="coin-stage mt-12">
        {/* Floor shadow */}
        <div className="coin-shadow" ref={shadowRef} />
        <div
          className="coin"
          ref={coinRef}
          role="button"
          aria-label="Moneda"
          tabIndex={0}
          onClick={flip}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}
        >
          <div className="side-a select-none">{FACES.galleta}</div>
          <div className="side-b select-none">{FACES.aceituna}</div>
        </div>
      </div>

      <p
        role="status"
        className="serif h-10 text-[30px] text-ink transition-opacity duration-240 ease-suave"
        style={{ opacity: result ? 1 : 0 }}
      >
        {result ? `Sale ${FACES[result]}` : ' '}
      </p>

      <Button size="xl" busy={flipping} busyText="Lanzando…" onClick={flip} className="min-w-[200px]">Lanzar</Button>
    </div>
  );
}
