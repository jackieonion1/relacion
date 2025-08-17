import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Full-screen canvas-like card with WAAPI arc flip.
// - Two premium faces (🍪 / 🫒) styled a la iOS.
// - Coin starts just above the Launch button, flips with arc + slight zoom,
//   lands at a random spot, then returns smoothly to home.

export default function Coin() {
  const canvasRef = useRef(null);
  const coinRef = useRef(null);
  const shadowRef = useRef(null);
  const btnRef = useRef(null);
  const [flipping, setFlipping] = useState(false);
  const [home, setHome] = useState({ left: 0, top: 0 });
  const homeReadyRef = useRef(false);
  const homeRef = useRef({ left: 0, top: 0 });
  const coinSize = 160; // px (keep in sync with CSS)

  useLayoutEffect(() => {
    // Inject styles (canvas + premium faces)
    const style = document.createElement('style');
    style.dataset.coinStyles = 'true';
    style.textContent = `
      /* Fullscreen canvas, avoid overlapping bottom navbar (64px) */
      .coin-canvas { position: fixed; left: 0; right: 0; top: 0; bottom: 64px; overflow: hidden; perspective: 900px; }
      @supports (bottom: calc(64px + env(safe-area-inset-bottom))) {
        .coin-canvas { bottom: calc(64px + env(safe-area-inset-bottom)); }
      }
      #coin { position: absolute; left: 50%; top: 50%; width: ${coinSize}px; height: ${coinSize}px; cursor: pointer; outline: none;
              transform-style: preserve-3d; -webkit-transform-style: preserve-3d; will-change: transform;
              transform-origin: 50% 50%; transform: translate(-50%, -50%) translateZ(0); opacity: 0; z-index: 2; }
      #coin:focus-visible { outline: 2px solid #fb7185; outline-offset: 3px; }
      #coin div { position: absolute; inset: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${Math.round(coinSize * 0.62)}px;
                  -webkit-backface-visibility: hidden; backface-visibility: hidden; }
      /* Cookie face */
      .side-a {
        z-index: 2; color: #5a3a16; text-shadow: 0 1px 0 rgba(255,255,255,0.3);
        background:
          radial-gradient(120% 120% at 30% 25%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.0) 35%),
          radial-gradient(80% 80% at 70% 75%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.0) 55%),
          radial-gradient(100% 100% at 50% 50%, #f8d7a9 0%, #e7b772 52%, #c98e43 85%, #a96d2b 100%);
        box-shadow: inset 0 2px 6px rgba(0,0,0,0.15), inset 0 -3px 8px rgba(0,0,0,0.25);
      }
      .side-a::after { /* Engraved rim */
        content: ''; position: absolute; inset: 8px; border-radius: 50%;
        box-shadow: inset 0 0 0 2px rgba(90,58,22,0.22), inset 0 0 0 6px rgba(255,255,255,0.15);
        pointer-events: none;
      }
      /* Olive face */
      .side-b {
        color: #1e2f12;
        transform: rotateY(-180deg); -webkit-transform: rotateY(-180deg);
        background:
          radial-gradient(120% 120% at 30% 25%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.0) 38%),
          radial-gradient(80% 80% at 70% 80%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.0) 60%),
          radial-gradient(100% 100% at 50% 50%, #eaf6c8 0%, #b9d67a 48%, #8eb94b 78%, #5d8e2a 100%);
        box-shadow: inset 0 2px 6px rgba(0,0,0,0.14), inset 0 -3px 8px rgba(0,0,0,0.22);
      }
      .side-b::after { /* Engraved rim */
        content: ''; position: absolute; inset: 8px; border-radius: 50%;
        box-shadow: inset 0 0 0 2px rgba(30,47,18,0.22), inset 0 0 0 6px rgba(255,255,255,0.14);
        pointer-events: none;
      }
      /* Floor shadow: top-down circular shadow, same footprint as coin */
      .coin-shadow { position: absolute; width: ${coinSize}px; height: ${coinSize}px; border-radius: 50%;
                     background: radial-gradient(circle at 50% 50%, rgba(0,0,0,0.00) 40%, rgba(0,0,0,0.52) 64%, rgba(0,0,0,0.0) 92%);
                     filter: blur(18px); opacity: 0; transform-origin: 50% 50%; z-index: 1; pointer-events: none;
                     mix-blend-mode: multiply; will-change: transform, opacity; }
      /* Bottom UI */
      .coin-launch { position: absolute; left: 50%; transform: translateX(-50%); bottom: 24px; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Compute home position: centered in canvas
  const computeHome = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getBoundingClientRect();
    const left = Math.round((c.width - coinSize) / 2);
    const top = Math.round((c.height - coinSize) / 2);
    homeRef.current = { left, top };
    setHome(homeRef.current);
    if (coinRef.current) {
      coinRef.current.style.opacity = '1';
    }
    if (shadowRef.current) {
      const sw = coinSize;
      const sh = coinSize;
      // Center the shadow exactly under the coin center
      shadowRef.current.style.left = `${Math.round(left + coinSize / 2 - sw / 2)}px`;
      shadowRef.current.style.top = `${Math.round(top + coinSize / 2 - sh / 2)}px`;
      // At rest: keep shadow fully hidden under the coin
      shadowRef.current.style.opacity = '0';
      shadowRef.current.style.transform = 'scale(0.88)';
    }
    homeReadyRef.current = true;
  };

  useLayoutEffect(() => {
    computeHome();
    window.addEventListener('resize', computeHome);
    return () => window.removeEventListener('resize', computeHome);
  }, []);

  function flip() {
    if (flipping) return;
    const canvas = canvasRef.current;
    const coin = coinRef.current;
    const shadow = shadowRef.current;
    if (!canvas || !coin) return;
    // Cancel any lingering animations to avoid weird offsets
    coin.getAnimations?.().forEach(a => a.cancel());
    shadow?.getAnimations?.().forEach(a => a.cancel());
    if (!homeReadyRef.current) computeHome();
    // Normalize starting transform and position at home (sync via ref)
    coin.style.transform = 'translate(-50%, -50%) rotateY(0deg) scale(1)';
    // Force reflow to ensure start state is committed before animating
    void coin.getBoundingClientRect();
    setFlipping(true);

    // Random heads/tails by ending orientation (0deg vs 180deg)
    const heads = Math.random() < 0.5;
    const baseDuration = 1400; // ms baseline used for speed reference
    const duration = 3600;     // ms current total duration (longer tension)
    const baseSpins = Math.random() < 0.5 ? 2 : 3; // baseline 2 or 3 full spins @ 1400ms
    // Keep same angular speed: spins proportional to duration
    const spins = Math.max(1, Math.round((baseSpins * duration) / baseDuration));
    const finalRot = spins * 360 + (heads ? 0 : 180);

    // In-place flip for top-down view: depth suggested by scale only
    const c = canvas.getBoundingClientRect();
    const lift = 0;
    const apexScale = 1.70; // coin apex scale
    const baseShadow = 0.88; // rest scale keeps shadow fully under coin
    const throwAnim = coin.animate([
      { transform: 'translate(-50%, -50%) rotateY(0deg) scale(1)', offset: 0 },
      { transform: `translate(-50%, -50%) rotateY(${Math.round(finalRot * 0.55)}deg) scale(${apexScale})`, offset: 0.52 },
      { transform: `translate(-50%, -50%) rotateY(${finalRot}deg) scale(1)`, offset: 1 }
    ], {
      duration,
      easing: 'cubic-bezier(0.20, 0.72, 0.18, 1)',
      fill: 'forwards'
    });

    // Shadow animation in sync (hidden at rest, appears only while flipping)
    if (shadow) {
      shadow.animate([
        { transform: `scale(${baseShadow})`, opacity: 0, offset: 0 },
        { transform: `scale(${(baseShadow * apexScale).toFixed(2)})`, opacity: 0.70, offset: 0.52 },
        { transform: `scale(${baseShadow})`, opacity: 0, offset: 1 }
      ], {
        duration,
        easing: 'cubic-bezier(0.20, 0.72, 0.18, 1)',
        fill: 'forwards'
      });
    }
    throwAnim.onfinish = () => { setFlipping(false); };
    throwAnim.oncancel = () => setFlipping(false);
  }

  return (
    <div className="coin-canvas" ref={canvasRef}>
      {/* Floor shadow */}
      <div className="coin-shadow" ref={shadowRef} />
      {/* Coin */}
      <div
        id="coin"
        ref={coinRef}
        role="button"
        aria-label="Moneda"
        tabIndex={0}
        onClick={flip}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}
      >
        <div className="side-a select-none">🍪</div>
        <div className="side-b select-none">🫒</div>
      </div>

      {/* Launch button fixed at bottom center */}
      <button
        ref={btnRef}
        onClick={flip}
        disabled={flipping}
        className="coin-launch btn-primary h-12 px-6 disabled:opacity-60"
      >
        {flipping ? 'Lanzando…' : 'Lanzar'}
      </button>
    </div>
  );
}
