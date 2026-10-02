import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import Modal from '../components/Modal';
import Sheet from '../components/Sheet';
import Button from '../components/Button';
import Field from '../components/Field';
import ViewSwitcher from '../components/ViewSwitcher';
import { listMusic, uploadMusic, deleteMusic, renameMusic, getOriginal, getSubtitles, uploadSubtitles } from '../lib/music';
import Icon from '../components/Icon';
import { fmtDuration, getTokensForCue, parseSubtitles } from '../lib/lyrics';
import './Music.css';

const WHO = { yo: '🫒', ella: '🍪' };
const VIZ_NAMES = ['Latido', 'Espiral', 'Onda'];

// Visual reads levels through Web Audio. The first time it opens, the <audio> is handed to the context for good, so
// from then on the song depends on the context staying awake (it is resumed when the page comes back). If on the
// iPhone that cuts the music with the screen locked, set this to false: Visual keeps moving at rest without the
// analyser and the element never leaves its native output
const VIZ_ANALYSER = true;

// Upload day of a row: «12 mar», with the year only when it is not this one
function fmtFecha(ms) {
  const d = new Date(ms);
  const otherYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(otherYear ? { year: 'numeric' } : {}) });
}

// Cover pairs of the prototype (Prototipo.dc.html, PH): the song id always picks the same one
const COVERS = [
  ['oklch(0.74 0.06 20)', 'oklch(0.58 0.05 300)'], ['oklch(0.62 0.05 240)', 'oklch(0.47 0.06 235)'],
  ['oklch(0.67 0.08 48)', 'oklch(0.55 0.07 40)'], ['oklch(0.71 0.05 120)', 'oklch(0.52 0.06 128)'],
  ['oklch(0.86 0.035 82)', 'oklch(0.73 0.05 70)'], ['oklch(0.33 0.04 270)', 'oklch(0.50 0.09 62)'],
  ['oklch(0.46 0.05 152)', 'oklch(0.36 0.04 140)'], ['oklch(0.91 0.01 240)', 'oklch(0.79 0.02 240)'],
  ['oklch(0.36 0.04 40)', 'oklch(0.63 0.11 62)'], ['oklch(0.81 0.05 230)', 'oklch(0.69 0.08 112)'],
  ['oklch(0.46 0.06 330)', 'oklch(0.61 0.05 22)'], ['oklch(0.71 0.015 60)', 'oklch(0.59 0.02 60)'],
  ['oklch(0.58 0.06 250)', 'oklch(0.74 0.05 80)'], ['oklch(0.78 0.04 30)', 'oklch(0.66 0.05 35)'],
  ['oklch(0.40 0.03 250)', 'oklch(0.30 0.03 250)'], ['oklch(0.83 0.05 95)', 'oklch(0.62 0.07 130)'],
  ['oklch(0.55 0.07 20)', 'oklch(0.42 0.05 10)'], ['oklch(0.88 0.02 60)', 'oklch(0.70 0.04 50)'],
];
function coverOf(id) {
  let h = 0;
  for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = COVERS[h % COVERS.length];
  return `linear-gradient(180deg, ${a} 0%, ${a} 54%, ${b} 64%, ${b} 100%)`;
}

// The visualizer paints with the theme's lacre. The canvas wants rgb, so one pixel turns the token into it
const ROSE = '244, 63, 94';
function lacreRgb(el) {
  try {
    const v = getComputedStyle(el).getPropertyValue('--lacre').trim();
    const probe = document.createElement('canvas');
    probe.width = 1; probe.height = 1;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (!v || !ctx) return ROSE;
    ctx.fillStyle = `rgb(${ROSE})`;
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `${d[0]}, ${d[1]}, ${d[2]}`;
  } catch { return ROSE; }
}

// Glyphs of the prototype that Icon lacks (previous/next track, lyrics), drawn the same way
function Glyph({ d }) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

function Eq({ on }) {
  return <span className={`musica-eq ${on ? 'on' : ''}`} aria-hidden="true"><span /><span /><span /></span>;
}

export default function Music() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMusicRoute = location.pathname === '/music';
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef(null);
  const [menu, setMenu] = useState(null); // the song whose options sheet is open
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, id: '', name: '' });
  // Subtitles state
  const subsInputRef = useRef(null);
  const [subsTargetId, setSubsTargetId] = useState('');
  const [subs, setSubs] = useState({ type: '', text: '', name: '', cues: [] });
  // Player state
  const audioRef = useRef(null);
  const lastRafSetRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const [player, setPlayer] = useState({ id: '', name: '', duration: 0 });
  const [audioUrl, setAudioUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState('lyrics'); // 'lyrics' | 'viz'
  const [closingSheet, setClosingSheet] = useState(false);
  const vizCanvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const vizRAFRef = useRef(0);
  const lastPosSyncRef = useRef(0);
  const [vizStyle, setVizStyle] = useState(0); // 0..2
  const [pageVisible, setPageVisible] = useState(() => {
    try { return document.visibilityState === 'visible'; } catch { return true; }
  });
  const [artworkUrl, setArtworkUrl] = useState('');

  useEffect(() => {
    const onVis = () => {
      try {
        const visible = document.visibilityState === 'visible';
        setPageVisible(visible);
        // Once Visual created the source, the song sounds through the context: wake it if the system suspended it
        const ctx = audioCtxRef.current;
        if (visible && ctx && ctx.state !== 'running' && ctx.state !== 'closed') { try { ctx.resume(); } catch {} }
      } catch {}
    };
    try { document.addEventListener('visibilitychange', onVis); } catch {}
    return () => { try { document.removeEventListener('visibilitychange', onVis); } catch {} };
  }, []);

  // Prepare PNG artwork from existing SVG so iOS can style system UI better
  useEffect(() => {
    let urlToRevoke = '';
    (async () => {
      try {
        if (artworkUrl) return; // already prepared
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/icon.svg';
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        // Draw a dark background to encourage iOS to choose light (white) control icons
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.fillRect(0, 0, size, size);
        // Center-fit SVG square on top
        ctx.drawImage(img, 0, 0, size, size);
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        if (blob) {
          const url = URL.createObjectURL(blob);
          urlToRevoke = url;
          setArtworkUrl(url);
        }
      } catch {}
    })();
    return () => {
      if (urlToRevoke) { try { URL.revokeObjectURL(urlToRevoke); } catch {} }
    };
  }, [artworkUrl]);

  function onSeekPointerDown() {
    isScrubbingRef.current = true;
  }

  function onSeekRelease(e) {
    const el = audioRef.current; if (!el) { isScrubbingRef.current = false; return; }
    const dur = isFinite(el.duration) ? el.duration : (player.duration || 0);
    const target = e && e.target;
    const raw = parseFloat((target && target.value) || `${currentTime || 0}`) || 0;
    const atSliderEnd = target && typeof target.max !== 'undefined' && parseFloat(target.value) >= parseFloat(target.max);
    // Stop scrubbing, then seek. Only snap to exact end if released at the slider's max.
    isScrubbingRef.current = false;
    if (dur > 0 && atSliderEnd) {
      seekTo(dur); // release exactly at end -> allow natural 'ended' and auto-next
    } else {
      seekTo(raw); // otherwise, stay where user released
    }
  }

  function onSeekCancel(e) {
    // Cancel should never trigger end-snap; just stop scrubbing and keep current raw value
    const target = e && e.target;
    const raw = parseFloat((target && target.value) || `${currentTime || 0}`) || 0;
    isScrubbingRef.current = false;
    seekTo(raw);
  }

  // Bottom sheet open/close with enter/exit animation
  const openSheet = () => {
    setClosingSheet(false);
    setExpanded(true);
    // Ensure AudioContext resumes on user gesture (needed on iOS)
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) { try { audioCtxRef.current = new Ctx(); } catch { return; } }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
    } catch {}
  };
  const closeSheet = () => {
    setClosingSheet(true);
    setTimeout(() => { setExpanded(false); setClosingSheet(false); }, 260);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const list = await listMusic(pairId, 200);
        if (!cancelled) setItems(list);
      } catch {
        // C18: before, a rejection was left uncaught and the list said it was empty
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (pairId) load();
    return () => { cancelled = true; };
  }, [pairId, reloadKey]);

  // Cleanup object URL on unmount or when switching track
  useEffect(() => {
    return () => { if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch {} } };
  }, [audioUrl]);

  // Attach timeupdate, ended (auto-next) and loadedmetadata listeners
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onEnd = () => {
      // If user scrubbed to the end, do NOT auto-advance
      if (isScrubbingRef.current) {
        setIsPlaying(false);
        return;
      }
      // Auto-advance to next track when one finishes naturally
      playNext(1);
    };
    const onMeta = () => {
      const d = Math.floor(el.duration || 0);
      if (d > 0) setPlayer(p => (p.duration && p.duration > 0 ? p : { ...p, duration: d }));
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setPositionState({
            duration: isFinite(el.duration) ? el.duration : (d || 0),
            playbackRate: el.playbackRate || 1,
            position: el.currentTime || 0,
          });
        } catch {}
      }
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    el.addEventListener('loadedmetadata', onMeta);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, [player.id, items]);

  // High-frequency clock for smoother word-level highlighting while playing
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const el = audioRef.current;
      if (el) {
        const now = el.currentTime || 0;
        // Avoid excessive re-rendering; update if changed by >= 0.03s (~33 fps)
        if (Math.abs(now - lastRafSetRef.current) >= 0.03) {
          lastRafSetRef.current = now;
          setCurrentTime(now);
        }
        // Sync Media Session position state ~4x/sec
        if ('mediaSession' in navigator) {
          const tnow = performance.now();
          if (tnow - lastPosSyncRef.current >= 250) {
            lastPosSyncRef.current = tnow;
            try {
              navigator.mediaSession.setPositionState({
                duration: isFinite(el.duration) ? el.duration : (player.duration || 0),
                playbackRate: el.playbackRate || 1,
                position: now,
              });
            } catch {}
          }
        }
      }
      if (isPlaying) raf = requestAnimationFrame(step);
    };
    if (isPlaying) raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [isPlaying]);

  // Setup analyser only when visualizer is open; tear down otherwise
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const wantViz = VIZ_ANALYSER && expanded && viewMode === 'viz' && pageVisible;
    if (wantViz) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) {
        try { audioCtxRef.current = new Ctx(); } catch { return; }
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
      try {
        const running = ctx && ctx.state === 'running';
        // Only create MediaElementSource when context is running to avoid iOS suppressing native audio
        if (running && !mediaSourceRef.current) {
          mediaSourceRef.current = ctx.createMediaElementSource(el);
          // From here on the source is the element's only output (it never plays directly again): wire it to
          // destination once and never unplug it
          mediaSourceRef.current.connect(ctx.destination);
        }
        if (!analyserRef.current) {
          analyserRef.current = ctx.createAnalyser();
          analyserRef.current.fftSize = 1024;
          analyserRef.current.smoothingTimeConstant = 0.85;
        }
        // The analyser is a branch that only reads levels; it does not go to destination
        if (mediaSourceRef.current) {
          try { mediaSourceRef.current.connect(analyserRef.current); } catch {}
        }
      } catch {}
    } else if (mediaSourceRef.current && analyserRef.current) {
      // Unplug only the branch: the song keeps sounding through destination
      try { mediaSourceRef.current.disconnect(analyserRef.current); } catch {}
    }
  }, [expanded, viewMode, player.id, pageVisible]);

  // When leaving /music, close any open UI (menus, modals, uploading banner, bottom sheet)
  useEffect(() => {
    if (!isMusicRoute) {
      setMenu(null);
      setRenaming(null);
      setDeleteConfirmation({ isOpen: false, id: '', name: '' });
      setUploading(false);
      if (expanded || closingSheet) { setExpanded(false); setClosingSheet(false); }
    }
  }, [isMusicRoute]);

  // Visualizer draw loop
  useEffect(() => {
    if (!expanded || viewMode !== 'viz') {
      if (vizRAFRef.current) cancelAnimationFrame(vizRAFRef.current);
      vizRAFRef.current = 0;
      return;
    }
    const canvas = vizCanvasRef.current;
    const ctx2d = canvas ? canvas.getContext('2d') : null;
    if (!ctx2d) return;
    const analyser = analyserRef.current;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    const rgb = lacreRgb(canvas);
    const draw = () => {
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 300;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // Measure audio level
      let level = 0.05;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        level = Math.min(0.6, 0.05 + rms * 2.0);
      }
      const t = performance.now() / 1000;
      ctx2d.clearRect(0, 0, w, h);
      switch (vizStyle % 3) {
        // 0) Original pulsing blob (layered radial gradients)
        case 0: {
          ctx2d.save();
          ctx2d.translate(w / 2, h / 2);
          const R = Math.min(w, h) * (0.35 + level * 0.3);
          for (let k = 0; k < 5; k++) {
            const angle = t * (0.1 + k * 0.03) + k;
            const r = R * (0.8 + 0.15 * Math.sin(angle * 3 + k));
            const grad = ctx2d.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
            grad.addColorStop(0, `rgba(${rgb}, 0.07)`);
            grad.addColorStop(1, `rgba(${rgb}, 0.00)`);
            ctx2d.rotate(0.15 + level * 0.2);
            ctx2d.fillStyle = grad;
            ctx2d.beginPath();
            ctx2d.arc(0, 0, r, 0, Math.PI * 2);
            ctx2d.fill();
          }
          ctx2d.restore();
          break;
        }
        // 1) Spiral arcs (semi-circles rotating)
        case 1: {
          ctx2d.save();
          ctx2d.translate(w / 2, h / 2);
          const R = Math.min(w, h) * (0.28 + 0.24 * level);
          for (let k = 0; k < 12; k++) {
            const a0 = t * (0.75 + k * 0.09) + k;
            const a1 = a0 + Math.PI * (0.6 + 0.25 * Math.sin(t * 1.1 + k));
            const r = R * (0.72 + 0.32 * Math.sin(t * 1.35 + k));
            ctx2d.strokeStyle = `rgba(${rgb}, ${0.08 + level * 0.16})`;
            ctx2d.lineWidth = 3;
            ctx2d.beginPath();
            ctx2d.arc(0, 0, r, a0, a1);
            ctx2d.stroke();
          }
          ctx2d.restore();
          break;
        }
        // 2) Radial waveform
        case 2: {
          ctx2d.save();
          ctx2d.translate(w / 2, h / 2);
          const baseR = Math.min(w, h) * 0.28;
          const scale = baseR * (0.15 + 0.35 * level);
          ctx2d.fillStyle = `rgba(${rgb}, 0.08)`;
          ctx2d.beginPath();
          const N = data ? data.length : 512;
          for (let i = 0; i < N; i++) {
            const ang = (i / N) * Math.PI * 2 + t * 0.2;
            const v = data ? (data[i] - 128) / 128 : Math.sin(i * 0.1 + t);
            const r = baseR + v * scale;
            const x = Math.cos(ang) * r;
            const y = Math.sin(ang) * r;
            if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
          }
          ctx2d.closePath();
          ctx2d.fill();
          ctx2d.restore();
          break;
        }
        default:
          break;
      }
      vizRAFRef.current = requestAnimationFrame(draw);
    };
    vizRAFRef.current = requestAnimationFrame(draw);
    return () => { if (vizRAFRef.current) cancelAnimationFrame(vizRAFRef.current); };
  }, [expanded, viewMode, vizStyle, player.id]);

  // Pick a random visualizer style on entering visualizer mode or track change
  useEffect(() => {
    if (expanded && viewMode === 'viz') {
      setVizStyle(Math.floor(Math.random() * 3));
    }
  }, [expanded, viewMode, player.id]);

  async function playItem(it) {
    try {
      // If same track, just toggle play/pause
      if (player.id && it.id === player.id) {
        togglePlay();
        return;
      }
      // Load blob (cached or remote) and create object URL
      const blob = await getOriginal(pairId, it.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch {}
      }
      if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch {} }
      setAudioUrl(url);
      setPlayer({ id: it.id, name: it.name || it.id, duration: it.duration || 0 });
      setCurrentTime(0);
      setIsPlaying(true);
      setSubs({ type: '', text: '', name: '', cues: [] });
      requestAnimationFrame(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.currentTime = 0;
          // Ensure AudioContext is running before playing (for viz WebAudio path)
          try {
            const ctx = audioCtxRef.current;
            if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
          } catch {}
          audioRef.current.play().catch(() => {});
        }
      });
    } catch {}
  }

  function togglePlay() {
    const el = audioRef.current; if (!el) return;
    if (isPlaying) { try { el.pause(); } catch {} setIsPlaying(false); }
    else {
      // Resume AudioContext on user gesture to allow WebAudio path
      try {
        const ctx = audioCtxRef.current;
        if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
      } catch {}
      try { el.play(); setIsPlaying(true); } catch {}
    }
  }

  function seekTo(v) {
    const el = audioRef.current; if (!el) return;
    try {
      const dur = isFinite(el.duration) ? el.duration : (player.duration || 0);
      let t = v;
      // While scrubbing, avoid hitting exact end to prevent 'ended' auto-next
      if (isScrubbingRef.current && dur > 0 && t >= dur) {
        t = Math.max(0, dur - 0.2);
      }
      el.currentTime = t;
      setCurrentTime(t);
    } catch {}
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setPositionState({
          duration: isFinite(el.duration) ? el.duration : (player.duration || 0),
          playbackRate: el.playbackRate || 1,
          position: (audioRef.current && audioRef.current.currentTime) || 0,
        });
      } catch {}
    }
  }

  function playNext(delta) {
    if (!player.id) return;
    const idx = items.findIndex(x => x.id === player.id);
    if (idx === -1) return;
    const nextIdx = (idx + delta + items.length) % items.length;
    const it = items[nextIdx];
    if (it) playItem(it);
  }

  // Media Session action handlers (iOS/Android lock screen controls)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try { ms.setActionHandler('play', async () => {
      const el = audioRef.current; if (!el) return;
      try { await el.play(); setIsPlaying(true); } catch {}
    }); } catch {}
    try { ms.setActionHandler('pause', () => {
      const el = audioRef.current; if (!el) return;
      try { el.pause(); setIsPlaying(false); } catch {}
    }); } catch {}
    try { ms.setActionHandler('seekto', (details) => {
      const el = audioRef.current; if (!el) return;
      const t = (details && typeof details.seekTime === 'number') ? details.seekTime : 0;
      if (details && details.fastSeek && typeof el.fastSeek === 'function') {
        try { el.fastSeek(t); } catch { try { el.currentTime = t; } catch {} }
      } else {
        try { el.currentTime = t; } catch {}
      }
      setCurrentTime(el.currentTime || 0);
    }); } catch {}
    try { ms.setActionHandler('seekbackward', (details) => {
      const el = audioRef.current; if (!el) return;
      const off = (details && details.seekOffset) || 10;
      try { el.currentTime = Math.max(0, (el.currentTime || 0) - off); } catch {}
      setCurrentTime(el.currentTime || 0);
    }); } catch {}
    try { ms.setActionHandler('seekforward', (details) => {
      const el = audioRef.current; if (!el) return;
      const off = (details && details.seekOffset) || 10;
      const dur = isFinite(el.duration) ? el.duration : (player.duration || 0);
      try { el.currentTime = Math.min(dur || 0, (el.currentTime || 0) + off); } catch {}
      setCurrentTime(el.currentTime || 0);
    }); } catch {}
    try { ms.setActionHandler('previoustrack', () => { playNext(-1); }); } catch {}
    try { ms.setActionHandler('nexttrack', () => { playNext(1); }); } catch {}
  }, [player.id, items.length]);

  // Media Session metadata on track change or artwork ready
  useEffect(() => {
    if (!('mediaSession' in navigator) || !player.id) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: player.name || 'Reproduciendo',
        artist: 'Nosotros',
        album: 'Relación',
        artwork: artworkUrl ? [
          { src: artworkUrl, sizes: '512x512', type: 'image/png' }
        ] : [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }
        ],
      });
    } catch {}
  }, [player.id, player.name, artworkUrl]);

  // Media Session playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'; } catch {}
  }, [isPlaying]);

  // Keep position state in sync when paused or when duration changes
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: isFinite(el.duration) ? el.duration : (player.duration || 0),
        playbackRate: el.playbackRate || 1,
        position: currentTime || 0,
      });
    } catch {}
  }, [currentTime, player.duration]);

  async function onSelect(e) {
    const list = Array.from(e.target.files || []);
    if (!list.length || !pairId) return;
    setUploading(true);
    try {
      const identity = localStorage.getItem('identity') || 'yo';
      for (const f of list) {
        const added = await uploadMusic(pairId, f, identity);
        setItems((prev) => [{ id: added.id, name: added.name, createdAt: added.createdAt, duration: added.duration || 0, identity }, ...prev]);
      }
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  function onDelete(id) {
    if (!pairId) return;
    const it = items.find(x => x.id === id);
    setMenu(null);
    setDeleteConfirmation({ isOpen: true, id, name: (it?.name || it?.id || '').toString() });
  }

  async function confirmDelete() {
    const { id } = deleteConfirmation;
    // Optimistic UI
    setItems((prev) => prev.filter((x) => x.id !== id));
    setDeleteConfirmation({ isOpen: false, id: '', name: '' });
    // Stop player if deleting current track
    if (player.id === id) {
      try { if (audioRef.current) audioRef.current.pause(); } catch {}
      setIsPlaying(false);
      setPlayer({ id: '', name: '', duration: 0 });
      setCurrentTime(0);
      try {
        if (audioRef.current) {
          audioRef.current.src = '';
        }
        if (audioUrl) { URL.revokeObjectURL(audioUrl); }
      } catch {}
      setAudioUrl('');
    }
    try { await deleteMusic(pairId, id); } catch {}
  }

  function cancelDelete() {
    setDeleteConfirmation({ isOpen: false, id: '', name: '' });
  }

  function onOpenMenu(item) {
    setMenu(item);
  }

  function onOpenRename(item) {
    setMenu(null);
    setRenaming({ id: item.id, name: item.name || '' });
  }

  function onOpenSubtitles(item) {
    setMenu(null);
    setSubsTargetId(item.id);
    requestAnimationFrame(() => { if (subsInputRef.current) subsInputRef.current.click(); });
  }

  async function onConfirmRename() {
    const id = renaming?.id;
    const name = (renaming?.name || '').trim();
    if (!id || !name) { setRenaming(null); return; }
    // Optimistic
    setItems(prev => prev.map(x => x.id === id ? { ...x, name } : x));
    try { await renameMusic(pairId, id, name); } catch {}
    setRenaming(null);
  }

  // Load subtitles for expanded player
  useEffect(() => {
    let cancelled = false;
    async function loadSubs() {
      if (expanded && player.id && pairId) {
        try {
          const s = await getSubtitles(pairId, player.id);
          if (!cancelled) setSubs({ ...s, cues: parseSubtitles(s.type, s.text) });
        } catch {}
      }
    }
    loadSubs();
    return () => { cancelled = true; };
  }, [expanded, player.id, pairId]);

  // Upload subtitles handler
  async function onSelectSubs(e) {
    const file = (e.target.files && e.target.files[0]) || null;
    if (!file || !subsTargetId) return;
    try {
      await uploadSubtitles(pairId, subsTargetId, file);
      if (player.id === subsTargetId) {
        const text = await file.text();
        const type = (file.name.split('.').pop() || 'txt').toLowerCase();
        setSubs({ type, text, name: file.name, cues: parseSubtitles(type, text) });
      }
    } finally {
      setSubsTargetId('');
      if (subsInputRef.current) subsInputRef.current.value = '';
    }
  }

  // Active subtitle cue and auto-scroll
  const activeCueIndex = useMemo(() => {
    const t = currentTime;
    const arr = subs.cues || [];
    if (!arr.length) return -1;
    // Linear scan is fine (few cues). Could be optimized with binary search if needed.
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (t + 0.01 >= c.start && t < c.end + 0.01) return i;
    }
    // If after last cue
    if (t >= arr[arr.length - 1].end) return arr.length - 1;
    return -1;
  }, [subs.cues, currentTime]);
  const cueRefs = useRef([]);
  useEffect(() => {
    if (!expanded) return;
    const el = cueRefs.current[activeCueIndex];
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    }
  }, [activeCueIndex, expanded]);

  const current = items.find((x) => x.id === player.id);
  const currentWho = current ? WHO[current.identity] : undefined;
  const hasCues = !!(subs.cues && subs.cues.length > 0);
  const pct = Math.max(0, Math.min(100, (player.duration ? (currentTime / player.duration) : 0) * 100));
  const pickFiles = () => uploadInputRef.current && uploadInputRef.current.click();
  const subtitle = loading ? 'Cargando canciones…'
    : uploading ? 'Subiendo…'
    : loadError ? 'No disponibles ahora'
    : items.length === 0 ? 'Ninguna todavía'
    : 'La lista de los dos';
  const optionRow = 'flex items-center gap-3.5 w-full min-h-14 px-3 rounded-2xl text-base font-medium text-left active:bg-sunk';

  return (
    // Margen propio de 16 px (§5.00). Fuera de /music no ocupa nada: solo quedan el <audio> y la píldora, en portales
    <div className={isMusicRoute ? 'flex flex-col pb-6' : undefined}>
      {isMusicRoute && (
        <header className="flex items-end justify-between gap-3 pt-1.5 pb-3.5 pl-5 pr-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="serif text-4xl leading-[1.05] font-normal tracking-[-0.01em]">Música</h1>
            <p className="text-sm text-ink-2">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1">
            {/* ↻: en la PWA de iPhone no hay otra forma de recargar (plan §0 nº 8, F1) */}
            <Button icon="recargar" label="Actualizar" title="Actualizar" onClick={() => window.location.reload()} />
            <Button icon="nuevo" onClick={pickFiles}>Añadir</Button>
          </div>
        </header>
      )}

      {isMusicRoute && (
        <input
          ref={uploadInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={onSelect}
          className="hidden"
        />
      )}

      {/* Hidden input for subtitles upload */}
      {isMusicRoute && (
        <input
          ref={subsInputRef}
          type="file"
          accept=".lrc,.srt,.vtt,.txt,text/plain"
          onChange={onSelectSubs}
          className="hidden"
        />
      )}

      {isMusicRoute && (
        <div className="flex flex-col gap-2.5 px-4">
          {uploading && (
            <div role="status" aria-label="Subiendo canción" className="musica-hueco flex items-center px-4 text-[15px] text-ink-2">
              Subiendo canción…
            </div>
          )}
          {loading ? (
            <div role="status" aria-label="Cargando canciones" className="flex flex-col gap-3 py-1.5">
              <span className="musica-hueco" />
              <span className="musica-hueco" />
              <span className="musica-hueco" />
            </div>
          ) : loadError ? (
            <section role="alert" className="flex flex-col items-center gap-2.5 p-6 rounded-hero bg-sunk text-center">
              <h2 className="text-[17px] font-semibold">No se pudieron cargar las canciones</h2>
              <Button variant="sec" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</Button>
            </section>
          ) : items.length === 0 ? (uploading ? null : (
            <section className="flex flex-col items-center gap-2.5 py-9 px-6 rounded-hero border-[1.5px] border-dashed border-line text-center">
              <h2 className="serif text-[26px] font-normal">Sin canciones aún</h2>
              <p className="text-[15px] text-ink-2 max-w-[260px] text-pretty">Añade la vuestra. Si tiene letra sincronizada, se verá mientras suena.</p>
              <Button size="m" onClick={pickFiles}>Añadir canción</Button>
            </section>
          )) : (
            <ul className="rounded-tarjeta bg-card border border-line overflow-hidden">
              {items.map((it, i) => {
                const isCurrent = it.id === player.id;
                const who = WHO[it.identity];
                return (
                  <li
                    key={it.id}
                    className={`musica-fila flex items-center gap-3 py-1.5 pl-2.5 pr-1 ${i ? 'border-t border-line' : ''} ${isCurrent ? 'bg-lacre-soft' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => { if (menu) return; playItem(it); }}
                      className="flex-1 min-w-0 flex items-center gap-3 min-h-14 text-left"
                    >
                      <span aria-hidden="true" className="musica-portada w-11 h-11 rounded-mini" style={{ background: coverOf(it.id) }} />
                      <span className="flex-1 min-w-0 flex flex-col gap-px">
                        <span className={`text-base font-semibold truncate ${isCurrent ? 'text-accent-ink' : 'text-ink'}`}>{it.name || it.id}</span>
                        {/* A9: no «Artista» (no existe); quién la subió, si se sabe, cuándo y cuánto dura */}
                        <span className="num text-[13px] text-ink-2 flex items-center gap-1.5">
                          {isCurrent && <Eq on={isPlaying} />}
                          {[who && `Subida por ${who}`, it.createdAt && fmtFecha(it.createdAt), fmtDuration(it.duration)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenMenu(it)}
                      aria-label="Más opciones"
                      className="w-11 h-11 rounded-full flex items-center justify-center text-ink-2 shrink-0 active:bg-sunk"
                    >
                      <Icon name="mas" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Options of one song (Musica-opciones.dc.html) */}
      <Sheet isOpen={isMusicRoute && !!menu} onClose={() => setMenu(null)} label={menu ? `Opciones de «${menu.name || menu.id}»` : undefined}>
        {menu && (
          <div className="flex flex-col px-3 pt-2.5 pb-[34px]">
            <button type="button" onClick={() => onOpenSubtitles(menu)} className={optionRow}>
              <Glyph d="M5 6h9M5 10h9M5 14h5M17 20v-8M14 15l3-3 3 3" />
              Subir letra (.lrc, .srt, .vtt)
            </button>
            <button type="button" onClick={() => onOpenRename(menu)} className={optionRow}>
              <Icon name="editar" />
              Cambiar nombre
            </button>
            <button type="button" onClick={() => onDelete(menu.id)} className={`${optionRow} text-danger`}>
              <Icon name="borrar" />
              Borrar canción
            </button>
          </div>
        )}
      </Sheet>

      {/* Rename */}
      <Sheet isOpen={isMusicRoute && !!renaming} onClose={() => setRenaming(null)}>
        {renaming && (
          <form className="flex flex-col gap-3.5 px-5 pt-3.5 pb-[34px]" onSubmit={(e) => { e.preventDefault(); onConfirmRename(); }}>
            <h2 className="serif text-[26px] font-normal">Cambiar nombre</h2>
            <Field
              label="Nombre"
              value={renaming.name}
              onChange={(e) => setRenaming(r => ({ ...r, name: e.target.value }))}
              placeholder="Nuevo nombre"
              enterKeyHint="done"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="sec" size="l" onClick={() => setRenaming(null)}>Cancelar</Button>
              <Button type="submit" size="l">Guardar</Button>
            </div>
          </form>
        )}
      </Sheet>

      {/* Delete confirmation */}
      <Sheet isOpen={isMusicRoute && deleteConfirmation.isOpen} onClose={cancelDelete}>
        <div className="flex flex-col gap-1.5 px-5 pt-3.5 pb-[34px]">
          <div className="flex items-center gap-3.5 pb-2.5">
            <span aria-hidden="true" className="musica-portada w-14 h-14 rounded-mini" style={{ background: coverOf(deleteConfirmation.id) }} />
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <h2 className="serif text-2xl leading-[1.15] font-normal">¿Borrar esta canción?</h2>
              {deleteConfirmation.name && <p className="text-sm font-semibold truncate">{deleteConfirmation.name}</p>}
              <p className="text-sm text-ink-2">Desaparece de la lista de los dos.</p>
            </div>
          </div>
          <Button variant="dan" size="l" onClick={confirmDelete}>Borrar canción</Button>
          <Button variant="txt" size="l" onClick={cancelDelete}>Cancelar</Button>
        </div>
      </Sheet>

      {/* Mini-player above the tab bar, only on /music (Q6). Not on --shell-bottom, which rises over the notice: here
          the notice goes above the mini-player instead (.con-mini .avisos), so this keeps the tab bar plus 12 px */}
      {isMusicRoute && player.id && !expanded && (
        <div
          className="fixed z-40 left-3 right-3 mx-auto h-[60px] rounded-tarjeta bg-card border border-line shadow-flota flex items-center gap-3 pl-2.5 pr-1.5"
          style={{ bottom: 'calc(var(--navbar-height) + env(safe-area-inset-bottom, 0px) + 12px)', maxWidth: 'calc(48rem - 24px)' }}
        >
          <span aria-hidden="true" className="musica-portada w-10 h-10 rounded-mini" style={{ background: coverOf(player.id) }} />
          <button
            type="button"
            onClick={openSheet}
            aria-label={`Abrir el reproductor: ${player.name}`}
            className="flex-1 min-w-0 min-h-[52px] flex flex-col justify-center gap-0.5 text-left"
          >
            <span className="text-[15px] font-semibold truncate">{player.name}</span>
            <span className="num text-[13px] text-ink-2 flex items-center gap-1.5">
              <Eq on={isPlaying} />{fmtDuration(currentTime)} / {fmtDuration(player.duration)}
            </span>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 active:bg-sunk"
          >
            {isPlaying ? <Icon name="pausa" /> : <Icon name="play" filled />}
          </button>
        </div>
      )}

      {/* Pill next to the ⚙ of MarcaSuperior on the other screens, while a song is loaded (Q6, F5). It looks 32 px
          tall; the ::before stretches the touch to 44 */}
      {!isMusicRoute && player.id && createPortal(
        <button
          type="button"
          onClick={() => navigate('/music')}
          className="fixed z-30 top-[calc(env(safe-area-inset-top)+6px)] right-16 h-8 max-w-[48vw] px-3 rounded-full border border-line bg-card/90 backdrop-blur-sm text-[13px] font-medium text-ink shadow-carta flex items-center gap-1.5 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']"
          aria-label="Ir a Música"
          title="Ir a Música"
        >
          <span aria-hidden="true" className="text-accent-ink">♪</span>
          <span className="truncate">{player.name}</span>
        </button>,
        document.body
      )}

      {/* Fullscreen player (bottom sheet, Reproductor.dc.html) */}
      <Modal isOpen={expanded || closingSheet} onClose={closeSheet} bare backdropClosing={closingSheet}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reproductor"
          className={`reproductor absolute inset-x-0 bottom-0 max-w-lg mx-auto bg-card text-ink rounded-t-hoja shadow-hoja flex flex-col items-center gap-3.5 px-6 pt-2 ${closingSheet ? 'animate-bottom-sheet-out' : 'animate-bottom-sheet-in'}`}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={closeSheet} aria-label="Cerrar reproductor" className="w-[88px] h-11 -my-2 flex items-center justify-center shrink-0">
            <span aria-hidden="true" className="block w-9 h-[5px] rounded-full bg-line" />
          </button>
          <span
            aria-hidden="true"
            className="musica-portada rounded-hero shadow-flota"
            style={{ width: 'min(196px, 22dvh)', height: 'min(196px, 22dvh)', background: coverOf(player.id) }}
          />
          <div className="flex flex-col items-center gap-0.5 max-w-full text-center">
            <h2 className="serif text-[26px] leading-tight font-normal max-w-full truncate">{player.name}</h2>
            <p className="text-sm text-ink-2">{currentWho ? `Subida por ${currentWho}` : 'La lista de los dos'}</p>
          </div>
          <div className="w-[220px] shrink-0">
            <ViewSwitcher views={['lyrics', 'viz']} activeView={viewMode} onChange={setViewMode} labels={{ lyrics: 'Letra', viz: 'Visual' }} />
          </div>

          <div className="flex-1 min-h-0 w-full flex flex-col">
            {viewMode === 'lyrics' ? (
              hasCues ? (
                <>
                  {/* F12: la letra entera con auto-scroll y karaoke palabra a palabra, no el recorte a 3 líneas */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-6">
                    {subs.cues.map((c, i) => {
                      const isActive = i === activeCueIndex;
                      return (
                        <div
                          key={`${c.start}-${i}`}
                          ref={(el) => { cueRefs.current[i] = el; }}
                          onClick={() => seekTo(c.start)}
                          className={`px-2 py-1.5 rounded-xl text-center cursor-pointer select-none text-balance transition-colors ${isActive ? 'text-[21px] leading-snug font-semibold text-ink' : 'text-[17px] text-ink-2'}`}
                        >
                          {c.tokens && c.tokens.length > 0 ? (
                            c.tokens.map((t, j) => {
                              const tokActive = currentTime + 0.01 >= t.start && currentTime < t.end + 0.01;
                              return (
                                <span
                                  key={`t-${i}-${j}-${t.start}`}
                                  onClick={(e) => { e.stopPropagation(); seekTo(t.start); }}
                                  className={`musica-kw ${tokActive ? 'now' : ''}`}
                                >
                                  {t.text}
                                </span>
                              );
                            })
                          ) : (
                            c.text
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="etiqueta text-center pt-2">Toca una línea para saltar ahí</p>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center px-4">
                  <p className="text-[17px] font-semibold text-ink">Sin letra todavía</p>
                  <p className="text-sm text-ink-2 max-w-[280px] text-pretty">Súbela desde ⋯ en la lista, con «Subir letra». Vale un .lrc, .srt o .vtt.</p>
                </div>
              )
            ) : (
              <>
                {/* F11: el lienzo con Web Audio y sus 3 efectos; solo cambian los colores (lacre del tema) */}
                <div className="relative flex-1 min-h-0 flex items-center justify-center">
                  <canvas ref={vizCanvasRef} className="absolute inset-0 w-full h-full" style={{ filter: 'blur(2px)' }} />
                  {hasCues && (() => {
                    const c = subs.cues[activeCueIndex] || null;
                    const tokens = getTokensForCue(c);
                    const visible = tokens.filter((t) => t.start <= currentTime);
                    return (
                      <div className="relative z-10 text-center px-4">
                        <div className="text-[28px] leading-tight font-semibold text-ink text-balance">
                          {visible.length > 0 ? visible.map((t, j) => {
                            const tokActive = currentTime + 0.01 >= t.start && currentTime < t.end + 0.01;
                            return (
                              <span key={`vz-${j}-${t.start}`} className={tokActive ? 'text-accent-ink' : ''}>
                                {t.text}
                              </span>
                            );
                          }) : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <Button variant="sec" className="self-center mt-2 shrink-0" onClick={() => setVizStyle((s) => (s + 1) % 3)} title="Cambiar efecto">
                  Cambiar efecto · {VIZ_NAMES[vizStyle % 3]}
                </Button>
              </>
            )}
          </div>

          <div className="w-full flex flex-col gap-1 shrink-0">
            {/* A6: el mismo range con sus handlers; solo cambia el estilo (.reproductor .progress-range, Music.css) */}
            <input
              type="range"
              aria-label="Posición en la canción"
              min={0}
              max={Math.max(1, player.duration || 0)}
              step={0.1}
              value={Math.min(player.duration || 0, currentTime)}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              onInput={(e) => seekTo(parseFloat(e.target.value))}
              onPointerDown={onSeekPointerDown}
              onPointerUp={onSeekRelease}
              onPointerCancel={onSeekCancel}
              onMouseDown={onSeekPointerDown}
              onMouseUp={onSeekRelease}
              onTouchStart={onSeekPointerDown}
              onTouchEnd={onSeekRelease}
              onTouchCancel={onSeekCancel}
              className="w-full progress-range"
              style={{ ['--pct']: `${pct}%` }}
            />
            <div className="num flex justify-between text-xs text-ink-2">
              <span>{fmtDuration(currentTime)}</span>
              <span>{fmtDuration(player.duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-7 shrink-0">
            <button type="button" onClick={() => playNext(-1)} aria-label="Anterior" className="w-[52px] h-[52px] rounded-full flex items-center justify-center active:bg-sunk">
              <Glyph d="M6 5v14M18 5.5v13L9 12z" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              className="w-[72px] h-[72px] rounded-full bg-ink text-paper flex items-center justify-center transition-transform active:scale-95"
            >
              {isPlaying ? <Icon name="pausa" size={28} /> : <Icon name="play" size={28} filled />}
            </button>
            <button type="button" onClick={() => playNext(1)} aria-label="Siguiente" className="w-[52px] h-[52px] rounded-full flex items-center justify-center active:bg-sunk">
              <Glyph d="M18 5v14M6 5.5v13l9-6.5z" />
            </button>
          </div>
        </div>
      </Modal>

      {/* Hidden audio element */}
      {createPortal(
        <audio ref={audioRef} preload="auto" playsInline />,
        document.body
      )}
    </div>
  );
}
