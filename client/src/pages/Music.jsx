import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../components/Modal';
import { listMusic, uploadMusic, deleteMusic, renameMusic, getOriginal, getSubtitles, uploadSubtitles } from '../lib/music';
import TrashIcon from '../components/icons/TrashIcon';

export default function Music() {
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef(null);
  const [menu, setMenu] = useState(null); // { id, rect }
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, id: '', name: '' });
  // Subtitles state
  const subsInputRef = useRef(null);
  const [subsTargetId, setSubsTargetId] = useState('');
  const [subs, setSubs] = useState({ type: '', text: '', name: '', cues: [] });
  // Player state
  const audioRef = useRef(null);
  const lastRafSetRef = useRef(0);
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
  const vizGainRef = useRef(null);
  const [vizStyle, setVizStyle] = useState(0); // 0..2

  function fmtDuration(secs) {
    const s = Math.max(0, Math.floor(secs || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }
  function getTokensForCue(c) {
    if (!c) return [];
    if (c.tokens && c.tokens.length) return c.tokens;
    // Fallback: evenly distribute words across cue duration
    const dur = Math.max(0.2, (c.end || (c.start + 2)) - c.start);
    const parts = (c.text || '').split(/(\s+)/); // keep spaces
    const words = parts.filter((p) => p.length > 0);
    const step = dur / Math.max(1, words.length);
    let t = c.start;
    return words.map((w) => {
      const tok = { start: t, end: t + step, text: w };
      t += step;
      return tok;
    });
  }

  // Bottom sheet open/close with enter/exit animation
  const openSheet = () => { setClosingSheet(false); setExpanded(true); };
  const closeSheet = () => {
    setClosingSheet(true);
    setTimeout(() => { setExpanded(false); setClosingSheet(false); }, 260);
  };

  // Simple subtitle parsers
  function parseTimeStamp(ts) {
    // supports mm:ss.xx, hh:mm:ss,ms or hh:mm:ss.ms
    if (!ts) return 0;
    const t = ts.trim();
    if (/^\d{1,2}:\d{2}(?:[\.:]\d{1,3})?$/.test(t)) {
      const [m, s] = t.split(':');
      const [sec, frac = '0'] = s.split(/[\.:]/);
      return (+m) * 60 + (+sec) + (+(`0.${frac}`));
    }
    const m = t.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[\.,](\d{1,3}))?/);
    if (m) {
      const hh = +(m[1] || 0), mm = +m[2], ss = +m[3], ms = +(m[4] || 0);
      return hh * 3600 + mm * 60 + ss + (ms / 1000);
    }
    return 0;
  }
  function parseLRC(text) {
    const lines = (text || '').split(/\r?\n/);
    const cues = [];
    for (const ln of lines) {
      // Find line timestamps like [mm:ss.xx]
      const lineTags = Array.from(ln.matchAll(/\[(\d{1,2}:\d{2}(?:[\.:]\d{1,2})?)\]/g));
      const content = ln.replace(/^(?:\[[^\]]+\])+\s*/, '');

      // Enhanced LRC per-word tokens like <mm:ss.xx>
      const tokenMatches = Array.from(content.matchAll(/<(\d{1,2}:\d{2}(?:[\.:]\d{1,2})?)>/g));
      if (tokenMatches.length > 0) {
        const tokens = [];
        // If there is leading text before the first <time> token, create a token for it using the line timestamp
        const firstMatch = tokenMatches[0];
        if (firstMatch && firstMatch.index > 0) {
          const leadText = content.slice(0, firstMatch.index);
          const lineStart = lineTags[0] ? parseTimeStamp(lineTags[0][1]) : parseTimeStamp(firstMatch[1]);
          tokens.push({ start: lineStart, end: Infinity, text: leadText });
        }
        for (let i = 0; i < tokenMatches.length; i++) {
          const m = tokenMatches[i];
          const start = parseTimeStamp(m[1]);
          const startIdx = m.index + m[0].length;
          const endIdx = (i + 1 < tokenMatches.length) ? tokenMatches[i + 1].index : content.length;
          const textChunk = content.slice(startIdx, endIdx);
          tokens.push({ start, end: Infinity, text: textChunk });
        }
        const firstStart = tokens.length ? tokens[0].start : (lineTags[0] ? parseTimeStamp(lineTags[0][1]) : 0);
        cues.push({ start: firstStart, end: Infinity, text: content.replace(/<\d{1,2}:\d{2}(?:[\.:]\d{1,2})?>/g, ''), tokens });
        continue;
      }

      // Regular line-level LRC
      for (const tg of lineTags) {
        const start = parseTimeStamp(tg[1]);
        cues.push({ start, end: Infinity, text: content });
      }
    }
    cues.sort((a, b) => a.start - b.start);
    for (let i = 0; i < cues.length; i++) {
      const nextStart = (i + 1 < cues.length) ? cues[i + 1].start : Infinity;
      cues[i].end = Math.max(cues[i].start, (isFinite(nextStart) ? nextStart - 0.01 : cues[i].start + 3600));
      if (cues[i].tokens && cues[i].tokens.length) {
        const toks = cues[i].tokens;
        toks.sort((a, b) => a.start - b.start);
        for (let j = 0; j < toks.length; j++) {
          const tNext = (j + 1 < toks.length) ? toks[j + 1].start : cues[i].end;
          toks[j].end = Math.max(toks[j].start, tNext - 0.01);
        }
      }
    }
    return cues;
  }
  function parseSRTorVTT(text) {
    const cues = [];
    const norm = (text || '').replace(/\r/g, '').replace(/^WEBVTT.*?\n\n/, '');
    const blocks = norm.split(/\n\n+/);
    for (const b of blocks) {
      const lines = b.split(/\n/).filter(Boolean);
      if (!lines.length) continue;
      const timeIdx = lines[0].includes('-->') ? 0 : 1;
      const timeLine = lines[timeIdx] || '';
      const m = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[\.,]\d{1,3}|\d{1,2}:\d{2}[\.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[\.,]\d{1,3}|\d{1,2}:\d{2}[\.,]\d{1,3})/);
      if (!m) continue;
      const start = parseTimeStamp(m[1]);
      const end = parseTimeStamp(m[2]);
      const content = lines.slice(timeIdx + 1).join('\n').trim();
      cues.push({ start, end, text: content });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }
  function parseSubtitles(type, text) {
    const ext = (type || '').toLowerCase();
    if (ext === 'lrc') return parseLRC(text);
    if (ext === 'srt' || ext === 'vtt') return parseSRTorVTT(text);
    // Fallback: split lines
    return (text || '').split(/\r?\n/).filter(Boolean).map((t, i) => ({ start: i * 3, end: (i + 1) * 3, text: t }));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const list = await listMusic(pairId, 200);
        if (!cancelled) setItems(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (pairId) load();
    return () => { cancelled = true; };
  }, [pairId]);

  // Cleanup object URL on unmount or when switching track
  useEffect(() => {
    return () => { if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch {} } };
  }, [audioUrl]);

  // Attach timeupdate and ended listeners
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onEnd = () => setIsPlaying(false);
    const onMeta = () => {
      const d = Math.floor(el.duration || 0);
      if (d > 0) setPlayer(p => (p.duration && p.duration > 0 ? p : { ...p, duration: d }));
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    el.addEventListener('loadedmetadata', onMeta);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

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
      }
      if (isPlaying) raf = requestAnimationFrame(step);
    };
    if (isPlaying) raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [isPlaying]);

  // Setup analyser for visualizer (connect once per audio element)
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    let mounted = true;
    const ensureAudioCtx = () => {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      return audioCtxRef.current;
    };
    const onPlay = () => {
      const ctx = ensureAudioCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && !mediaSourceRef.current) {
        try {
          mediaSourceRef.current = ctx.createMediaElementSource(el);
          analyserRef.current = ctx.createAnalyser();
          analyserRef.current.fftSize = 1024;
          analyserRef.current.smoothingTimeConstant = 0.85;
          vizGainRef.current = ctx.createGain();
          vizGainRef.current.gain.value = 1.0; // route audio through graph so it is audible
          mediaSourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(vizGainRef.current);
          vizGainRef.current.connect(ctx.destination);
        } catch {}
      }
    };
    el.addEventListener('play', onPlay);
    return () => {
      mounted = false;
      el.removeEventListener('play', onPlay);
    };
  }, []);

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
            grad.addColorStop(0, 'rgba(244, 63, 94, 0.07)');
            grad.addColorStop(1, 'rgba(244, 63, 94, 0.00)');
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
            ctx2d.strokeStyle = `rgba(244, 63, 94, ${0.08 + level * 0.16})`;
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
          ctx2d.fillStyle = 'rgba(244, 63, 94, 0.08)';
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
  }, [expanded, viewMode, vizStyle]);

  // Pick a random visualizer style on entering visualizer mode
  useEffect(() => {
    if (expanded && viewMode === 'viz') {
      setVizStyle(Math.floor(Math.random() * 3));
    }
  }, [expanded, viewMode]);

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
          audioRef.current.play().catch(() => {});
        }
      });
    } catch {}
  }

  function togglePlay() {
    const el = audioRef.current; if (!el) return;
    if (isPlaying) { try { el.pause(); } catch {} setIsPlaying(false); }
    else { try { el.play(); setIsPlaying(true); } catch {} }
  }

  function seekTo(v) {
    const el = audioRef.current; if (!el) return;
    try { el.currentTime = v; setCurrentTime(v); } catch {}
  }

  function playNext(delta) {
    if (!player.id) return;
    const idx = items.findIndex(x => x.id === player.id);
    if (idx === -1) return;
    const nextIdx = (idx + delta + items.length) % items.length;
    const it = items[nextIdx];
    if (it) playItem(it);
  }

  async function onSelect(e) {
    const list = Array.from(e.target.files || []);
    if (!list.length || !pairId) return;
    setUploading(true);
    try {
      for (const f of list) {
        const added = await uploadMusic(pairId, f, localStorage.getItem('identity') || 'yo');
        setItems((prev) => [{ id: added.id, name: added.name, createdAt: added.createdAt, duration: added.duration || 0 }, ...prev]);
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

  function onOpenMenu(e, id) {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ id, rect });
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

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-rose-600">Música</h2>
        <button
          onClick={() => window.location.reload()}
          aria-label="Actualizar"
          title="Actualizar"
          className="p-2 rounded-lg hover:bg-rose-50 text-rose-600"
        >
          <span className="text-xl leading-none">↻</span>
        </button>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={onSelect}
        className="hidden"
      />

      {createPortal(
        <button
          className="fab btn-primary shadow-lg rounded-full px-5 py-3 font-semibold"
          style={player.id ? { bottom: 'calc(8rem + env(safe-area-inset-bottom) + 0.5rem)' } : undefined}
          onClick={() => uploadInputRef.current && uploadInputRef.current.click()}
          aria-label="Nueva canción"
          title="Nueva canción"
        >
          Nueva canción
        </button>,
        document.body
      )}

      {/* Hidden input for subtitles upload */}
      <input
        ref={subsInputRef}
        type="file"
        accept=".lrc,.srt,.vtt,.txt,text/plain"
        onChange={onSelectSubs}
        className="hidden"
      />

      {uploading && (
        <div className="fixed bottom-40 right-5 z-40 text-xs text-gray-700 bg-white/80 px-2 py-1 rounded-md shadow">
          Subiendo…
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-500">No hay canciones aún.</div>
      ) : (
        <ul className="divide-y divide-rose-100 rounded-xl overflow-hidden border border-rose-100 bg-white">
          {items.map((it) => (
            <li key={it.id} className="px-4 py-3 flex items-center justify-between relative cursor-pointer" onClick={() => { if (menu) return; playItem(it); }}>
              <div className="min-w-0 pr-3">
                <div className="text-sm font-medium text-gray-900 truncate">{it.name || it.id}</div>
                <div className="text-xs text-gray-500">
                  {fmtDuration(it.duration)}
                  <span className="mx-1">•</span>
                  {new Date(it.createdAt || Date.now()).toLocaleString()}
                </div>
              </div>
              <div className="shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenMenu(e, it.id); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="p-2 rounded-md hover:bg-rose-50"
                  aria-label="Más opciones"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM12 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM12 20.25a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                  </svg>
                </button>
              </div>
              {menu?.id === it.id && (
                <>
                  {createPortal(
                    <button className="fixed inset-0 z-[95] cursor-default" onClick={() => setMenu(null)} aria-hidden="true" />, document.body
                  )}
                  {createPortal(
                    (() => {
                      const rect = menu.rect;
                      const gap = 8;
                      const estimatedH = 140; // ~three options
                      const width = 176;
                      const preferUp = (window.innerHeight - rect.bottom) < (estimatedH + gap);
                      const top = preferUp ? Math.max(8, rect.top - estimatedH - gap) : Math.min(window.innerHeight - estimatedH - 8, rect.bottom + gap);
                      const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width));
                      return (
                        <div
                          className="z-[100] w-44 bg-white border border-rose-100 rounded-lg shadow-lg overflow-hidden fixed"
                          style={{ top, left }}
                        >
                          <button
                            onClick={() => onOpenRename(it)}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-rose-50"
                          >
                            Cambiar nombre
                          </button>
                          <button
                            onClick={() => onOpenSubtitles(it)}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-rose-50"
                          >
                            Subir subtítulos
                          </button>
                          <button
                            onClick={() => onDelete(it.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                          >
                            <TrashIcon className="w-4 h-4" />
                            Borrar
                          </button>
                        </div>
                      );
                    })(),
                    document.body
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Rename modal */}
      {renaming && createPortal(
        <>
          <div className="fixed inset-0 z-[80] bg-black/20" onClick={() => setRenaming(null)} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-rose-100 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Cambiar nombre</h3>
              <input
                autoFocus
                type="text"
                value={renaming.name}
                onChange={(e) => setRenaming(r => ({ ...r, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') onConfirmRename(); }}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300"
                placeholder="Nuevo nombre"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button className="px-3 py-2 text-sm rounded-lg hover:bg-gray-50" onClick={() => setRenaming(null)}>Cancelar</button>
                <button className="px-3 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700" onClick={onConfirmRename}>Guardar</button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Delete confirmation modal (reuse Notes style) */}
      <Modal isOpen={deleteConfirmation.isOpen} onClose={cancelDelete}>
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">🗑️</div>
          <h3 className="text-lg font-semibold mb-2">Borrar canción</h3>
          <p className="text-gray-600 mb-6">¿Seguro que quieres borrar esta canción?</p>
          {deleteConfirmation.name && (
            <div className="text-xs text-gray-500 mb-6 line-clamp-3">“{deleteConfirmation.name}”</div>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={cancelDelete} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Borrar</button>
          </div>
        </div>
      </Modal>

      {/* Mini-player fixed above navbar */}
      {player.id && !expanded && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{ bottom: `calc(4rem + env(safe-area-inset-bottom))` }}
        >
          <div
            className="mx-3 mb-3 rounded-xl border border-rose-100 shadow-lg bg-white/95 backdrop-blur px-3 py-2 flex items-center gap-3"
            onClick={openSheet}
          >
            <span className="text-rose-600 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M4.5 15.75l7.5-7.5 7.5 7.5"/></svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 truncate">{player.name}</div>
              <div className="text-xs text-gray-500">{fmtDuration(currentTime)} / {fmtDuration(player.duration)}</div>
            </div>
            <button
              className="p-2 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M6.75 5.25h3v13.5h-3zM14.25 5.25h3v13.5h-3z"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M5.25 4.5v15l13.5-7.5-13.5-7.5z"/></svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen player (bottom sheet) */}
      <Modal isOpen={expanded || closingSheet} onClose={closeSheet} bare backdropClosing={closingSheet}>
        <div
          className={`absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col ${closingSheet ? 'animate-bottom-sheet-out' : 'animate-bottom-sheet-in'}`}
          style={{ height: 'min(96vh, 96dvh)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-rose-100 flex items-center justify-between rounded-t-2xl">
            <button className="btn-ghost" onClick={closeSheet} aria-label="Cerrar">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 16l6-6H6l6 6z"/></svg>
            </button>
            <div className="font-semibold text-gray-900 truncate text-center flex-1">{player.name}</div>
            <span className="w-6" />
          </div>
          {/* View switcher */}
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-lg border border-rose-200 overflow-hidden">
                <button
                  className={`px-3 py-1.5 text-sm ${viewMode === 'lyrics' ? 'bg-rose-100 text-rose-700' : 'bg-white text-gray-700'}`}
                  onClick={() => setViewMode('lyrics')}
                >
                  Letra
                </button>
                <button
                  className={`px-3 py-1.5 text-sm ${viewMode === 'viz' ? 'bg-rose-100 text-rose-700' : 'bg-white text-gray-700'}`}
                  onClick={() => setViewMode('viz')}
                >
                  Visualizador
                </button>
              </div>
              {viewMode === 'viz' && (
                <button
                  className="ml-3 px-3 py-1.5 text-sm bg-white text-gray-700 border border-rose-200 rounded-lg hover:bg-rose-50"
                  onClick={() => setVizStyle((s) => (s + 1) % 3)}
                  aria-label="Cambiar efecto"
                  title="Cambiar efecto"
                >
                  🎲 Cambiar
                </button>
              )}
            </div>
          </div>

          <div className="p-4 flex-1 overflow-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
            {viewMode === 'lyrics' ? (
              subs.cues && subs.cues.length > 0 ? (
                <div className="space-y-1">
                  {subs.cues.map((c, i) => {
                    const isActive = i === activeCueIndex;
                    return (
                      <div
                        key={`${c.start}-${i}`}
                        ref={(el) => (cueRefs.current[i] = el)}
                        onClick={() => seekTo(c.start)}
                        className={`text-sm cursor-pointer select-none transition-colors ${isActive ? 'bg-rose-50 text-rose-800 rounded px-2 py-1' : 'text-gray-800 hover:text-gray-900'}`}
                      >
                        {c.tokens && c.tokens.length > 0 ? (
                          c.tokens.map((t, j) => {
                            const tokActive = currentTime + 0.01 >= t.start && currentTime < t.end + 0.01;
                            return (
                              <span
                                key={`t-${i}-${j}-${t.start}`}
                                onClick={(e) => { e.stopPropagation(); seekTo(t.start); }}
                                className={`${tokActive ? 'text-rose-600 font-semibold' : ''}`}
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
              ) : (
                <div className="text-sm text-gray-500">
                  Sin subtítulos todavía. Usa “Subir subtítulos” en el menú de cada canción para cargar un archivo .lrc/.srt/.vtt.
                </div>
              )
            ) : (
              // Visualizer view
              subs.cues && subs.cues.length > 0 ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <canvas ref={vizCanvasRef} className="absolute inset-0 w-full h-full" style={{ filter: 'blur(2px)' }} />
                  {(() => {
                    const c = subs.cues[activeCueIndex] || null;
                    const tokens = getTokensForCue(c);
                    const visible = tokens.filter((t) => t.start <= currentTime);
                    return (
                      <div className="relative z-10 text-center px-4">
                        <div className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-wide text-gray-900">
                          {visible.length > 0 ? visible.map((t, j) => {
                            const tokActive = currentTime + 0.01 >= t.start && currentTime < t.end + 0.01;
                            return (
                              <span key={`vz-${j}-${t.start}`} className={tokActive ? 'text-rose-600' : ''}>
                                {t.text}
                              </span>
                            );
                          }) : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  Sin subtítulos todavía. Usa “Subir subtítulos” en el menú de cada canción para cargar un archivo .lrc/.srt/.vtt.
                </div>
              )
            )}
          </div>
          <div className="p-4 border-t border-rose-100 bg-white" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
            <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
              <span>{fmtDuration(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(1, player.duration || 0)}
                step={0.1}
                value={Math.min(player.duration || 0, currentTime)}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="flex-1 accent-rose-600"
              />
              <span>{fmtDuration(player.duration)}</span>
            </div>
            <div className="flex items-center justify-center gap-6">
              <button className="btn-ghost" onClick={() => playNext(-1)} aria-label="Anterior">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M16.5 5.25h2.25v13.5H16.5zM3 12l12 6.75V5.25L3 12z"/></svg>
              </button>
              <button className="btn-primary rounded-full w-12 h-12" onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M7.5 5.25h3v13.5h-3zM13.5 5.25h3v13.5h-3z"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M6.75 4.5v15l12-7.5-12-7.5z"/></svg>
                )}
              </button>
              <button className="btn-ghost" onClick={() => playNext(1)} aria-label="Siguiente">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M7.5 5.25h2.25v13.5H7.5zM21 12 9 5.25v13.5L21 12z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Hidden audio element */}
      {createPortal(
        <audio ref={audioRef} preload="auto" />,
        document.body
      )}

      {/* Spacer so list doesn't go under mini-player */}
      <div style={{ height: player.id ? 96 : 0 }} />
    </div>
  );
}
