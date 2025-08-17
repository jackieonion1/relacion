import React, { useEffect, useMemo, useRef, useState } from 'react';
import RouletteIcon from '../components/icons/RouletteIcon';
import HeartRainAnimation from '../components/HeartRainAnimation';
import TrashIcon from '../components/icons/TrashIcon';

const MAX_OPTIONS = 15;
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

export default function Roulette() {
  const [options, setOptions] = useState([]);
  const [input, setInput] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState(null);
  const canvasRef = useRef(null);
  const angleRef = useRef(0); // radians
  const animRef = useRef(null);
  const spinStartRef = useRef(0);
  const durationRef = useRef(0);
  const startAngleRef = useRef(0);
  const deltaRef = useRef(0);
  const targetIndexRef = useRef(null);
  const overlayTimerRef = useRef(null);
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

  // Randomize initial orientation and draw
  useEffect(() => {
    angleRef.current = Math.random() * Math.PI * 2;
    drawWheel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup RAF and timers on unmount
  useEffect(() => () => {
    cancelAnim();
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
  }, []);

  const canSpin = options.length >= 2 && !spinning;

  function addOption() {
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
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(cx, cy) - 2;
    ctx.clearRect(0, 0, w, h);
    // background circle border
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRef.current);
    // draw segments
    if (!options.length) {
      // placeholder pattern
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    } else {
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
    }
    ctx.restore();
    // ring border
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)'; // rose-500/30
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  function cancelAnim() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function spin() {
    if (!canSpin || options.length < 2) return;
    cancelAnim();
    setSpinning(true);
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
        setSpinning(false);
        const idx = targetIndexRef.current;
        setWinnerIndex(idx);
        const lbl = options[idx]?.label || '';
        setResultLabel(lbl);
        setShowOverlay(true);
        // Fireworks run while overlay is visible; will stop on tap
        setFireworksActive(true);
      }
    };
    animRef.current = requestAnimationFrame(step);
  }

  // redraw when options change (if not spinning)
  useEffect(() => {
    if (!spinning) drawWheel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RouletteIcon className="w-5 h-5 text-rose-600" />
            <h2 className="text-lg font-semibold text-rose-600">Ruleta</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip select-none">{options.length} opciones</span>
            {options.length > 1 && (
              <button
                type="button"
                className="btn-ghost p-2 rounded-full hover:bg-rose-50 disabled:opacity-60"
                aria-label="Limpiar todas las opciones"
                title="Limpiar todas"
                onClick={clearAll}
                disabled={spinning}
              >
                <TrashIcon className="w-5 h-5 text-rose-700" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          {/* Wheel */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative" style={{ width: 280, height: 280 }}>
              {/* Pointer */}
              <div className="absolute inset-x-0 -top-3 flex justify-center z-20">
                <div className="w-0 h-0 border-l-8 border-r-8 border-t-[14px] border-l-transparent border-r-transparent border-t-rose-600 drop-shadow" />
              </div>
              {/* Wheel body (canvas) */}
              <canvas
                ref={canvasRef}
                width={280}
                height={280}
                className="absolute inset-0 rounded-full shadow-sm"
              />
              {/* No text on the wheel (clean look) */}
              {/* Center spin button */}
              <div className="absolute inset-0 flex items-center justify-center z-30">
                <button
                  onClick={spin}
                  disabled={!canSpin}
                  className="w-20 h-20 rounded-full bg-rose-600 text-white text-sm font-semibold shadow-md hover:bg-rose-700 active:scale-95 disabled:opacity-60 border border-rose-700/30"
                >
                  Girar
                </button>
              </div>
            </div>
            {/* Resultado ahora se muestra como overlay a pantalla completa */}
          </div>

          {/* Options editor */}
          <div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Añadir opción"
                className="input flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') addOption(); }}
              />
              <button className={`btn-primary ${options.length >= MAX_OPTIONS ? 'opacity-60 pointer-events-none' : ''}`} onClick={addOption} disabled={options.length >= MAX_OPTIONS}>Añadir</button>
            </div>
            {options.length < 2 && (
              <div className="mt-2 text-xs text-gray-500">Añade al menos dos opciones</div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className="chip pr-1"
                  style={{ backgroundColor: opt.color, borderColor: 'rgba(244, 63, 94, 0.2)' }}
                >
                  <span className="text-sm text-gray-900 truncate max-w-[40vw]">{opt.label}</span>
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label={`Eliminar ${opt.label}`}
                    className="ml-1 w-5 h-5 inline-flex items-center justify-center rounded-full text-rose-700 hover:bg-rose-100/80"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {options.length >= MAX_OPTIONS && (
              <div className="mt-2 text-xs text-gray-500">Máximo {MAX_OPTIONS} opciones</div>
            )}
          </div>
        </div>
      </div>
      {/* Full-screen result overlay with fireworks */}
      {showOverlay && (
        <>
          {/* Dim background below fireworks */}
          <div
            className="fixed inset-0 z-[10040] bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowOverlay(false);
              if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); overlayTimerRef.current = null; }
              setFireworksActive(false);
            }}
          />

          {/* Fireworks layer (pointer-events: none inside component) */}
          <HeartRainAnimation isActive={fireworksActive} type="fireworks" intensity={0.4} effectOpacity={0.55} zIndex={10045} />

          {/* Result card above everything */}
          <div
            className="fixed inset-0 z-[10070] flex items-center justify-center"
            style={{ zIndex: 10070 }}
            onClick={() => {
              setShowOverlay(false);
              if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); overlayTimerRef.current = null; }
              setFireworksActive(false);
            }}
          >
            <div
              className="relative px-6 py-5 rounded-2xl bg-white/10 border border-white/20 text-white text-center shadow-2xl max-w-[85vw]"
              onClick={() => {
                setShowOverlay(false);
                if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); overlayTimerRef.current = null; }
                setFireworksActive(false);
              }}
            >
              <div className="text-xs uppercase tracking-wide text-white/80 mb-1">Resultado</div>
              <div className="font-extrabold text-3xl sm:text-4xl drop-shadow-lg">{resultLabel}</div>
              <div className="mt-2 text-white/70 text-xs">toca para cerrar</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
