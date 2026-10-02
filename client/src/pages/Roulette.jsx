import React, { useEffect, useMemo, useRef, useState } from 'react';
import HeartRainAnimation from '../components/HeartRainAnimation';
import Button from '../components/Button';
import Chip from '../components/Chip';
import Icon from '../components/Icon';
import { prefersReducedMotion } from '../lib/motion';

const MAX_OPTIONS = 15;
const SIZE = 280; // wheel canvas, CSS px
// Radial labels stop fitting a wedge past this many options (C14)
const LABELS_MAX = 8;
const FONT = "600 14px 'Instrument Sans', system-ui, sans-serif";
// 15 distinct hues with similar saturation/lightness, semi-transparent for soft look
const COLORS = [
  'hsl(0 85% 60% / 0.45)',   // red
  'hsl(24 85% 60% / 0.45)',  // orange
  'hsl(48 85% 60% / 0.45)',  // amber
  'hsl(72 85% 50% / 0.45)',  // lime
  'hsl(96 70% 50% / 0.45)',  // green
  'hsl(120 70% 45% / 0.45)', // emerald
  'hsl(144 70% 45% / 0.45)', // teal
  'hsl(168 80% 50% / 0.45)', // cyan
  'hsl(192 85% 55% / 0.45)', // sky
  'hsl(216 80% 60% / 0.45)', // blue
  'hsl(240 80% 65% / 0.45)', // indigo
  'hsl(264 80% 65% / 0.45)', // violet
  'hsl(288 80% 65% / 0.45)', // fuchsia
  'hsl(312 80% 65% / 0.45)', // pink
  'hsl(336 80% 65% / 0.45)', // rose
];

// The label as it fits in maxW px, cut with «…» (by code point, so an emoji is never split)
function fit(ctx, text, maxW) {
  const tooWide = (s) => ctx.measureText(s).width > maxW;
  if (!tooWide(text)) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && tooWide(`${chars.join('')}…`)) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

export default function Roulette() {
  const [options, setOptions] = useState([]);
  const [input, setInput] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState(null);
  const canvasRef = useRef(null);
  const spinBtnRef = useRef(null);
  const resultRef = useRef(null);
  const angleRef = useRef(0); // radians
  const animRef = useRef(null);
  const spinStartRef = useRef(0);
  const durationRef = useRef(0);
  const startAngleRef = useRef(0);
  const deltaRef = useRef(0);
  const targetIndexRef = useRef(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [resultLabel, setResultLabel] = useState('');
  const [fireworksActive, setFireworksActive] = useState(false);

  // Load/save from localStorage scoped by pair
  useEffect(() => {
    try {
      const pair = localStorage.getItem('pairId') || 'default';
      const raw = localStorage.getItem(`roulette:${pair}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          // Migrate old string[] to object[] with unique colors
          let items = [];
          if (typeof parsed[0] === 'string') {
            const used = new Set();
            items = parsed
              .filter((s) => typeof s === 'string' && s.trim())
              .slice(0, MAX_OPTIONS)
              .map((label) => {
                const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
                used.add(color);
                return { label, color };
              });
          } else if (parsed[0] && typeof parsed[0] === 'object') {
            const used = new Set();
            items = parsed
              .slice(0, MAX_OPTIONS)
              .map((it) => {
                const label = String(it.label || '').trim();
                let color = it.color;
                if (!COLORS.includes(color) || used.has(color)) {
                  color = COLORS.find((c) => !used.has(c)) || COLORS[0];
                }
                used.add(color);
                return label ? { label, color } : null;
              })
              .filter(Boolean);
          }
          if (items.length) { setOptions(items); return; }
        }
      }
      // Start with no defaults
      setOptions([]);
    } catch {
      setOptions([]);
    }
  }, []);

  useEffect(() => {
    try {
      const pair = localStorage.getItem('pairId') || 'default';
      localStorage.setItem(`roulette:${pair}`, JSON.stringify(options));
    } catch {}
  }, [options]);

  // Randomize initial orientation and draw (backing store at the device pixel ratio so the labels stay sharp)
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvasRef.current) {
      canvasRef.current.width = SIZE * dpr;
      canvasRef.current.height = SIZE * dpr;
    }
    angleRef.current = Math.random() * Math.PI * 2;
    drawWheel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup RAF on unmount
  useEffect(() => () => cancelAnim(), []);

  // The result card takes focus and Escape closes it, like a sheet
  useEffect(() => {
    if (!showOverlay) return undefined;
    resultRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') closeResult(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverlay]);

  const canSpin = options.length >= 2 && !spinning;

  // The spin and its result read the options it started with: they stay as they are until it stops
  function addOption() {
    if (spinning) return;
    const v = (input || '').trim();
    if (!v) return;
    if (options.length >= MAX_OPTIONS) return; // cap at 15
    // prevent duplicate labels (case-insensitive)
    const norm = v.toLowerCase();
    if (options.some(o => (o.label || '').trim().toLowerCase() === norm)) {
      setInput('');
      return;
    }
    // assign first unused color from pool
    const used = new Set(options.map((o) => o.color));
    const color = COLORS.find((c) => !used.has(c));
    if (!color) return; // no color available
    setOptions((prev) => [...prev, { label: v, color }]);
    setInput('');
    setWinnerIndex(null);
  }

  function removeOption(i) {
    if (spinning) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setWinnerIndex(null);
  }

  function clearAll() {
    if (options.length <= 1) return;
    setOptions([]);
    setWinnerIndex(null);
    setInput('');
  }

  const segRad = useMemo(() => (options.length ? (Math.PI * 2) / options.length : 0), [options.length]);

  function drawWheel() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = SIZE / 2, cy = SIZE / 2;
    const r = SIZE / 2;
    ctx.setTransform(canvas.width / SIZE, 0, 0, canvas.width / SIZE, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRef.current);
    // draw segments, as strong as the theme lets the stored colours be (--rueda-op), and the labels at full
    ctx.globalAlpha = parseFloat(getComputedStyle(canvas).getPropertyValue('--rueda-op')) || 1;
    for (let i = 0; i < options.length; i++) {
      const start = i * segRad;
      const end = start + segRad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, start, end);
      ctx.closePath();
      ctx.fillStyle = options[i].color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // labels run along the radius from the rim inwards, clear of the centre button (C14)
    if (options.length > 0 && options.length <= LABELS_MAX) {
      ctx.fillStyle = getComputedStyle(canvas).color;
      ctx.font = FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < options.length; i++) {
        ctx.save();
        ctx.rotate((i + 0.5) * segRad);
        ctx.fillText(fit(ctx, options[i].label, r - 14 - 46), r - 14, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function cancelAnim() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function spin() {
    if (!canSpin || options.length < 2) return;
    cancelAnim();
    setWinnerIndex(null);
    // choose random target segment index
    const k = Math.floor(Math.random() * options.length);
    targetIndexRef.current = k;
    // compute final angle so that segment center aligns to top pointer (-PI/2)
    const theta0 = angleRef.current;
    const spins = 8 + Math.floor(Math.random() * 5); // 8..12 full spins
    const centerAngle = (k + 0.5) * segRad; // wheel-local angle
    // desired final angle: -PI/2 - centerAngle (mod 2PI) relative to world
    let desired = -Math.PI / 2 - centerAngle;
    // compute smallest positive delta to reach desired from current angle
    const twoPI = Math.PI * 2;
    let delta = (desired - theta0) % twoPI;
    if (delta < 0) delta += twoPI;
    delta += spins * twoPI; // add full spins for drama
    if (prefersReducedMotion()) {
      // No spin: the wheel is left on the winner and the result shows at once
      angleRef.current = (((theta0 + delta) % twoPI) + twoPI) % twoPI;
      drawWheel();
      showResultFor(k);
      return;
    }
    setSpinning(true);
    startAngleRef.current = theta0;
    deltaRef.current = delta;
    const duration = 5000 + Math.floor(Math.random() * 3000); // 5-8s
    durationRef.current = duration;
    spinStartRef.current = 0;

    const step = (ts) => {
      if (!spinStartRef.current) spinStartRef.current = ts;
      const t = (ts - spinStartRef.current) / durationRef.current;
      const p = t >= 1 ? 1 : t;
      const eased = easeOutCubic(p);
      angleRef.current = startAngleRef.current + eased * deltaRef.current;
      drawWheel();
      if (p < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        // finalize
        cancelAnim();
        // normalize angle and set exact final
        const finalAngle = ((angleRef.current % twoPI) + twoPI) % twoPI;
        angleRef.current = finalAngle;
        drawWheel();
        showResultFor(targetIndexRef.current);
      }
    };
    animRef.current = requestAnimationFrame(step);
  }

  function showResultFor(idx) {
    setSpinning(false);
    setWinnerIndex(idx);
    setResultLabel(options[idx]?.label || '');
    setShowOverlay(true);
    // Fireworks run while the result is visible; they stop on «Parar la fiesta» or when it closes
    setFireworksActive(true);
  }

  function closeResult() {
    setShowOverlay(false);
    setFireworksActive(false);
    spinBtnRef.current?.focus({ preventScroll: true });
  }

  // «Otra vez»: closes the result and spins at once
  function spinAgain() {
    closeResult();
    spin();
  }

  // redraw when options change (if not spinning)
  useEffect(() => {
    if (!spinning) drawWheel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  return (
    <div className="flex flex-col gap-4 px-4">
      <header className="flex items-end justify-between">
        <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em]">Ruleta</h1>
        <div className="flex items-center gap-2 pb-0.5">
          <Chip tone="neutro" className="select-none">{options.length} opciones</Chip>
          {options.length > 1 && (
            <Button
              icon="borrar"
              label="Limpiar todas las opciones"
              title="Limpiar todas"
              onClick={clearAll}
              disabled={spinning}
            />
          )}
        </div>
      </header>

      {/* Wheel */}
      <div className="relative mx-auto" style={{ width: SIZE + 12, height: SIZE + 20 }}>
        {/* Pointer */}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="absolute left-[134px] top-0 w-6 h-6 z-2 fill-lacre">
          <path d="M12 22 4 6h16z" />
        </svg>
        {/* Wheel body (canvas): the wedge colours are translucent, so they sit on the card */}
        <div className="absolute left-1.5 top-3.5 rounded-full overflow-hidden bg-card ring-1 ring-line shadow-flota" style={{ width: SIZE, height: SIZE }}>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            aria-hidden="true"
            className={`block w-full h-full ${options.length < 2 ? 'invisible' : ''}`}
          />
        </div>
        {options.length < 2 && (
          <div
            className="absolute left-1.5 top-3.5 rounded-full border-[1.5px] border-dashed border-line flex items-start justify-center px-15 pt-14 text-center text-[15px] text-ink-2"
            style={{ width: SIZE, height: SIZE }}
          >
            Añade al menos dos opciones
          </div>
        )}
        {/* Center spin button */}
        <button
          ref={spinBtnRef}
          type="button"
          onClick={spin}
          disabled={!canSpin}
          className="btn absolute left-27 top-29 z-2 w-19 h-19 rounded-full p-0 bg-ink text-paper text-base font-bold shadow-flota"
        >
          Girar
        </button>
        {/* The result shows as a sheet over everything, with fireworks */}
      </div>

      {/* Options editor */}
      <section aria-label="Opciones" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 max-h-[22dvh] overflow-y-auto overscroll-contain">
          {options.map((opt, i) => (
            <div
              key={i}
              className="relative inline-flex items-center h-11 pl-3.5 rounded-full border border-line bg-card text-[15px] font-medium text-ink"
            >
              {/* The stored colour, toned down by the theme (--rueda-op) so ink and ✕ keep their contrast in dark */}
              <span aria-hidden="true" className="absolute inset-0 rounded-full" style={{ background: opt.color, opacity: 'var(--rueda-op)' }} />
              <span className="relative truncate max-w-[40vw]">{opt.label}</span>
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={spinning}
                aria-label={`Eliminar ${opt.label}`}
                className="relative w-11 h-11 inline-flex items-center justify-center rounded-full text-ink-2 disabled:opacity-50"
                title="Eliminar"
              >
                <Icon name="cerrar" size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <label htmlFor="roulette-option" className="sr-only">Añadir opción</label>
          <input
            id="roulette-option"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Añadir opción"
            className="input flex-1 min-w-0 min-h-12 rounded-full px-[18px]"
            onKeyDown={(e) => { if (e.key === 'Enter') addOption(); }}
          />
          <Button variant="sec" size="m" onClick={addOption} disabled={spinning || options.length >= MAX_OPTIONS}>Añadir</Button>
        </div>
        {options.length >= MAX_OPTIONS && (
          <div className="text-[13px] text-ink-2">Máximo {MAX_OPTIONS} opciones</div>
        )}
      </section>

      {/* Result sheet with fireworks behind the card */}
      {showOverlay && (
        <>
          {/* Dim background below fireworks */}
          <div className="velo fixed inset-0 z-10040 bg-scrim backdrop-blur-xs" onClick={closeResult} aria-hidden="true" />

          {/* Fireworks layer (pointer-events: none inside component); «Parar la fiesta» drops them, the result stays */}
          <HeartRainAnimation isActive={fireworksActive} type="fireworks" intensity={0.4} effectOpacity={0.55} zIndex={10045} onStop={() => setFireworksActive(false)} />

          {/* Result card above everything */}
          <div className="fixed inset-x-0 bottom-0 z-10070 flex justify-center pointer-events-none" style={{ zIndex: 10070 }}>
            <div
              ref={resultRef}
              role="dialog"
              aria-modal="true"
              aria-label="Resultado"
              tabIndex={-1}
              className="hoja pointer-events-auto w-full max-w-lg px-5 pt-2 bg-card text-ink text-center rounded-t-hoja border border-b-0 border-line shadow-hoja outline-hidden flex flex-col items-center gap-2 transition-[padding] duration-260 ease-suave"
              // While the fireworks run, «Parar la fiesta» floats above the bar: the buttons make room for it
              style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${fireworksActive ? 10.5 : 2.125}rem)` }}
            >
              <span className="block w-9 h-[5px] rounded-full bg-line mb-3" aria-hidden="true" />
              <p className="etiqueta">🎉 Ha salido 🎉</p>
              <p className="serif italic text-[48px] leading-[1.05] text-accent-ink max-w-full break-words">{resultLabel}</p>
              <div className="grid grid-cols-2 gap-2 w-full pt-4">
                <Button variant="sec" size="l" onClick={closeResult}>Vale</Button>
                <Button size="l" onClick={spinAgain}>Otra vez</Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
